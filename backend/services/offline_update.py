from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.config import get_settings
from backend.version import APP_REPOSITORY, APP_VERSION


class OfflineUpdateService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.staging_root = Path(self.settings.update_staging_path)
        self.uploads_root = self.staging_root / "uploads"
        self.backups_root = self.staging_root / "backups"
        self.runtime_status_path = self.staging_root / "last_apply_result.json"
        self.staging_root.mkdir(parents=True, exist_ok=True)
        self.uploads_root.mkdir(parents=True, exist_ok=True)
        self.backups_root.mkdir(parents=True, exist_ok=True)

    def runtime_version(self) -> str:
        return APP_VERSION

    def check_latest_release(self) -> dict[str, Any]:
        if not APP_REPOSITORY:
            raise ValueError("当前未配置 GitHub 仓库信息，无法检查更新")

        release_url = f"https://api.github.com/repos/{APP_REPOSITORY}/releases/latest"
        release = self._fetch_json(release_url)
        assets = release.get("assets") or []
        manifest_asset = next((asset for asset in assets if asset.get("name") == "update-manifest.json"), None)
        manifest = self._fetch_json(str(manifest_asset.get("browser_download_url"))) if manifest_asset else {}
        latest_version = str(manifest.get("version") or release.get("tag_name") or "").lstrip("v")
        current_version = self.runtime_version()
        packages = []
        package_index = {
            str(item.get("file") or ""): item for item in (manifest.get("packages") or []) if isinstance(item, dict)
        }

        for asset in assets:
            name = str(asset.get("name") or "")
            manifest_entry = package_index.get(name, {})
            packages.append(
                {
                    "name": name,
                    "kind": manifest_entry.get("kind") or self._infer_package_kind_from_name(name),
                    "download_url": str(asset.get("browser_download_url") or ""),
                    "sha256": str(manifest_entry.get("sha256") or ""),
                    "size_bytes": int(manifest_entry.get("size_bytes") or asset.get("size") or 0),
                }
            )

        return {
            "current_version": current_version,
            "latest_version": latest_version,
            "update_available": bool(latest_version) and self._compare_versions(latest_version, current_version) > 0,
            "release_url": str(release.get("html_url") or ""),
            "manifest_url": str(manifest_asset.get("browser_download_url") or "") if manifest_asset else "",
            "published_at": str(release.get("published_at") or ""),
            "release_name": str(release.get("name") or release.get("tag_name") or ""),
            "release_notes": str(release.get("body") or ""),
            "packages": packages,
        }

    def save_uploaded_package(self, filename: str, content: bytes) -> dict[str, Any]:
        raw_name = (filename or "update-package").strip() or "update-package"
        suffix = Path(raw_name).suffix.lower()
        if suffix not in {".zip", ".exe"}:
            raise ValueError("仅支持上传 .zip 或 .exe 更新包")
        safe_name = f"{self._safe_segment(Path(raw_name).stem)}{suffix}"
        destination = self.uploads_root / safe_name
        destination.write_bytes(content)
        return {
            "package_path": str(destination),
            "package_kind": self._normalize_package_kind(self._infer_package_kind(destination)),
            "filename": raw_name,
        }

    def stage_package(self, package_path: str, package_kind: str | None, staged_version: str | None) -> dict[str, Any]:
        normalized_path = (package_path or "").strip()
        if not normalized_path:
            raise ValueError("请先选择本地更新包")

        source_path = Path(normalized_path).expanduser()
        source_path = source_path if source_path.is_absolute() else source_path.resolve()
        if not source_path.exists() or not source_path.is_file():
            raise ValueError("更新包不存在，请重新选择")

        resolved_kind = self._normalize_package_kind(package_kind or self._infer_package_kind(source_path))
        if not resolved_kind:
            raise ValueError("仅支持 portable zip 或 Setup.exe 更新包")
        self._validate_package_extension(source_path, resolved_kind)

        target_version = (staged_version or "").strip()
        if not target_version:
            raise ValueError("请填写目标版本号")
        if target_version == self.runtime_version():
            raise ValueError("目标版本号与当前版本相同，无需更新")

        package_hash = self._sha256(source_path)
        stage_dir = self.staging_root / self._safe_segment(f"{target_version}-{package_hash[:12]}")
        if stage_dir.exists():
            shutil.rmtree(stage_dir)
        stage_dir.mkdir(parents=True, exist_ok=True)

        staged_package_path = stage_dir / source_path.name
        shutil.copy2(source_path, staged_package_path)

        manifest = {
            "package_name": source_path.name,
            "original_path": str(source_path),
            "staged_path": str(staged_package_path),
            "package_kind": resolved_kind,
            "sha256": package_hash,
            "size_bytes": staged_package_path.stat().st_size,
            "staged_version": target_version,
            "current_version": self.runtime_version(),
            "staged_at": datetime.now(timezone.utc).isoformat(),
        }
        manifest_path = stage_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

        return {
            "channel": "stable",
            "current_version": self.runtime_version(),
            "staged_version": target_version,
            "package_path": str(staged_package_path),
            "package_kind": resolved_kind,
            "manifest": manifest,
            "status": "staged",
            "last_error": "",
        }

    def prepare_apply(self, state: dict[str, Any]) -> dict[str, Any]:
        if not getattr(sys, "frozen", False):
            raise ValueError("当前仅支持在打包后的桌面应用中自动应用离线更新")

        package_path = self._resolve_existing_file(str(state.get("package_path") or ""), "暂存的更新包不存在，请重新登记")
        manifest = dict(state.get("manifest") or {})
        expected_hash = str(manifest.get("sha256") or "").strip()
        if expected_hash and expected_hash != self._sha256(package_path):
            raise ValueError("更新包校验失败，请重新登记本地更新包")

        package_kind = self._normalize_package_kind(str(state.get("package_kind") or "") or self._infer_package_kind(package_path))
        if not package_kind:
            raise ValueError("无法识别更新包类型")
        self._validate_package_extension(package_path, package_kind)

        helper_script = self.staging_root / "apply_update.ps1"
        previous_version = str(state.get("current_version") or self.runtime_version())
        backup_dir = self.backups_root / self._safe_segment(f"{previous_version}-to-{str(state.get('staged_version') or 'next')}")
        helper_script.write_text(
            self._build_apply_script(
                package_kind=package_kind,
                package_path=package_path,
                previous_version=previous_version,
                target_version=str(state.get("staged_version") or ""),
                backup_dir=backup_dir,
            ),
            encoding="utf-8",
        )

        self._launch_powershell(helper_script)
        threading.Thread(target=self._shutdown_after_delay, daemon=True).start()

        manifest.update(
            {
                "apply_script": str(helper_script),
                "apply_requested_at": datetime.now(timezone.utc).isoformat(),
                "rollback_backup_dir": str(backup_dir) if package_kind == "portable_zip" else manifest.get("rollback_backup_dir", ""),
                "rollback_available": package_kind == "portable_zip",
            }
        )
        return {
            "channel": str(state.get("channel") or "stable"),
            "current_version": self.runtime_version(),
            "staged_version": state.get("staged_version"),
            "package_path": str(package_path),
            "package_kind": package_kind,
            "manifest": manifest,
            "status": "apply_pending",
            "last_error": "",
        }

    def prepare_rollback(self, state: dict[str, Any]) -> dict[str, Any]:
        if not getattr(sys, "frozen", False):
            raise ValueError("当前仅支持在打包后的桌面应用中自动回滚")

        manifest = dict(state.get("manifest") or {})
        backup_dir = self._resolve_existing_dir(str(manifest.get("rollback_backup_dir") or ""), "没有找到可回滚的备份")
        helper_script = self.staging_root / "rollback_update.ps1"
        previous_version = str(manifest.get("previous_version") or "")
        target_version = str(manifest.get("target_version") or previous_version or "rollback")
        helper_script.write_text(
            self._build_rollback_script(backup_dir=backup_dir, target_version=target_version),
            encoding="utf-8",
        )
        self._launch_powershell(helper_script)
        threading.Thread(target=self._shutdown_after_delay, daemon=True).start()

        manifest.update(
            {
                "rollback_script": str(helper_script),
                "rollback_requested_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        return {
            "channel": str(state.get("channel") or "stable"),
            "current_version": self.runtime_version(),
            "staged_version": previous_version or state.get("staged_version"),
            "package_path": str(state.get("package_path") or ""),
            "package_kind": str(state.get("package_kind") or ""),
            "manifest": manifest,
            "status": "rollback_pending",
            "last_error": "",
        }

    def sync_runtime_result(self, state: dict[str, Any]) -> dict[str, Any]:
        if not self.runtime_status_path.exists():
            state.setdefault("current_version", self.runtime_version())
            return state
        try:
            runtime_result = json.loads(self.runtime_status_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return state
        merged = dict(state)
        manifest = dict(merged.get("manifest") or {})
        manifest.update({key: value for key, value in runtime_result.items() if key not in {"status", "current_version", "last_error"}})
        merged["manifest"] = manifest
        merged["status"] = str(runtime_result.get("status") or merged.get("status") or "idle")
        merged["current_version"] = str(runtime_result.get("current_version") or self.runtime_version())
        merged["last_error"] = str(runtime_result.get("last_error") or "")
        if runtime_result.get("rolled_back_to"):
            merged["staged_version"] = None
            merged["package_path"] = None
            merged["package_kind"] = None
        elif runtime_result.get("status") in {"applied", "installer_started"}:
            merged["staged_version"] = None
            merged["package_path"] = None
            merged["package_kind"] = None
        self._clear_runtime_status_file()
        return merged

    def _clear_runtime_status_file(self) -> None:
        try:
            self.runtime_status_path.unlink()
        except FileNotFoundError:
            pass

    def _shutdown_after_delay(self) -> None:
        time.sleep(1.2)
        os._exit(0)

    def _launch_powershell(self, script_path: Path) -> None:
        creation_flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        subprocess.Popen(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script_path),
            ],
            cwd=str(self.staging_root),
            close_fds=True,
            creationflags=creation_flags,
        )

    def _resolve_existing_file(self, value: str, error_message: str) -> Path:
        path = Path(value).expanduser()
        path = path if path.is_absolute() else path.resolve()
        if not path.exists() or not path.is_file():
            raise ValueError(error_message)
        return path

    def _resolve_existing_dir(self, value: str, error_message: str) -> Path:
        path = Path(value).expanduser()
        path = path if path.is_absolute() else path.resolve()
        if not path.exists() or not path.is_dir():
            raise ValueError(error_message)
        return path

    def _fetch_json(self, url: str) -> dict[str, Any]:
        if not url:
            return {}
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/vnd.github+json, application/json",
                "User-Agent": "second-brain-ai-updater",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.URLError as error:
            raise ValueError(f"检查 GitHub 更新失败：{error.reason}") from error

    def _compare_versions(self, left: str, right: str) -> int:
        left_parts = self._version_parts(left)
        right_parts = self._version_parts(right)
        size = max(len(left_parts), len(right_parts))
        left_parts.extend([0] * (size - len(left_parts)))
        right_parts.extend([0] * (size - len(right_parts)))
        if left_parts > right_parts:
            return 1
        if left_parts < right_parts:
            return -1
        return 0

    def _version_parts(self, value: str) -> list[int]:
        return [int(part) for part in re.findall(r"\d+", (value or "").strip())] or [0]

    def _infer_package_kind(self, path: Path) -> str | None:
        suffix = path.suffix.lower()
        if suffix == ".zip":
            return "portable_zip"
        if suffix == ".exe":
            return "setup_exe"
        return None

    def _infer_package_kind_from_name(self, name: str) -> str | None:
        lowered = name.lower()
        if lowered.endswith(".zip"):
            return "portable_zip"
        if lowered.endswith(".exe"):
            return "setup_exe"
        return None

    def _normalize_package_kind(self, package_kind: str | None) -> str | None:
        if not package_kind:
            return None
        normalized = package_kind.strip().lower()
        if normalized in {"portable_zip", "setup_exe"}:
            return normalized
        return None

    def _validate_package_extension(self, path: Path, package_kind: str) -> None:
        suffix = path.suffix.lower()
        if package_kind == "portable_zip" and suffix != ".zip":
            raise ValueError("portable zip 更新包必须是 .zip 文件")
        if package_kind == "setup_exe" and suffix != ".exe":
            raise ValueError("Setup.exe 更新包必须是 .exe 文件")

    def _safe_segment(self, value: str) -> str:
        safe = re.sub(r"[^0-9A-Za-z._-]+", "-", value).strip("-._")
        return safe or "update"

    def _sha256(self, path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _ps_literal(self, value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    def _build_apply_script(
        self,
        *,
        package_kind: str,
        package_path: Path,
        previous_version: str,
        target_version: str,
        backup_dir: Path,
    ) -> str:
        executable_path = Path(sys.executable).resolve()
        app_dir = executable_path.parent
        log_path = self.staging_root / "apply_update.log"
        result_path = self.runtime_status_path

        script_lines = [
            "$ErrorActionPreference = 'Stop'",
            "function Copy-AppPayload($source, $destination) {",
            "  Get-ChildItem -LiteralPath $source | Where-Object { $_.Name -ne 'data' } | ForEach-Object {",
            "    Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force",
            "  }",
            "}",
            f"$packagePath = {self._ps_literal(str(package_path))}",
            f"$appDir = {self._ps_literal(str(app_dir))}",
            f"$appExe = {self._ps_literal(str(executable_path))}",
            f"$logPath = {self._ps_literal(str(log_path))}",
            f"$resultPath = {self._ps_literal(str(result_path))}",
            f"$backupDir = {self._ps_literal(str(backup_dir))}",
            f"$previousVersion = {self._ps_literal(previous_version)}",
            f"$targetVersion = {self._ps_literal(target_version)}",
            "'[' + (Get-Date).ToString('s') + '] start applying offline update' | Out-File -FilePath $logPath -Append -Encoding utf8",
            "Start-Sleep -Seconds 3",
            "for ($i = 0; $i -lt 45; $i++) {",
            "  try {",
            "    $lockProbe = [System.IO.File]::Open($appExe, 'Open', 'ReadWrite', 'None')",
            "    $lockProbe.Close()",
            "    break",
            "  } catch {",
            "    Start-Sleep -Seconds 1",
            "  }",
            "}",
            "try {",
        ]

        if package_kind == "portable_zip":
            script_lines.extend(
                [
                    "  if (Test-Path $backupDir) { Remove-Item -LiteralPath $backupDir -Recurse -Force }",
                    "  New-Item -ItemType Directory -Path $backupDir | Out-Null",
                    "  Copy-AppPayload $appDir $backupDir",
                    "  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ('second-brain-update-' + [guid]::NewGuid().ToString('N'))",
                    "  if (Test-Path $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force }",
                    "  New-Item -ItemType Directory -Path $tempDir | Out-Null",
                    "  Expand-Archive -LiteralPath $packagePath -DestinationPath $tempDir -Force",
                    "  Copy-AppPayload $tempDir $appDir",
                    "  Remove-Item -LiteralPath $tempDir -Recurse -Force",
                    "  $result = @{",
                    "    status = 'applied'",
                    "    current_version = $targetVersion",
                    "    previous_version = $previousVersion",
                    "    target_version = $targetVersion",
                    "    rollback_backup_dir = $backupDir",
                    "    rollback_available = $true",
                    "    applied_at = (Get-Date).ToString('o')",
                    "    package_kind = 'portable_zip'",
                    "    last_error = ''",
                    "  }",
                    "  $result | ConvertTo-Json -Depth 5 | Set-Content -Path $resultPath -Encoding UTF8",
                    "  'portable package copied' | Out-File -FilePath $logPath -Append -Encoding utf8",
                    "  Start-Process -FilePath $appExe",
                ]
            )
        else:
            script_lines.extend(
                [
                    "  $result = @{",
                    "    status = 'installer_started'",
                    "    current_version = $previousVersion",
                    "    previous_version = $previousVersion",
                    "    target_version = $targetVersion",
                    "    rollback_available = $false",
                    "    applied_at = (Get-Date).ToString('o')",
                    "    package_kind = 'setup_exe'",
                    "    last_error = ''",
                    "  }",
                    "  $result | ConvertTo-Json -Depth 5 | Set-Content -Path $resultPath -Encoding UTF8",
                    "  'launching setup package' | Out-File -FilePath $logPath -Append -Encoding utf8",
                    "  Start-Process -FilePath $packagePath -WorkingDirectory (Split-Path -Parent $packagePath)",
                ]
            )

        script_lines.extend(
            [
                "} catch {",
                "  $message = $_.Exception.Message",
                "  if (Test-Path $backupDir) {",
                "    try { Copy-AppPayload $backupDir $appDir } catch {}",
                "  }",
                "  $result = @{",
                "    status = 'error'",
                "    current_version = $previousVersion",
                "    previous_version = $previousVersion",
                "    target_version = $targetVersion",
                "    rollback_backup_dir = $backupDir",
                "    rollback_available = (Test-Path $backupDir)",
                "    failed_at = (Get-Date).ToString('o')",
                "    last_error = $message",
                "  }",
                "  $result | ConvertTo-Json -Depth 5 | Set-Content -Path $resultPath -Encoding UTF8",
                "  throw",
                "}",
            ]
        )

        return "\n".join(script_lines) + "\n"

    def _build_rollback_script(self, *, backup_dir: Path, target_version: str) -> str:
        executable_path = Path(sys.executable).resolve()
        app_dir = executable_path.parent
        log_path = self.staging_root / "rollback_update.log"
        result_path = self.runtime_status_path

        script_lines = [
            "$ErrorActionPreference = 'Stop'",
            "function Copy-AppPayload($source, $destination) {",
            "  Get-ChildItem -LiteralPath $source | Where-Object { $_.Name -ne 'data' } | ForEach-Object {",
            "    Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force",
            "  }",
            "}",
            f"$backupDir = {self._ps_literal(str(backup_dir))}",
            f"$appDir = {self._ps_literal(str(app_dir))}",
            f"$appExe = {self._ps_literal(str(executable_path))}",
            f"$logPath = {self._ps_literal(str(log_path))}",
            f"$resultPath = {self._ps_literal(str(result_path))}",
            f"$targetVersion = {self._ps_literal(target_version)}",
            "'[' + (Get-Date).ToString('s') + '] start rollback' | Out-File -FilePath $logPath -Append -Encoding utf8",
            "Start-Sleep -Seconds 3",
            "for ($i = 0; $i -lt 45; $i++) {",
            "  try {",
            "    $lockProbe = [System.IO.File]::Open($appExe, 'Open', 'ReadWrite', 'None')",
            "    $lockProbe.Close()",
            "    break",
            "  } catch {",
            "    Start-Sleep -Seconds 1",
            "  }",
            "}",
            "try {",
            "  Copy-AppPayload $backupDir $appDir",
            "  $result = @{",
            "    status = 'rolled_back'",
            "    current_version = $targetVersion",
            "    rolled_back_to = $targetVersion",
            "    rollback_backup_dir = $backupDir",
            "    rollback_available = $true",
            "    rolled_back_at = (Get-Date).ToString('o')",
            "    last_error = ''",
            "  }",
            "  $result | ConvertTo-Json -Depth 5 | Set-Content -Path $resultPath -Encoding UTF8",
            "  Start-Process -FilePath $appExe",
            "} catch {",
            "  $message = $_.Exception.Message",
            "  $result = @{",
            "    status = 'error'",
            "    current_version = $targetVersion",
            "    rollback_backup_dir = $backupDir",
            "    rollback_available = $true",
            "    failed_at = (Get-Date).ToString('o')",
            "    last_error = $message",
            "  }",
            "  $result | ConvertTo-Json -Depth 5 | Set-Content -Path $resultPath -Encoding UTF8",
            "  throw",
            "}",
        ]
        return "\n".join(script_lines) + "\n"


offline_update_service = OfflineUpdateService()
