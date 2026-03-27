"""
PRAETOR Enterprise — Multi-LLM Provider Abstraction
Supports Anthropic Claude, OpenAI GPT, and Google Gemini.
Agents select a provider via the LLM_PROVIDER env var.
Each provider normalises its native API into PRAETOR's standard
message + tool-use contract so base_agent.py stays provider-agnostic.
"""
from __future__ import annotations

import json
import logging
import os
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)


# ─── Standard types ──────────────────────────────────────────────────────────

class ToolCall:
    """Normalised tool call returned by any provider."""
    def __init__(self, id: str, name: str, input: dict):
        self.id    = id
        self.name  = name
        self.input = input


class LLMResponse:
    """Normalised response from any provider."""
    def __init__(self, text: str = "", tool_calls: list[ToolCall] = None, raw=None):
        self.text       = text
        self.tool_calls = tool_calls or []
        self.raw        = raw          # Provider-native object (for building follow-up messages)

    @property
    def wants_tools(self) -> bool:
        return len(self.tool_calls) > 0


# ─── Base provider ───────────────────────────────────────────────────────────

class LLMProvider(ABC):
    """Abstract base — implement one class per LLM vendor."""

    @abstractmethod
    async def complete(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict],
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Single completion (no tool loop — caller handles the loop)."""
        ...

    @abstractmethod
    def append_tool_results(
        self,
        messages: list[dict],
        response: LLMResponse,
        tool_results: list[dict],   # [{"tool_use_id": ..., "content": ...}]
    ) -> list[dict]:
        """
        Return a new messages list with the assistant turn and tool results appended.
        Each provider formats these differently.
        """
        ...

    @property
    @abstractmethod
    def model_id(self) -> str: ...


# ─── Anthropic (Claude) ──────────────────────────────────────────────────────

class AnthropicProvider(LLMProvider):
    """
    Claude via the Anthropic Python SDK.
    Supports: claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001
    """

    def __init__(self, model: str = "claude-sonnet-4-6"):
        try:
            from anthropic import AsyncAnthropic
            self._client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        except ImportError:
            raise RuntimeError("anthropic package not installed — pip install anthropic")
        self._model = model

    @property
    def model_id(self) -> str:
        return self._model

    async def complete(self, system, messages, tools, max_tokens=4096) -> LLMResponse:
        kwargs = dict(
            model=self._model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        if tools:
            kwargs["tools"] = [
                {
                    "name": t["name"],
                    "description": t["description"],
                    "input_schema": t.get("input_schema", t.get("parameters", {"type":"object","properties":{}})),
                }
                for t in tools
            ]
        resp = await self._client.messages.create(**kwargs)

        text = next((b.text for b in resp.content if hasattr(b, "text")), "")
        tool_calls = [
            ToolCall(id=b.id, name=b.name, input=b.input)
            for b in resp.content if b.type == "tool_use"
        ]
        return LLMResponse(text=text, tool_calls=tool_calls, raw=resp)

    def append_tool_results(self, messages, response, tool_results) -> list[dict]:
        return messages + [
            {"role": "assistant", "content": response.raw.content},
            {"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": r["tool_use_id"], "content": r["content"]}
                for r in tool_results
            ]},
        ]


# ─── OpenAI (GPT) ────────────────────────────────────────────────────────────

class OpenAIProvider(LLMProvider):
    """
    OpenAI GPT via the openai Python SDK.
    Supports: gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o3-mini
    """

    def __init__(self, model: str = "gpt-4o"):
        try:
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(
                api_key=os.getenv("OPENAI_API_KEY"),
                base_url=os.getenv("OPENAI_BASE_URL"),   # supports Azure OpenAI endpoint too
            )
        except ImportError:
            raise RuntimeError("openai package not installed — pip install openai")
        self._model = model

    @property
    def model_id(self) -> str:
        return self._model

    async def complete(self, system, messages, tools, max_tokens=4096) -> LLMResponse:
        oai_messages = [{"role": "system", "content": system}] + messages
        kwargs = dict(model=self._model, max_tokens=max_tokens, messages=oai_messages)
        if tools:
            kwargs["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t["description"],
                        "parameters": t.get("input_schema", t.get("parameters", {"type":"object","properties":{}})),
                    },
                }
                for t in tools
            ]
            kwargs["tool_choice"] = "auto"

        resp = await self._client.chat.completions.create(**kwargs)
        msg = resp.choices[0].message
        text = msg.content or ""
        tool_calls = []
        if msg.tool_calls:
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                except json.JSONDecodeError:
                    args = {}
                tool_calls.append(ToolCall(id=tc.id, name=tc.function.name, input=args))
        return LLMResponse(text=text, tool_calls=tool_calls, raw=msg)

    def append_tool_results(self, messages, response, tool_results) -> list[dict]:
        raw = response.raw
        assistant_turn = {
            "role": "assistant",
            "content": raw.content,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.name, "arguments": json.dumps(tc.input)},
                }
                for tc in response.tool_calls
            ] if response.tool_calls else [],
        }
        result_turns = [
            {"role": "tool", "tool_call_id": r["tool_use_id"], "content": r["content"]}
            for r in tool_results
        ]
        return messages + [assistant_turn] + result_turns


# ─── Google Gemini ───────────────────────────────────────────────────────────

class GeminiProvider(LLMProvider):
    """
    Google Gemini via google-generativeai SDK.
    Supports: gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash
    """

    def __init__(self, model: str = "gemini-2.0-flash"):
        try:
            import google.generativeai as genai
            genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
            self._genai  = genai
            self._model  = model
        except ImportError:
            raise RuntimeError("google-generativeai not installed — pip install google-generativeai")

    @property
    def model_id(self) -> str:
        return self._model

    async def complete(self, system, messages, tools, max_tokens=4096) -> LLMResponse:
        import asyncio

        # Convert messages to Gemini Content format
        gemini_msgs = []
        for m in messages:
            role = "model" if m["role"] == "assistant" else "user"
            content = m["content"] if isinstance(m["content"], str) else str(m["content"])
            gemini_msgs.append({"role": role, "parts": [{"text": content}]})

        tool_decls = []
        if tools:
            for t in tools:
                params = t.get("input_schema", t.get("parameters", {}))
                tool_decls.append({
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": params,
                })

        cfg = {"max_output_tokens": max_tokens}
        model_obj = self._genai.GenerativeModel(
            model_name=self._model,
            system_instruction=system,
            generation_config=cfg,
            tools=tool_decls if tool_decls else None,
        )

        # Gemini SDK is sync — run in executor
        loop = asyncio.get_event_loop()
        chat  = model_obj.start_chat(history=gemini_msgs[:-1] if len(gemini_msgs) > 1 else [])
        last_content = gemini_msgs[-1]["parts"][0]["text"] if gemini_msgs else ""
        resp = await loop.run_in_executor(None, chat.send_message, last_content)

        text = ""
        tool_calls = []
        for part in resp.parts:
            if hasattr(part, "text") and part.text:
                text += part.text
            if hasattr(part, "function_call") and part.function_call:
                fc = part.function_call
                tool_calls.append(ToolCall(
                    id=fc.name,    # Gemini doesn't have stable IDs — use name
                    name=fc.name,
                    input=dict(fc.args),
                ))
        return LLMResponse(text=text, tool_calls=tool_calls, raw=resp)

    def append_tool_results(self, messages, response, tool_results) -> list[dict]:
        # Gemini: append function responses as user parts
        result_content = json.dumps({r["tool_use_id"]: r["content"] for r in tool_results})
        return messages + [{"role": "user", "content": result_content}]


# ─── Azure OpenAI ────────────────────────────────────────────────────────────

class AzureOpenAIProvider(OpenAIProvider):
    """
    Azure-hosted OpenAI deployment.
    Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_VERSION.
    Model name is the Azure deployment name.
    """

    def __init__(self, model: str = "gpt-4o"):
        try:
            from openai import AsyncAzureOpenAI
            self._client = AsyncAzureOpenAI(
                api_key=os.getenv("AZURE_OPENAI_API_KEY"),
                azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
                api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
            )
        except ImportError:
            raise RuntimeError("openai package not installed — pip install openai")
        self._model = model


# ─── Factory ─────────────────────────────────────────────────────────────────

PROVIDER_MAP = {
    "anthropic":   (AnthropicProvider,  "claude-sonnet-4-6"),
    "openai":      (OpenAIProvider,     "gpt-4o"),
    "gemini":      (GeminiProvider,     "gemini-2.0-flash"),
    "azure":       (AzureOpenAIProvider,"gpt-4o"),
}


def get_provider(provider_name: str | None = None, model: str | None = None) -> LLMProvider:
    """
    Build the correct LLMProvider from environment or explicit args.

    Priority:
      1. Explicit provider_name / model args
      2. LLM_PROVIDER env var
      3. Default: Anthropic claude-sonnet-4-6
    """
    name  = (provider_name or os.getenv("LLM_PROVIDER", "anthropic")).lower()
    cls, default_model = PROVIDER_MAP.get(name, PROVIDER_MAP["anthropic"])
    selected_model = model or os.getenv("LLM_MODEL", default_model)
    logger.info(f"LLM provider: {name} / model: {selected_model}")
    return cls(model=selected_model)


# ─── Available models reference ──────────────────────────────────────────────

AVAILABLE_MODELS = {
    "anthropic": [
        {"id": "claude-opus-4-6",           "label": "Claude Opus 4.6",         "context": 200000},
        {"id": "claude-sonnet-4-6",         "label": "Claude Sonnet 4.6",       "context": 200000},
        {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5",        "context": 200000},
    ],
    "openai": [
        {"id": "gpt-4o",       "label": "GPT-4o",        "context": 128000},
        {"id": "gpt-4o-mini",  "label": "GPT-4o Mini",   "context": 128000},
        {"id": "gpt-4-turbo",  "label": "GPT-4 Turbo",   "context": 128000},
        {"id": "o3-mini",      "label": "o3-mini",       "context": 200000},
    ],
    "gemini": [
        {"id": "gemini-2.0-flash",    "label": "Gemini 2.0 Flash",    "context": 1000000},
        {"id": "gemini-1.5-pro",      "label": "Gemini 1.5 Pro",      "context": 2000000},
        {"id": "gemini-1.5-flash",    "label": "Gemini 1.5 Flash",    "context": 1000000},
    ],
    "azure": [
        {"id": "gpt-4o",      "label": "Azure GPT-4o (deployment)",     "context": 128000},
        {"id": "gpt-4-turbo", "label": "Azure GPT-4 Turbo (deployment)", "context": 128000},
    ],
}
