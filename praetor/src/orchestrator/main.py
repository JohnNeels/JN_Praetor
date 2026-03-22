"""
PRAETOR Enterprise — Orchestrator Service
Central coordination for all ITOps agents.
FastAPI application with async agent dispatch.
"""
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, List

import httpx
import redis.asyncio as redis
import yaml
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram, Gauge, make_asgi_app

# ─────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "service": "orchestrator", "msg": "%(message)s"}',
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# OpenTelemetry Setup
# ─────────────────────────────────────────────
provider = TracerProvider()
otlp_exporter = OTLPSpanExporter(
    endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
)
provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("praetor.orchestrator")

# ─────────────────────────────────────────────
# Prometheus Metrics
# ─────────────────────────────────────────────
tasks_dispatched = Counter(
    "praetor_tasks_dispatched_total",
    "Total tasks dispatched to agents",
    ["agent_name", "task_type"]
)
tasks_completed = Counter(
    "praetor_tasks_completed_total",
    "Total tasks completed",
    ["agent_name", "status"]
)
active_agents = Gauge(
    "praetor_active_agents",
    "Number of currently active agents"
)
task_duration = Histogram(
    "praetor_task_duration_seconds",
    "Task duration",
    ["agent_name", "task_type"],
    buckets=[1, 5, 15, 30, 60, 120, 300]
)
ptu_consumed = Gauge(
    "praetor_ptu_consumed",
    "PTU currently consumed",
    ["agent_name"]
)

# ─────────────────────────────────────────────
# Config Loading
# ─────────────────────────────────────────────
def load_agent_config() -> dict:
    config_path = os.getenv("AGENT_CONFIG_PATH", "/app/config/agents.yaml")
    with open(config_path) as f:
        return yaml.safe_load(f)

def load_acl_config() -> dict:
    acl_path = os.getenv("ACL_CONFIG_PATH", "/app/config/tool-acl.yaml")
    with open(acl_path) as f:
        return yaml.safe_load(f)

# ─────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────
class TaskRequest(BaseModel):
    task_type: str = Field(..., description="Type: rca | alert | email | incident | correlation | discovery")
    source: str = Field(..., description="Source system: splunk | dynatrace | webex | teams | servicenow | email | github")
    priority: str = Field(default="p3", pattern="^p[1-4]$")
    payload: dict[str, Any] = Field(default_factory=dict)
    incident_id: str | None = None
    requester: str | None = None

class TaskResponse(BaseModel):
    task_id: str
    assigned_agent: str
    status: str
    estimated_completion_seconds: int

class AgentStatus(BaseModel):
    agent_name: str
    persona: str
    state: str          # active | working | idle | alert | error
    ptu_consumed: int
    ptu_budget: int
    current_task: str | None
    tasks_completed_24h: int

class HealthResponse(BaseModel):
    status: str
    agents_active: int
    ptu_total: int
    ptu_consumed: int
    version: str = "1.0.0"

# ─────────────────────────────────────────────
# App Lifespan
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("PRAETOR Orchestrator starting up")
    app.state.redis = await redis.from_url(
        f"redis://:{os.getenv('REDIS_PASSWORD', '')}@{os.getenv('REDIS_HOST', 'localhost')}:6379",
        encoding="utf-8",
        decode_responses=True,
    )
    app.state.agent_config = load_agent_config()
    app.state.acl_config = load_acl_config()
    app.state.http_client = httpx.AsyncClient(timeout=30.0)
    active_agents.set(len(app.state.agent_config.get("agents", {})))
    logger.info(f"Loaded {len(app.state.agent_config.get('agents', {}))} agent definitions")
    yield
    # Shutdown
    logger.info("PRAETOR Orchestrator shutting down")
    await app.state.redis.close()
    await app.state.http_client.aclose()

# ─────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────
app = FastAPI(
    title="PRAETOR Orchestrator",
    description="Central coordination service for the PRAETOR ITOps agentic platform",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Mount Prometheus metrics endpoint
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# CORS — restrict to internal only in prod
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Authorization", "Content-Type"],
)

FastAPIInstrumentor.instrument_app(app)

# ─────────────────────────────────────────────
# Agent Routing Logic
# ─────────────────────────────────────────────
TASK_ROUTING: dict[str, list[str]] = {
    "rca":          ["nova-7", "weaver-4"],
    "alert":        ["echo-2", "sentinel-1"],
    "email":        ["herald-3"],
    "incident":     ["herald-3", "nova-7"],
    "correlation":  ["weaver-4", "nova-7"],
    "discovery":    ["atlas-6"],
    "security":     ["sentinel-1"],
    "devops":       ["forge-5"],
}

AGENT_BASE_URLS: dict[str, str] = {
    agent_name: f"http://praetor-agent-{agent_name}.praetor.svc.cluster.local:8080"
    for agent_name in [
        "sentinel-1", "nova-7", "echo-2", "weaver-4",
        "herald-3", "forge-5", "atlas-6",
        "oracle-8", "prism-9", "relay-10", "cipher-11", "nexus-12"
    ]
}

async def select_agent(task_type: str, priority: str, redis_client) -> str:
    """Select the best available agent for the task."""
    candidates = TASK_ROUTING.get(task_type, ["nova-7"])
    for candidate in candidates:
        state_key = f"agent:{candidate}:state"
        ptu_key = f"agent:{candidate}:ptu_consumed"
        state = await redis_client.get(state_key) or "idle"
        ptu = int(await redis_client.get(ptu_key) or 0)
        # Don't assign to errored agents, skip if over-budgeted
        if state not in ("error",) and ptu < 100:
            return candidate
    return candidates[0]  # Fall back to primary

