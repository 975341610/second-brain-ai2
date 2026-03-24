from __future__ import annotations

import json
import logging
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
        logger.setLevel(logging.ERROR)
        fh = logging.FileHandler(log_file, encoding="utf-8")
        formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
        fh.setFormatter(formatter)
        logger.addHandler(fh)
    return logger


class AIClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.logger = get_ai_logger()

    def _get_active_config(self, config: dict[str, str] | None = None) -> dict[str, str]:
        active = config or {}
        api_key = active.get("api_key") or self.settings.openclaw_api_key
        base_url = (active.get("base_url") or self.settings.openclaw_base_url).rstrip("/")
        model_name = active.get("model_name") or self.settings.default_model

        # Auto-append /v1 if missing (heuristic for common OpenAI proxies)
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

    async def embed(self, text: str, config: dict[str, str] | None = None) -> list[float]:
        if not self._can_call_remote(config):
            return build_embedding(text, self.settings.embedding_dimension)

        conf = self._get_active_config(config)
        headers = {"Authorization": f"Bearer {conf['api_key']}", "Content-Type": "application/json"}
        payload = {
            "model": conf["model_name"],
            "input": text,
        }
        try:
            async with httpx.AsyncClient(timeout=10.0, trust_env=True) as client:
                response = await client.post(f"{conf['base_url']}/embeddings", headers=headers, json=payload)
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
            return ""

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
            async with httpx.AsyncClient(timeout=30.0, trust_env=True) as client:
                response = await client.post(f"{conf['base_url']}/chat/completions", headers=headers, json=payload)
                response.raise_for_status()
                body = response.json()
                return body["choices"][0]["message"]["content"].strip()
        except Exception as e:
            self.logger.error(f"Chat Error: {str(e)} | URL: {conf['base_url']}")
            return ""

    async def stream_chat(self, messages: list[dict[str, str]], config: dict[str, str] | None = None):
        conf = self._get_active_config(config)
        if not (conf["api_key"] and conf["base_url"]):
            yield "Error: AI Config missing"
            return

        headers = {"Authorization": f"Bearer {conf['api_key']}", "Content-Type": "application/json"}
        payload = {
            "model": conf["model_name"],
            "messages": messages,
            "temperature": 0.7,
            "stream": True,
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0, trust_env=True) as client:
                async with client.stream("POST", f"{conf['base_url']}/chat/completions", headers=headers, json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        # Remove 'data: ' prefix
                        content_str = line[6:].strip()
                        if content_str == "[DONE]":
                            break
                        try:
                            data = json.loads(content_str)
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except Exception:
                            continue
        except Exception as e:
            self.logger.error(f"Stream Error: {str(e)} | URL: {conf['base_url']}")
            yield f"Error: {str(e)}"
