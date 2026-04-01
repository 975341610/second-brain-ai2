from __future__ import annotations

APP_NAME = "Second Brain AI"
APP_VERSION = "1.0.0"
APP_REPOSITORY = "975341610/second-brain-ai"


def app_info_payload(*, api_prefix: str, runtime_root: str, workspace_path: str, update_staging_path: str, plugin_packages_path: str, theme_assets_path: str) -> dict[str, str]:
    return {
        "name": APP_NAME,
        "version": APP_VERSION,
        "repository": APP_REPOSITORY,
        "api_prefix": api_prefix,
        "runtime_root": runtime_root,
        "workspace_path": workspace_path,
        "update_staging_path": update_staging_path,
        "plugin_packages_path": plugin_packages_path,
        "theme_assets_path": theme_assets_path,
    }
