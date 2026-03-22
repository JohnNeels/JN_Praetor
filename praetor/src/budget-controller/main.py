"""
PRAETOR Enterprise — Budget Controller
Enforces per-agent PTU limits against the 40 PTU total pool.
All LLM calls MUST pass through this controller before execution.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
from prometheus_client import Counter, Gauge, make_asgi_app

logger = logging.getLogger(__name__)

# ─── Metrics ───
ptu_requests_total = Counter(
    "praetor_ptu_requests_total", "PTU requests", ["agent_name", "result"]
)
ptu_gauge = Gauge(
    "praetor_ptu_pool_remaining", "Remaining PTU in pool"
)

# ─── Config ───
TOTAL_PTU = int(os.getenv("TOTAL_PTU", "40"))
RESERVE_PTU = int(os.getenv("RESERVE_PTU", "5"))
AVAILABLE_PTU = TOTAL_PTU - RESERVE_PTU  # 35 allocatable
HARD_LIMIT = os.getenv("HARD_LIMIT_ENFORCE", "true").lower() == "true"

# Per-agent hard caps (from agents.yaml — duplicated here for enforcement)
AGENT_BUDGETS: dict[str, int] = {
    "sentinel-1": 8,
    "nova-7":      8,
    "echo-2":      4,
    "weaver-4":    6,
    "herald-3":    6,
    "forge-5":     6,
    "atlas-6":     4,
    "oracle-8":    4,
    "prism-9":     6,
    "relay-10":    2,
    "cipher-11":   2,
    "nexus-12":    4,
}

# ─── Models ───
class PTURequest(BaseModel):
    agent_name: str
    requested_ptu: int
    task_id: str
    task_type: str
    model: str = "claude-sonnet-4-20250514"

class PTUResponse(BaseModel):
    approved: bool
    allocated_ptu: int
    agent_budget_remaining: int
    pool_remaining: int
    reason: str | None = None

class PTUUsageReport(BaseModel):
    total_ptu: int
    reserve_ptu: int
    available_ptu: int
    pool_consumed: int
    pool_remaining: int
    agents: dict[str, dict[str, Any]]

# ─── App ───
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = await redis.from_url(
        f"redis://:{os.getenv('REDIS_PASSWORD','')}@{os.getenv('REDIS_HOST','localhost')}:6379",
        encoding="utf-8", decode_responses=True,
    )
    # Initialise agent budgets in Redis if not set
    for agent, budget in AGENT_BUDGETS.items():
        key = f"budget:{agent}:max"
        if not await app.state.redis.get(key):
            await app.state.redis.set(key, budget)
    yield
    await app.state.redis.close()

app = FastAPI(
    title="PRAETOR Budget Controller",
    description="PTU budget enforcement for all agent LLM calls",
    version="1.0.0",
    lifespan=lifespan,
)
app.mount("/metrics", make_asgi_app())

# ─── Core Logic ───
async def get_pool_consumed(r) -> int:
    total = 0
    for agent in AGENT_BUDGETS:
        val = await r.get(f"budget:{agent}:consumed_session")
        total += int(val or 0)
    return total

@app.get("/health/live")
async def live():
    return {"status": "ok"}

@app.get("/health/ready")
async def ready():
    await app.state.redis.ping()
    return {"status": "ready"}

@app.post("/budget/request", response_model=PTUResponse)
async def request_budget(req: PTURequest):
    """
    Agent calls this BEFORE making any LLM call.
    Returns approval + allocated PTU or rejection with reason.
    """
    r = app.state.redis
    agent = req.agent_name.lower()

    # ── 1. Check agent is known ──
    if agent not in AGENT_BUDGETS:
        raise HTTPException(status_code=400, detail=f"Unknown agent: {agent}")

    agent_max = AGENT_BUDGETS[agent]
    agent_consumed = int(await r.get(f"budget:{agent}:consumed_session") or 0)
    agent_remaining = agent_max - agent_consumed
    pool_consumed = await get_pool_consumed(r)
    pool_remaining = AVAILABLE_PTU - pool_consumed

    # ── 2. Check agent budget ──
    if req.requested_ptu > agent_remaining:
        msg = (
            f"{agent} PTU budget exceeded: requested {req.requested_ptu}, "
            f"remaining {agent_remaining}/{agent_max}"
        )
        logger.warning(msg)
        ptu_requests_total.labels(agent_name=agent, result="rejected_agent_limit").inc()
        if HARD_LIMIT:
            return PTUResponse(
                approved=False,
                allocated_ptu=0,
                agent_budget_remaining=agent_remaining,
                pool_remaining=pool_remaining,
                reason=msg,
            )
        # Soft limit: warn but allow with capped allocation
        allocated = min(req.requested_ptu, agent_remaining)
    else:
        allocated = req.requested_ptu

    # ── 3. Check pool budget ──
    if allocated > pool_remaining:
        msg = f"Global PTU pool exhausted: {pool_remaining} remaining of {AVAILABLE_PTU}"
        logger.error(msg)
        ptu_requests_total.labels(agent_name=agent, result="rejected_pool_limit").inc()
        return PTUResponse(
            approved=False,
            allocated_ptu=0,
            agent_budget_remaining=agent_remaining,
            pool_remaining=pool_remaining,
            reason=msg,
        )

    # ── 4. Approve & reserve ──
    pipe = r.pipeline()
    pipe.incrby(f"budget:{agent}:consumed_session", allocated)
    pipe.incrby(f"budget:{agent}:consumed_total", allocated)
    pipe.set(f"budget:{agent}:last_task", req.task_id)
    pipe.set(f"budget:{agent}:last_task_type", req.task_type)
    pipe.set(f"budget:{agent}:last_model", req.model)
    await pipe.execute()

    new_pool_remaining = pool_remaining - allocated
    ptu_gauge.set(new_pool_remaining)
    ptu_requests_total.labels(agent_name=agent, result="approved").inc()

    logger.info(
        f"PTU approved: agent={agent} allocated={allocated} "
        f"agent_remaining={agent_remaining - allocated} pool_remaining={new_pool_remaining}"
    )
    return PTUResponse(
        approved=True,
        allocated_ptu=allocated,
        agent_budget_remaining=agent_remaining - allocated,
        pool_remaining=new_pool_remaining,
    )

@app.post("/budget/release")
async def release_budget(agent_name: str, ptu_unused: int, task_id: str):
    """Return unused PTU allocation after task completes."""
    r = app.state.redis
    agent = agent_name.lower()
    if ptu_unused > 0:
        await r.decrby(f"budget:{agent}:consumed_session", ptu_unused)
        logger.info(f"PTU returned: agent={agent} returned={ptu_unused} task={task_id}")
    return {"released": ptu_unused}

@app.get("/budget/report", response_model=PTUUsageReport)
async def get_report():
    r = app.state.redis
    agents_data: dict[str, dict] = {}
    for agent, max_budget in AGENT_BUDGETS.items():
        consumed = int(await r.get(f"budget:{agent}:consumed_session") or 0)
        agents_data[agent] = {
            "max": max_budget,
            "consumed": consumed,
            "remaining": max(max_budget - consumed, 0),
            "pct_used": round(consumed / max_budget * 100, 1) if max_budget else 0,
            "last_task": await r.get(f"budget:{agent}:last_task"),
            "last_model": await r.get(f"budget:{agent}:last_model"),
        }
    pool_consumed = await get_pool_consumed(r)
    return PTUUsageReport(
        total_ptu=TOTAL_PTU,
        reserve_ptu=RESERVE_PTU,
        available_ptu=AVAILABLE_PTU,
        pool_consumed=pool_consumed,
        pool_remaining=max(AVAILABLE_PTU - pool_consumed, 0),
        agents=agents_data,
    )

@app.post("/budget/reset/{agent_name}")
async def reset_agent_budget(agent_name: str):
    """Reset session budget for an agent (operator use only)."""
    await app.state.redis.set(f"budget:{agent_name.lower()}:consumed_session", 0)
    logger.info(f"Session budget reset for {agent_name}")
    return {"reset": True, "agent": agent_name}
