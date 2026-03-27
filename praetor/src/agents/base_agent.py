"""
PRAETOR Enterprise — Base Agent Runtime
All agents inherit from BaseAgent. Each agent:
  1. Loads its skill config from agents.yaml
  2. Checks its PTU budget before every LLM call
  3. Routes all tool calls through the MCP Gateway (with AuthZ)
  4. Streams results back to the Orchestrator
  5. Writes structured audit logs via OpenTelemetry
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator

import httpx
import yaml
from opentelemetry import trace
from pydantic import BaseModel

from llm_provider import get_provider, AVAILABLE_MODELS

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("praetor.agent")

BUDGET_CONTROLLER_URL = os.getenv("BUDGET_CONTROLLER_URL", "http://praetor-budget-controller:8100")
MCP_GATEWAY_URL       = os.getenv("MCP_GATEWAY_URL",       "http://praetor-mcp-gateway:9000")
ORCHESTRATOR_URL      = os.getenv("ORCHESTRATOR_URL",      "http://praetor-orchestrator:8000")


class AgentTask(BaseModel):
    task_id: str
    task_type: str
    source: str
    priority: str
    payload: dict[str, Any]
    incident_id: str | None = None


class AgentResult(BaseModel):
    task_id: str
    agent_name: str
    status: str          # completed | failed | escalated | needs_approval
    summary: str
    details: dict[str, Any] = {}
    actions_taken: list[str] = []
    escalation_required: bool = False
    human_approval_required: bool = False
    approval_payload: dict[str, Any] | None = None


class BaseAgent(ABC):
    """
    Base class for all PRAETOR ITOps agents.
    Subclass this and implement `system_prompt` and `handle_task`.
    """

    def __init__(self):
        self.agent_name   = os.getenv("AGENT_NAME",      "unknown")
        self.persona      = os.getenv("AGENT_PERSONA",   "Unknown")
        self.ptu_budget   = int(os.getenv("AGENT_PTU_BUDGET", "4"))
        self.skill_config = self._load_skill_config()
        self.http         = httpx.AsyncClient(timeout=60.0)
        # Provider is selected by LLM_PROVIDER env var (anthropic | openai | gemini | azure)
        # Model is selected by LLM_MODEL env var; falls back to provider default
        self.llm_provider = get_provider()
        self._tools       = self._build_tool_list()
        logger.info(
            f"Agent {self.agent_name} ({self.persona}) initialised — "
            f"provider={self.llm_provider.__class__.__name__} "
            f"model={self.llm_provider.model_id} "
            f"ptu_budget={self.ptu_budget}"
        )

    def _load_skill_config(self) -> dict:
        path = os.getenv("SKILL_CONFIG_PATH", f"/app/skills/{self.agent_name}.yaml")
        try:
            with open(path) as f:
                return yaml.safe_load(f) or {}
        except FileNotFoundError:
            logger.warning(f"No skill config at {path}, using defaults")
            return {}

    def _build_tool_list(self) -> list[dict]:
        """Build Anthropic tool definitions from skill config."""
        tools = []
        for skill in self.skill_config.get("skills", []):
            tools.append({
                "name": skill["id"],
                "description": skill["description"],
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Query or action to execute"},
                        "parameters": {"type": "object", "description": "Additional parameters"},
                    },
                    "required": ["query"],
                },
            })
        return tools

    @property
    @abstractmethod
    def system_prompt(self) -> str:
        """Each agent defines its own system prompt from its persona."""
        ...

    @abstractmethod
    async def handle_task(self, task: AgentTask) -> AgentResult:
        """Each agent implements its task handling logic."""
        ...

    async def _check_budget(self, estimated_ptu: int = 1, task_id: str = "") -> bool:
        """Check with Budget Controller before making an LLM call."""
        try:
            resp = await self.http.post(
                f"{BUDGET_CONTROLLER_URL}/budget/request",
                json={
                    "agent_name": self.agent_name,
                    "requested_ptu": estimated_ptu,
                    "task_id": task_id,
                    "task_type": "llm_call",
                    "model": self.llm_provider.model_id,
                },
            )
            data = resp.json()
            if not data.get("approved"):
                logger.warning(
                    f"[{self.agent_name}] PTU budget rejected: {data.get('reason')}"
                )
                return False
            return True
        except Exception as e:
            logger.error(f"[{self.agent_name}] Budget check failed: {e}")
            # Fail-safe: deny on controller unavailability
            return False

    async def _call_llm(
        self,
        messages: list[dict],
        task_id: str = "",
        estimated_ptu: int = 1,
        max_tokens: int = 4096,
    ) -> str:
        """
        Provider-agnostic LLM call with tool-use loop.
        Always checks PTU budget first. Works with Anthropic, OpenAI, Gemini, Azure.
        """
        approved = await self._check_budget(estimated_ptu, task_id)
        if not approved:
            raise RuntimeError(f"PTU budget exhausted for agent {self.agent_name}")

        with tracer.start_as_current_span(f"{self.agent_name}.llm_call") as span:
            span.set_attribute("agent.name",       self.agent_name)
            span.set_attribute("agent.task_id",    task_id)
            span.set_attribute("llm.provider",     self.llm_provider.__class__.__name__)
            span.set_attribute("llm.model",        self.llm_provider.model_id)

            # Initial call
            response = await self.llm_provider.complete(
                system=self.system_prompt,
                messages=messages,
                tools=self._tools,
                max_tokens=max_tokens,
            )

            # Tool use loop — provider-agnostic
            while response.wants_tools:
                tool_results = []
                for tc in response.tool_calls:
                    result = await self._execute_tool(tc.name, tc.input, task_id)
                    tool_results.append({
                        "tool_use_id": tc.id,
                        "content": str(result),
                    })

                messages = self.llm_provider.append_tool_results(messages, response, tool_results)
                response = await self.llm_provider.complete(
                    system=self.system_prompt,
                    messages=messages,
                    tools=self._tools,
                    max_tokens=max_tokens,
                )

            return response.text

    async def _execute_tool(self, tool_name: str, tool_input: dict, task_id: str) -> Any:
        """
        Route tool calls through MCP Gateway.
        Gateway enforces ACL — agent cannot bypass permissions.
        """
        with tracer.start_as_current_span(f"{self.agent_name}.tool_call") as span:
            span.set_attribute("tool.name", tool_name)
            span.set_attribute("agent.name", self.agent_name)
            try:
                resp = await self.http.post(
                    f"{MCP_GATEWAY_URL}/tools/execute",
                    json={
                        "agent_name": self.agent_name,
                        "tool_name": tool_name,
                        "input": tool_input,
                        "task_id": task_id,
                    },
                    headers={"X-Agent-Name": self.agent_name},
                )
                if resp.status_code == 403:
                    logger.warning(f"[{self.agent_name}] Tool {tool_name} access denied by ACL")
                    return {"error": "access_denied", "tool": tool_name}
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPError as e:
                logger.error(f"[{self.agent_name}] Tool {tool_name} call failed: {e}")
                return {"error": str(e), "tool": tool_name}

    async def request_human_approval(self, action: str, payload: dict, reason: str) -> AgentResult:
        """Return a result requesting human approval instead of acting autonomously."""
        logger.info(f"[{self.agent_name}] Requesting human approval for: {action}")
        return AgentResult(
            task_id=payload.get("task_id", str(uuid.uuid4())),
            agent_name=self.agent_name,
            status="needs_approval",
            summary=f"Action '{action}' requires human approval: {reason}",
            human_approval_required=True,
            approval_payload={"action": action, "reason": reason, **payload},
        )

    async def close(self):
        await self.http.aclose()
