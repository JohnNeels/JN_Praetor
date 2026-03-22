"""
PRAETOR Enterprise — MCP Gateway
All agent tool calls pass through here.
Enforces the Tool ACL matrix before proxying to external systems.
Provides unified audit logging of every tool invocation.
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Any

import httpx
import yaml
from fastapi import FastAPI, HTTPException, Request, status
from opentelemetry import trace
from prometheus_client import Counter, Histogram, make_asgi_app
from pydantic import BaseModel

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("praetor.mcp-gateway")

# ─── Metrics ───
tool_calls_total = Counter(
    "praetor_tool_calls_total",
    "Tool calls by agent and tool",
    ["agent_name", "tool_name", "result"]
)
tool_call_duration = Histogram(
    "praetor_tool_call_duration_seconds",
    "Duration of tool calls",
    ["tool_name"],
)

# ─── ACL Loading ───
def load_acl() -> dict:
    path = os.getenv("ACL_CONFIG_PATH", "/app/config/tool-acl.yaml")
    with open(path) as f:
        return yaml.safe_load(f)

ACL: dict = {}

# ─── Tool Backend Registry ───
# Each integration has a backend handler class
INTEGRATION_BACKENDS: dict[str, str] = {
    "splunk-threat-search":          "splunk",
    "splunk-rca-search":             "splunk",
    "dynatrace-trace-analysis":      "dynatrace",
    "dynatrace-anomaly-correlation": "dynatrace",
    "topology-graph-analysis":       "dynatrace",
    "webex-alert-ingest":            "webex",
    "teams-alert-ingest":            "teams",
    "servicenow-incident-create":    "servicenow",
    "servicenow-incident-manage":    "servicenow",
    "servicenow-rca-attach":         "servicenow",
    "servicenow-change-request":     "servicenow",
    "github-read-repo":              "github",
    "github-create-pr":              "github",
    "github-read-ci-logs":           "github",
    "email-inbox-monitor":           "email",
    "email-draft-response":          "email",
    "api-discovery":                 "azure",
    "cmdb-sync":                     "servicenow",
}

APPROVAL_REQUIRED_TOOLS = {
    "email-draft-response",
    "servicenow-change-request",
    "github-create-pr",
}

# ─── Models ───
class ToolExecuteRequest(BaseModel):
    agent_name: str
    tool_name: str
    input: dict[str, Any]
    task_id: str

class ToolExecuteResponse(BaseModel):
    call_id: str
    tool_name: str
    agent_name: str
    status: str
    result: Any
    approval_required: bool = False
    duration_ms: float

# ─── App ───
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ACL
    ACL = load_acl()
    app.state.http = httpx.AsyncClient(timeout=30.0)
    logger.info(f"MCP Gateway started — ACL loaded for {len(ACL.get('agents', {}))} agents")
    yield
    await app.state.http.aclose()

app = FastAPI(
    title="PRAETOR MCP Gateway",
    description="Tool access control and proxy for all agent tool calls",
    version="1.0.0",
    lifespan=lifespan,
)
app.mount("/metrics", make_asgi_app())

# ─── ACL Enforcement ───
def check_acl(agent_name: str, tool_name: str, operation: str = "read") -> tuple[bool, str]:
    """
    Returns (allowed: bool, reason: str).
    Looks up the ACL matrix from tool-acl.yaml.
    """
    agent_acl = ACL.get("agents", {}).get(agent_name, {})
    if not agent_acl:
        return False, f"Agent '{agent_name}' not found in ACL matrix"

    backend = INTEGRATION_BACKENDS.get(tool_name)
    if not backend:
        return False, f"Unknown tool '{tool_name}'"

    tool_perms = agent_acl.get("tools_allowed", {}).get(backend, [])
    if not tool_perms:
        return False, f"Agent '{agent_name}' has no access to backend '{backend}'"

    if operation not in tool_perms and "read" not in tool_perms:
        return False, (
            f"Agent '{agent_name}' has permissions {tool_perms} on '{backend}', "
            f"but operation '{operation}' is not allowed"
        )

    return True, "allowed"

# ─── Backend Dispatch ───
async def dispatch_to_backend(
    backend: str,
    tool_name: str,
    tool_input: dict,
    http: httpx.AsyncClient,
    agent_name: str,
) -> dict:
    """
    Proxy the tool call to the appropriate backend integration.
    In production, each backend has its own adapter service or direct API call.
    """
    # Integration service URLs (injected from ConfigMap in K8s)
    backend_urls = {
        "splunk":      os.getenv("SPLUNK_URL", "https://splunk.your-org.com:8089"),
        "dynatrace":   os.getenv("DYNATRACE_URL", "https://dynatrace.your-org.com/api/v2"),
        "webex":       os.getenv("WEBEX_URL", "https://webexapis.com/v1"),
        "teams":       os.getenv("TEAMS_URL", "https://graph.microsoft.com/v1.0"),
        "servicenow":  os.getenv("SNOW_URL", "https://your-org.service-now.com/api/now"),
        "github":      os.getenv("GITHUB_MCP_URL", "https://mcp.github.com/sse"),
        "email":       os.getenv("EXCHANGE_URL", "https://graph.microsoft.com/v1.0"),
        "azure":       os.getenv("AZURE_URL", "https://management.azure.com"),
    }

    base_url = backend_urls.get(backend, "")
    if not base_url:
        return {"error": f"No backend URL configured for {backend}"}

    # For simulation/testing — return mock response structure
    # In production, this dispatches to real integration endpoints
    logger.info(f"Dispatching {tool_name} → {backend} for agent {agent_name}")
    return {
        "backend": backend,
        "tool": tool_name,
        "status": "dispatched",
        "query": tool_input.get("query", ""),
        "mock_result": f"[{backend.upper()}] Tool '{tool_name}' executed successfully",
    }

# ─── Routes ───
@app.get("/health/live")
async def live():
    return {"status": "ok"}

@app.get("/health/ready")
async def ready():
    return {"status": "ready", "acl_agents": len(ACL.get("agents", {}))}

@app.post("/tools/execute", response_model=ToolExecuteResponse)
async def execute_tool(req: ToolExecuteRequest, request: Request):
    call_id = str(uuid.uuid4())
    start = time.time()

    with tracer.start_as_current_span("mcp_gateway.execute") as span:
        span.set_attribute("agent.name", req.agent_name)
        span.set_attribute("tool.name", req.tool_name)
        span.set_attribute("task.id", req.task_id)

        # ── 1. ACL Check ──
        allowed, reason = check_acl(req.agent_name, req.tool_name)
        if not allowed:
            tool_calls_total.labels(
                agent_name=req.agent_name, tool_name=req.tool_name, result="denied"
            ).inc()
            logger.warning(f"ACL DENY [{req.agent_name}] → {req.tool_name}: {reason}")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=reason)

        # ── 2. Approval gate check ──
        approval_required = req.tool_name in APPROVAL_REQUIRED_TOOLS
        if approval_required:
            logger.info(f"[{req.agent_name}] Tool {req.tool_name} flagged for human approval")
            # Queue for human approval instead of executing
            tool_calls_total.labels(
                agent_name=req.agent_name, tool_name=req.tool_name, result="approval_queued"
            ).inc()
            return ToolExecuteResponse(
                call_id=call_id,
                tool_name=req.tool_name,
                agent_name=req.agent_name,
                status="pending_approval",
                result={"queued": True, "reason": "Human approval required"},
                approval_required=True,
                duration_ms=round((time.time() - start) * 1000, 2),
            )

        # ── 3. Execute ──
        backend = INTEGRATION_BACKENDS.get(req.tool_name, "unknown")
        try:
            result = await dispatch_to_backend(
                backend, req.tool_name, req.input, request.app.state.http, req.agent_name
            )
            tool_calls_total.labels(
                agent_name=req.agent_name, tool_name=req.tool_name, result="success"
            ).inc()
        except Exception as e:
            tool_calls_total.labels(
                agent_name=req.agent_name, tool_name=req.tool_name, result="error"
            ).inc()
            logger.error(f"Tool execution failed [{req.agent_name}] {req.tool_name}: {e}")
            raise HTTPException(status_code=500, detail=str(e))

        duration = round((time.time() - start) * 1000, 2)
        tool_call_duration.labels(tool_name=req.tool_name).observe(duration / 1000)

        logger.info(
            f"TOOL OK [{req.agent_name}] {req.tool_name} → {backend} "
            f"task={req.task_id} duration={duration}ms"
        )

        return ToolExecuteResponse(
            call_id=call_id,
            tool_name=req.tool_name,
            agent_name=req.agent_name,
            status="success",
            result=result,
            duration_ms=duration,
        )

@app.get("/acl/{agent_name}")
async def get_agent_acl(agent_name: str):
    """Return the ACL for a specific agent (for auditing)."""
    acl = ACL.get("agents", {}).get(agent_name)
    if not acl:
        raise HTTPException(status_code=404, detail=f"Agent {agent_name} not in ACL")
    return {"agent": agent_name, "tools_allowed": acl.get("tools_allowed", {})}
