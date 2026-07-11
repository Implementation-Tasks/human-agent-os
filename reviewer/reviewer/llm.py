"""
LLM providers.

Two interchangeable providers expose the same method:  chat(system, user) -> str

  LiveLLM     - calls any OpenAI-compatible endpoint (OpenAI, Qwen/DashScope, ...).
  ScriptedLLM - returns pre-defined responses in call order. Deterministic, no
                network, no key. This is what makes the live demo safe: the three
                scripted scenarios always trigger the same branches.

The components (router, agent, reviewer) run their REAL parsing/logic on top of
whichever provider is injected, so scripted and live share one code path.
"""
from __future__ import annotations

import json
import os
import re
from typing import List


class LLMError(Exception):
    pass


def parse_json(text: str) -> dict:
    """Robustly extract a JSON object from a model response."""
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


class LiveLLM:
    def __init__(self, model: str | None = None, temperature: float = 0.2, timeout: int = 60):
        self.api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("LLM_API_KEY")
        self.base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.model = model or os.environ.get("LLM_MODEL", "gpt-4o-mini")
        self.temperature = temperature
        self.timeout = timeout
        if not self.api_key:
            raise LLMError("No OPENAI_API_KEY set for live mode. Use scripted mode instead.")

    def chat(self, system: str, user: str) -> str:
        import requests  # imported lazily so scripted mode needs no dependency
        try:
            resp = requests.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}",
                         "Content-Type": "application/json"},
                json={"model": self.model, "temperature": self.temperature,
                      "messages": [{"role": "system", "content": system},
                                   {"role": "user", "content": user}]},
                timeout=self.timeout,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:  # noqa: BLE001 - surfaced as LLMError for the fallback layer
            raise LLMError(str(e)) from e


class ScriptedLLM:
    """Returns queued responses in order. Dicts are JSON-encoded, strings passed through."""

    def __init__(self, responses: List):
        self._queue = list(responses)

    def chat(self, system: str, user: str) -> str:
        if not self._queue:
            raise LLMError("ScriptedLLM ran out of responses.")
        item = self._queue.pop(0)
        return json.dumps(item) if isinstance(item, (dict, list)) else str(item)


def make_llm(mode: str = "auto", **kwargs):
    """mode: 'live' | 'scripted' | 'auto' (live if a key exists, else caller supplies scripted)."""
    if mode == "scripted":
        return ScriptedLLM(kwargs.get("responses", []))
    if mode in ("live", "auto"):
        return LiveLLM(model=kwargs.get("model"))
    raise ValueError(f"unknown mode: {mode}")