async def dispatch_task(task_id: str, agent_name: str, request: TaskRequest, http_client: httpx.AsyncClient, redis_client):
    """Dispatch task to agent and track result."""
    import time
    start = time.time()
    try:
        await redis_client.set(f"agent:{agent_name}:state", "working", ex=3600)
        agent_url = AGENT_BASE_URLS[agent_name]
        resp = await http_client.post(
            f"{agent_url}/tasks",
            json={"task_id": task_id, **request.model_dump()},
        )
        resp.raise_for_status()
        tasks_completed.labels(agent_name=agent_name, status="success").inc()
    except Exception as exc:
        logger.error(f"Task {task_id} failed on {agent_name}: {exc}")
        tasks_completed.labels(agent_name=agent_name, status="error").inc()
        await redis_client.set(f"task:{task_id}:status", "failed")
        return
    finally:
        duration = time.time() - start
        task_duration.labels(agent_name=agent_name, task_type=request.task_type).observe(duration)
        await redis_client.set(f"agent:{agent_name}:state", "active", ex=3600)

    await redis_client.set(f"task:{task_id}:status", "completed", ex=86400)
    logger.info(f"Task {task_id} completed by {agent_name}")

# ─────────────────────────────────────────────
# API Routes
# ─────────────────────────────────────────────
@app.get("/health/live", response_model=dict)
async def liveness():
    return {"status": "ok"}

@app.get("/health/ready", response_model=HealthResponse)
async def readiness():
    try:
        await app.state.redis.ping()
    except Exception:
        raise HTTPException(status_code=503, detail="Redis unavailable")
    total_ptu = int(os.getenv("TOTAL_PTU", "40"))
    consumed = 0
    for agent_name in AGENT_BASE_URLS:
        val = await app.state.redis.get(f"agent:{agent_name}:ptu_consumed")
        consumed += int(val or 0)
    return HealthResponse(
        status="ready",
        agents_active=len(AGENT_BASE_URLS),
        ptu_total=total_ptu,
        ptu_consumed=consumed,
    )

@app.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_task(request: TaskRequest, background_tasks: BackgroundTasks):
    """Accept and dispatch a new task to the appropriate agent."""
    import uuid
    with tracer.start_as_current_span("orchestrator.create_task") as span:
        task_id = str(uuid.uuid4())
        span.set_attribute("task.id", task_id)
        span.set_attribute("task.type", request.task_type)
        span.set_attribute("task.priority", request.priority)

        agent_name = await select_agent(
            request.task_type, request.priority, app.state.redis
        )
        await app.state.redis.set(f"task:{task_id}:agent", agent_name)
        await app.state.redis.set(f"task:{task_id}:status", "dispatched")

        tasks_dispatched.labels(agent_name=agent_name, task_type=request.task_type).inc()
        background_tasks.add_task(
            dispatch_task, task_id, agent_name, request,
            app.state.http_client, app.state.redis
        )

        logger.info(f"Task {task_id} ({request.task_type}/{request.priority}) → {agent_name}")
        eta = {"p1": 30, "p2": 60, "p3": 180, "p4": 600}.get(request.priority, 180)
        return TaskResponse(
            task_id=task_id,
            assigned_agent=agent_name,
            status="dispatched",
            estimated_completion_seconds=eta,
        )

@app.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    status_val = await app.state.redis.get(f"task:{task_id}:status")
    agent = await app.state.redis.get(f"task:{task_id}:agent")
    if not status_val:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task_id": task_id, "status": status_val, "agent": agent}

@app.get("/agents", response_model=List[AgentStatus])
async def list_agents():
    statuses = []
    for name, config in app.state.agent_config.get("agents", {}).items():
        state = await app.state.redis.get(f"agent:{config['name'].lower()}:state") or "idle"
        ptu = int(await app.state.redis.get(f"agent:{config['name'].lower()}:ptu_consumed") or 0)
        completed = int(await app.state.redis.get(f"agent:{config['name'].lower()}:completed_24h") or 0)
        statuses.append(AgentStatus(
            agent_name=config["name"],
            persona=config["persona"]["role"],
            state=state,
            ptu_consumed=ptu,
            ptu_budget=config["ptu_budget"],
            current_task=await app.state.redis.get(f"agent:{config['name'].lower()}:current_task"),
            tasks_completed_24h=completed,
        ))
    return statuses

@app.get("/agents/{agent_name}", response_model=AgentStatus)
async def get_agent(agent_name: str):
    config = app.state.agent_config.get("agents", {}).get(agent_name)
    if not config:
        raise HTTPException(status_code=404, detail=f"Agent {agent_name} not found")
    key = config["name"].lower()
    return AgentStatus(
        agent_name=config["name"],
        persona=config["persona"]["role"],
        state=await app.state.redis.get(f"agent:{key}:state") or "idle",
        ptu_consumed=int(await app.state.redis.get(f"agent:{key}:ptu_consumed") or 0),
        ptu_budget=config["ptu_budget"],
        current_task=await app.state.redis.get(f"agent:{key}:current_task"),
        tasks_completed_24h=int(await app.state.redis.get(f"agent:{key}:completed_24h") or 0),
    )

@app.post("/agents/{agent_name}/pause")
async def pause_agent(agent_name: str):
    """Pause an agent (human operator control)."""
    await app.state.redis.set(f"agent:{agent_name}:state", "paused")
    logger.info(f"Agent {agent_name} paused by operator")
    return {"status": "paused", "agent": agent_name}

@app.post("/agents/{agent_name}/resume")
async def resume_agent(agent_name: str):
    """Resume a paused agent."""
    await app.state.redis.set(f"agent:{agent_name}:state", "active")
    logger.info(f"Agent {agent_name} resumed by operator")
    return {"status": "active", "agent": agent_name}
