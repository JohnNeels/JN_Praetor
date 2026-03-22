"""
PRAETOR — NOVA-7: RCA Analyst Agent
Performs root cause analysis using Splunk and Dynatrace data.
Produces structured RCA reports and attaches to ServiceNow incidents.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from base_agent import BaseAgent, AgentTask, AgentResult

logger = logging.getLogger(__name__)


class Nova7Agent(BaseAgent):

    @property
    def system_prompt(self) -> str:
        return """You are NOVA-7, an elite Root Cause Analysis specialist for enterprise ITOps.

Your persona:
- Methodical and evidence-driven. You never guess — you follow the data.
- You produce structured RCA reports with: Timeline, Root Cause, Contributing Factors, Impact, Remediation Steps.
- You cite exact log lines, trace IDs, and metric values to support every conclusion.
- You assign a confidence score (0-100%) to your root cause hypothesis.
- If evidence is insufficient, you say so and list what additional data is needed.
- You communicate in clear technical English. No filler. No hedging without data.

Your workflow for RCA:
1. Retrieve correlated log events from Splunk for the affected time window
2. Pull distributed traces from Dynatrace for the affected service
3. Identify the earliest anomaly (the "first signal")
4. Trace the causal chain from first signal to user impact
5. Identify root cause with confidence score
6. Propose concrete remediation steps with effort estimates
7. Document findings in ServiceNow incident

Output format:
Always produce a JSON-structured RCA report with fields:
incident_id, root_cause, confidence_pct, timeline, contributing_factors, impact_summary, remediation_steps, evidence_refs

You have access to: Splunk (read/write), Dynatrace (read/write), GitHub (read), ServiceNow (read/write).
You do NOT have access to: email, Terraform, deploy actions."""

    async def handle_task(self, task: AgentTask) -> AgentResult:
        logger.info(f"[NOVA-7] Starting RCA for incident: {task.incident_id}")

        messages = [
            {
                "role": "user",
                "content": f"""Perform a root cause analysis for the following incident:

Incident ID: {task.incident_id or 'UNKNOWN'}
Source: {task.source}
Priority: {task.priority.upper()}
Alert Details: {json.dumps(task.payload, indent=2)}
Timestamp: {datetime.now(timezone.utc).isoformat()}

Steps:
1. Search Splunk for correlated events in the ±30 min window around the incident
2. Pull Dynatrace traces for affected services
3. Identify root cause with confidence score
4. Produce a structured RCA report
5. Update the ServiceNow incident with your findings

Begin your investigation.""",
            }
        ]

        try:
            rca_output = await self._call_llm(
                messages=messages,
                task_id=task.task_id,
                estimated_ptu=3,
                max_tokens=4096,
            )

            # Parse structured output if JSON
            try:
                rca_data = json.loads(rca_output)
            except json.JSONDecodeError:
                rca_data = {"raw_analysis": rca_output}

            return AgentResult(
                task_id=task.task_id,
                agent_name="NOVA-7",
                status="completed",
                summary=f"RCA completed for {task.incident_id}: {rca_data.get('root_cause', 'See details')}",
                details=rca_data,
                actions_taken=[
                    "Queried Splunk event correlation",
                    "Pulled Dynatrace distributed traces",
                    "Generated structured RCA report",
                    "Updated ServiceNow incident",
                ],
            )
        except RuntimeError as e:
            if "PTU budget" in str(e):
                logger.error(f"[NOVA-7] PTU exhausted during RCA: {e}")
                return AgentResult(
                    task_id=task.task_id,
                    agent_name="NOVA-7",
                    status="failed",
                    summary="PTU budget exhausted — RCA incomplete",
                    details={"error": str(e)},
                    escalation_required=True,
                )
            raise


# ─────────────────────────────────────────────
# FastAPI wrapper — each agent is a microservice
# ─────────────────────────────────────────────
from contextlib import asynccontextmanager

agent_instance: Nova7Agent | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent_instance
    agent_instance = Nova7Agent()
    yield
    if agent_instance:
        await agent_instance.close()

app = FastAPI(title="NOVA-7 Agent", lifespan=lifespan)

class TaskIn(BaseModel):
    task_id: str
    task_type: str
    source: str
    priority: str = "p3"
    payload: dict = {}
    incident_id: str | None = None

@app.get("/health/live")
async def live():
    return {"status": "ok"}

@app.get("/health/ready")
async def ready():
    return {"status": "ready", "agent": "NOVA-7"}

@app.post("/tasks")
async def receive_task(task_in: TaskIn):
    task = AgentTask(**task_in.model_dump())
    result = await agent_instance.handle_task(task)
    return result.model_dump()
