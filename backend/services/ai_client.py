from __future__ import annotations

import json
import logging
import asyncio
import socket
from urllib.parse import urlparse
from pathlib import Path
from typing import Any

import httpx

from backend.config import get_settings
from backend.services.offline_ai import answer_from_context, build_embedding, generate_tags, plan_tasks, summarize_text


# Setup AI logger
def get_ai_logger():
    settings = get_settings()
    log_file = settings.data_root / "ai_error.log"
    logger = logging.getLogger("ai_client")
    if not logger.handlers:
        logger.setLevel(logging.WARNING)
        fh = logging.FileHandler(log_file, encoding="utf-8")
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        fh.setFormatter(formatter)
        logger.addHandler(fh)
    return logger


class AIClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.logger = get_ai_logger()
        # 优化连接池：增加最大连接数和保持存活的连接数，提升并发稳定性
        limits = httpx.Limits(max_keepalive_connections=50, max_connections=100)
        
        # 禁用 SSL 验证以兼容各种代理环境 (针对打包后的证书问题)
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        verify = False
        
        # 注意：在某些环境中 trust_env=True 可能会因为环境变量解析失败导致启动崩溃
        try:
            self.client = httpx.AsyncClient(timeout=60.0, trust_env=True, limits=limits, verify=verify)
            self.trust_env = True
        except Exception:
            self.client = httpx.AsyncClient(timeout=60.0, trust_env=False, limits=limits, verify=verify)
            self.trust_env = False

    def _get_active_config(self, config: dict[str, str] | None = None) -> dict[str, str]:
        active = config or {}
        api_key = active.get("api_key") or self.settings.openclaw_api_key
        base_url = (active.get("base_url") or self.settings.openclaw_base_url).strip().rstrip("/")
        model_name = active.get("model_name") or self.settings.default_model

        # 1. URL Normalization: Ensure scheme exists
        if base_url and not (base_url.startswith("http://") or base_url.startswith("https://")):
            # If user provided something like 1.2.3.4 or api.openai.com
            base_url = f"https://{base_url}"

        # 2. Heuristic: Strip full API endpoints if accidentally pasted
        # Users often paste "https://api.openai.com/v1/chat/completions"
        for suffix in ["/chat/completions", "/embeddings"]:
            if base_url.endswith(suffix):
                base_url = base_url[: -len(suffix)].rstrip("/")

        # 3. Auto-append /v1 if missing (heuristic for common OpenAI proxies)
        if base_url and not base_url.endswith("/v1") and "vpsairobot.com" in base_url:
            base_url = f"{base_url}/v1"

        return {
            "api_key": api_key,
            "base_url": base_url,
            "model_name": model_name
        }

    def _can_call_remote(self, config: dict[str, str] | None = None) -> bool:
        conf = self._get_active_config(config)
        return bool(conf["api_key"] and conf["base_url"])

    def _obfuscate_url(self, url: str) -> str:
        """Hide host components if it's sensitive, but show domain for debugging."""
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

    async def _check_connectivity(self, url: str) -> str | None:
        """
        Verify DNS resolution and basic connectivity to the base URL host.
        Returns an error message if failed, else None.
        """
        parsed = urlparse(url)
        host = parsed.hostname
        port = parsed.port or (443 if parsed.scheme == "https" else 80)

        if not host:
            return "Error: Invalid Hostname. Please check your AI API base URL setting."

        try:
            # 1. DNS Resolution Check
            # Windows error 11001: getaddrinfo failed is exactly what this checks.
            resolved = await asyncio.get_running_loop().run_in_executor(
                None, lambda: socket.getaddrinfo(host, port)
            )
            # Log successful resolution for observability
            ips = {info[4][0] for info in resolved}
            self.logger.info(f"DNS resolved {host} to: {list(ips)}")
            return None
        except socket.gaierror as e:
            err_code = e.errno
            err_str = f"域名解析失败 ({host}): [Errno {err_code}] {str(e)}"
            self.logger.error(f"Connectivity Check Failed: {err_str} | URL: {url}")
            
            # Detailed guidance for Windows users (most common case for 11001)
            diagnostic_msg = (
                f"Error: {err_str}\n\n"
                "诊断建议：\n"
                "1. 请在终端运行 'nslookup " + host + "' 检查域名解析是否正常。\n"
                "2. 检查系统代理设置，确保允许连接到该域名。\n"
                "3. 如果使用 VPN，请确认 VPN 处于连接状态且分流规则正确。\n"
                "4. 检查防火墙或杀毒软件是否拦截了访问。"
            )
            return diagnostic_msg
        except Exception as e:
            return f"Error: Connectivity check failed: {str(e)}"

    async def embed(self, text: str, config: dict[str, str] | None = None) -> list[float]:
        if not self._can_call_remote(config):
            return build_embedding(text, self.settings.embedding_dimension)

        conf = self._get_active_config(config)
        full_url = f"{conf['base_url']}/embeddings"
        
        # Pre-flight check
        conn_error = await self._check_connectivity(conf['base_url'])
        if conn_error:
            self.logger.error(f"Embed Pre-flight Error: {conn_error}")
            return build_embedding(text, self.settings.embedding_dimension)

        headers = {"Authorization": f"Bearer {conf['api_key']}", "Content-Type": "application/json"}
        payload = {
            "model": conf["model_name"],
            "input": text,
        }
        try:
            self.logger.info(f"Embed Request | URL: {self._obfuscate_url(full_url)} | trust_env: {self.trust_env}")
            response = await self.client.post(full_url, headers=headers, json=payload, timeout=10.0)
            response.raise_for_status()
            body = response.json()
            return body["data"][0]["embedding"]
        except Exception as e:
            self.logger.error(f"Embed Error: {str(e)} | URL: {conf['base_url']}")
            return build_embedding(text, self.settings.embedding_dimension)

    async def summarize(self, text: str, config: dict[str, str] | None = None) -> str:
        prompt = f"Summarize this note in two concise sentences:\n\n{text[:4000]}"
        response = await self._chat_completion(prompt, config)
        return response or summarize_text(text)

    async def tags(self, text: str, config: dict[str, str] | None = None) -> list[str]:
        prompt = (
            "Analyze the following note and extract up to 5 core keywords as tags. "
            "Return ONLY a JSON array of strings. Each tag should be a single word or a short phrase. "
            "Do not include full sentences or summary text. "
            "Example: [\"AI\", \"Productivity\", \"Recipe\"]\n\n"
            f"Content: {text[:3000]}"
        )
        response = await self._chat_completion(prompt, config)
        if response:
            try:
                # Basic cleaning of the response in case AI includes markdown formatting
                cleaned_response = response.strip()
                if cleaned_response.startswith("```json"):
                    cleaned_response = cleaned_response[7:-3].strip()
                elif cleaned_response.startswith("```"):
                    cleaned_response = cleaned_response[3:-3].strip()
                
                data = json.loads(cleaned_response)
                if isinstance(data, list):
                    # Deduplicate and clean
                    unique_tags = []
                    seen = set()
                    for item in data:
                        tag = str(item).strip().title() # Normalize to Title Case
                        if tag.lower() not in seen and tag:
                            unique_tags.append(tag)
                            seen.add(tag.lower())
                    return unique_tags[:5]
            except json.JSONDecodeError:
                pass
        return generate_tags(text)

    async def answer(self, question: str, contexts: list[dict[str, Any]], config: dict[str, str] | None = None) -> str:
        # If no contexts provided but remote is configured, we allow remote call (Chat mode)
        if not contexts and not self._can_call_remote(config):
            return answer_from_context(question, contexts)
        
        # If remote is available, use it even if contexts is empty
        if self._can_call_remote(config):
            if contexts:
                citation_block = "\n\n".join(
                    f"[{idx + 1}] {item['title']}\n{item['excerpt']}" for idx, item in enumerate(contexts)
                )
                prompt = (
                    "You are a personal second-brain assistant. Answer using the provided notes only. "
                    "Always cite sources as [1], [2] inline.\n\n"
                    f"Question: {question}\n\nContext:\n{citation_block}"
                )
            else:
                prompt = question # Global Chat mode

            response = await self._chat_completion(prompt, config)
            # If we get an error string, return it directly instead of fallback
            if response and response.startswith("Error:"):
                return response
            if response:
                return response

        return answer_from_context(question, contexts)

    async def plan(self, goal: str, contexts: list[dict[str, Any]], config: dict[str, str] | None = None) -> list[str]:
        if not self._can_call_remote(config):
            return plan_tasks(goal, [item["excerpt"] for item in contexts])
        prompt = (
            "Break the user goal into 3 to 5 actionable TODO items. Return a JSON array of strings only.\n\n"
            f"Goal: {goal}\n\nKnowledge:\n" + "\n".join(item["excerpt"] for item in contexts[:4])
        )
        response = await self._chat_completion(prompt, config)
        if response:
            try:
                cleaned_response = response.strip()
                if cleaned_response.startswith("```json"):
                    cleaned_response = cleaned_response[7:-3].strip()
                elif cleaned_response.startswith("```"):
                    cleaned_response = cleaned_response[3:-3].strip()
                
                data = json.loads(cleaned_response)
                if isinstance(data, list):
                    return [str(item) for item in data][:5]
            except json.JSONDecodeError:
                pass
        return plan_tasks(goal, [item["excerpt"] for item in contexts])

    async def _chat_completion(self, prompt: str, config: dict[str, str] | None = None) -> str:
        conf = self._get_active_config(config)
        if not (conf["api_key"] and conf["base_url"]):
            return "Error: AI Config (API Key or Base URL) is missing in Settings."

        # Pre-flight check
        conn_error = await self._check_connectivity(conf['base_url'])
        if conn_error:
            return conn_error

        full_url = f"{conf['base_url']}/chat/completions"
        headers = {"Authorization": f"Bearer {conf['api_key']}", "Content-Type": "application/json"}
        payload = {
            "model": conf["model_name"],
            "messages": [
                {"role": "system", "content": "You are a reliable second-brain assistant."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }
        try:
            self.logger.info(f"Chat Request | URL: {self._obfuscate_url(full_url)} | trust_env: {self.trust_env}")
            response = await self.client.post(full_url, headers=headers, json=payload, timeout=30.0)
            if response.status_code != 200:
                err_msg = f"Error: {response.status_code} {response.reason_phrase} - {response.text}"
                self.logger.error(f"Chat Error: {err_msg} | URL: {conf['base_url']}")
                return err_msg
            body = response.json()
            return body["choices"][0]["message"]["content"].strip()
        except Exception as e:
            err_msg = f"Error: {str(e)}"
            self.logger.error(f"Chat Exception: {err_msg} | URL: {conf['base_url']}")
            return err_msg

    async def stream_chat(self, messages: list[dict[str, str]], config: dict[str, str] | None = None):
        conf = self._get_active_config(config)
        if not (conf["api_key"] and conf["base_url"]):
            yield "Error: AI Config missing"
            return

        # Pre-flight check
        conn_error = await self._check_connectivity(conf['base_url'])
        if conn_error:
            yield conn_error
            return

        full_url = f"{conf['base_url']}/chat/completions"
        headers = {"Authorization": f"Bearer {conf['api_key']}", "Content-Type": "application/json"}
        payload = {
            "model": conf["model_name"],
            "messages": messages,
            "temperature": 0.7,
            "stream": True,
        }
        
        first_token_timeout = 60.0 # Increased for stability (e.g. DeepSeek R1)
        
        for attempt in range(3):
            try:
                self.logger.info(f"Stream Request (Attempt {attempt+1}) | URL: {self._obfuscate_url(full_url)} | trust_env: {self.trust_env}")
                async with self.client.stream("POST", full_url, headers=headers, json=payload, timeout=60.0) as response:
                    response.raise_for_status()
                    
                    got_first_token = False
                    lines_iter = response.aiter_lines()
                    
                    while True:
                        try:
                            if not got_first_token:
                                line = await asyncio.wait_for(anext(lines_iter), timeout=first_token_timeout)
                            else:
                                line = await anext(lines_iter)
                        except (asyncio.TimeoutError, TimeoutError):
                            raise Exception(f"First token timeout after {first_token_timeout}s")
                        except StopAsyncIteration:
                            break
                        
                        line = line.strip()
                        if not line:
                            continue
                        
                        # Compatible with both SSE (data: {JSON}) and JSONL ({JSON})
                        content_str = line
                        if line.startswith("data:"):
                            content_str = line[5:].strip()
                        
                        if content_str == "[DONE]":
                            break
                        
                        try:
                            if not content_str.startswith("{"):
                                continue
                                
                            data = json.loads(content_str)
                            choices = data.get("choices", [])
                            if not choices:
                                continue
                            delta = choices[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                got_first_token = True
                                yield content
                        except json.JSONDecodeError:
                            if line.startswith("data:"):
                                self.logger.warning(f"Failed to parse SSE line: {line}")
                            continue
                return # Success
            except Exception as e:
                if attempt == 2:
                    self.logger.error(f"Stream Error: {str(e)} | URL: {conf['base_url']}")
                    yield f"Error: {str(e)}"
                else:
                    self.logger.warning(f"Stream attempt {attempt+1} failed: {str(e)}. Retrying...")
                    await asyncio.sleep(1)
                    continue
