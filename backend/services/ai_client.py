from __future__ import annotations

import json
from typing import Any

import httpx

from backend.config import get_settings
from backend.services.offline_ai import answer_from_context, build_embedding, generate_tags, plan_tasks, summarize_text


class AIClient:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _can_call_remote(self, config: dict[str, str] | None = None) -> bool:
        active = config or {}
        api_key = active.get("api_key") or self.settings.openclaw_api_key
        base_url = active.get("base_url") or self.settings.openclaw_base_url
        return bool(api_key and base_url)

    async def embed(self, text: str, config: dict[str, str] | None = None) -> list[float]:
        if not self._can_call_remote(config):
            return build_embedding(text, self.settings.embedding_dimension)

        active = config or {}
        api_key = active.get("api_key") or self.settings.openclaw_api_key
        base_url = (active.get("base_url") or self.settings.openclaw_base_url).rstrip("/")
        model_name = active.get("model_name") or self.settings.default_model

        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": model_name,
            "input": text,
        }
        try:
            async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
                response = await client.post(f"{base_url}/embeddings", headers=headers, json=payload)
                response.raise_for_status()
                body = response.json()
                return body["data"][0]["embedding"]
        except Exception:
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
        if not contexts or not self._can_call_remote(config):
            return answer_from_context(question, contexts)

        citation_block = "\n\n".join(
            f"[{idx + 1}] {item['title']}\n{item['excerpt']}" for idx, item in enumerate(contexts)
        )
        prompt = (
            "You are a personal second-brain assistant. Answer using the provided notes only. "
            "Always cite sources as [1], [2] inline.\n\n"
            f"Question: {question}\n\nContext:\n{citation_block}"
        )
        response = await self._chat_completion(prompt, config)
        return response or answer_from_context(question, contexts)

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
        active = config or {}
        api_key = active.get("api_key") or self.settings.openclaw_api_key
        base_url = (active.get("base_url") or self.settings.openclaw_base_url).rstrip("/")
        model_name = active.get("model_name") or self.settings.default_model
        if not (api_key and base_url):
            return ""

        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": "You are a reliable second-brain assistant."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }
        try:
            async with httpx.AsyncClient(timeout=30.0, trust_env=False) as client:
                response = await client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
                response.raise_for_status()
                body = response.json()
                return body["choices"][0]["message"]["content"].strip()
        except Exception:
            return ""

    async def stream_chat(self, messages: list[dict[str, str]], config: dict[str, str] | None = None):
        active = config or {}
        api_key = active.get("api_key") or self.settings.openclaw_api_key
        base_url = (active.get("base_url") or self.settings.openclaw_base_url).rstrip("/")
        model_name = active.get("model_name") or self.settings.default_model
        
        if not (api_key and base_url):
            yield "Error: AI Config missing"
            return

        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": 0.7,
            "stream": True,
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0, trust_env=False) as client:
                async with client.stream("POST", f"{base_url}/chat/completions", headers=headers, json=payload) as response:
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
            yield f"Error: {str(e)}"
