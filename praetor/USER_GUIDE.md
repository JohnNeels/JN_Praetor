# PRAETOR Enterprise — User & Onboarding Guide

> Version 1.0.0 | Autonomous ITOps Agentic Platform

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Architecture at a Glance](#2-architecture-at-a-glance)
3. [Onboarding Checklist](#3-onboarding-checklist)
4. [Local Development Setup](#4-local-development-setup)
5. [Service Reference](#5-service-reference)
   - [Orchestrator](#51-orchestrator)
   - [Budget Controller](#52-budget-controller)
   - [MCP Gateway](#53-mcp-gateway)
   - [Agent Runtime (BaseAgent)](#54-agent-runtime-baseagent)
6. [Agent Roster & Capabilities](#6-agent-roster--capabilities)
7. [Tool Access Control (ACL)](#7-tool-access-control-acl)
8. [Human Approval Gates](#8-human-approval-gates)
9. [PTU Budget System](#9-ptu-budget-system)
10. [API Reference](#10-api-reference)
11. [Configuration Reference](#11-configuration-reference)
12. [Kubernetes / OpenShift Deployment](#12-kubernetes--openshift-deployment)
13. [CI/CD Pipeline](#13-cicd-pipeline)
14. [Observability & Monitoring](#14-observability--monitoring)
15. [Security Model](#15-security-model)
16. [Adding a New Agent](#16-adding-a-new-agent)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Platform Overview

PRAETOR Enterprise is an autonomous, 24/7 ITOps agent platform. It deploys a coordinated army of 12 AI agents (powered by Claude) that monitor, triage, investigate, and respond to IT events across your enterprise stack — without requiring human intervention for routine tasks.

**What PRAETOR does:**

| Capability | Agents Involved |
|---|---|
| Security threat monitoring & triage | SENTINEL-1 |
| Root cause analysis (RCA) | NOVA-7, WEAVER-4 |
| Alert ingestion & routing | ECHO-2 |
| Cross-signal correlation | WEAVER-4, NOVA-7 |
| Email & ServiceNow comms | HERALD-3 |
| DevOps / CI/CD operations | FORGE-5 |
| Infrastructure mapping & CMDB | ATLAS-6 |
| API endpoint analysis | ORACLE-8 |
| Deep log mining | PRISM-9 |
| On-call escalation | RELAY-10 |
| Compliance & audit | CIPHER-11 |
| Multi-agent workflow orchestration | NEXUS-12 |

**Key principles:**
- All agents are **read-only by default** — write access is explicit and audited
- **Human approval gates** block destructive or external-facing actions
- Every LLM call is **PTU-budget-gated** — no runaway token spend
- Every tool call is **ACL-enforced** at the MCP Gateway layer
- Full audit trail via **OpenTelemetry → Splunk**

---

## 2. Architecture at a Glance

```
External Traffic
      │
      ▼
┌─────────────┐
│ API Gateway │  (Kong / HAProxy on OpenShift)
│  Port 443   │
└──────┬──────┘
       │
       ▼
┌──────────────────┐       ┌──────────────────────┐
│   Orchestrator   │──────▶│  Budget Controller   │
│   FastAPI :8000  │       │  FastAPI :8100        │
│                  │       │  PTU enforcement      │
└──────┬───────────┘       └──────────────────────┘
       │
       ├──────────────────────────────────────────┐
       ▼                                          ▼
┌──────────────┐                        ┌──────────────────┐
│  MCP Gateway │                        │  Agent Pods      │
│  FastAPI     │                        │  (12 agents)     │
│  :9000       │                        │  FastAPI :8080   │
│  ACL matrix  │                        │                  │
└──────┬───────┘                        └──────────────────┘
       │
       ▼
External Integrations:
  Splunk · Dynatrace · WebEx · MS Teams
  ServiceNow · GitHub · Azure · Email (Graph)
```

**Data stores:**
- **Redis** — agent state, task status, PTU counters, session data
- **PostgreSQL** — audit log persistence (production)

---

## 3. Onboarding Checklist

Work through this list in order before going to production.

### Step 1 — Access & Identity
- [ ] Get SSO access to Red Hat SSO (Keycloak), realm `praetor`
- [ ] Confirm your role: **Operator** (read + agent control) or **Admin** (full platform)
- [ ] Request OpenShift namespace access: `praetor` (prod) / `praetor-staging`
- [ ] Confirm you can reach the platform API: `https://praetor-api.apps.ocp.your-org.com/health/live`

### Step 2 — Understand the Platform
- [ ] Read this guide in full (sections 5–9 are critical)
- [ ] Review `config/agents.yaml` — understand each agent's persona and skills
- [ ] Review `config/tool-acl.yaml` — understand what each agent can and cannot do
- [ ] Identify which agents are relevant to your team's workflows

### Step 3 — Local Environment (Developers)
- [ ] Follow [Section 4](#4-local-development-setup) to run the platform locally
- [ ] Verify all four services are healthy via their `/docs` endpoints
- [ ] Submit a test task via the Orchestrator API and observe agent routing

### Step 4 — Integration Configuration
- [ ] Confirm integration endpoints in Vault at `secret/praetor/integrations`
- [ ] Verify each integration that your team uses is listed in `config/integrations.yaml`
- [ ] Work with your security team to provision agent service accounts in each target system

### Step 5 — Production Readiness
- [ ] Review human approval gate configuration (Section 8)
- [ ] Confirm monitoring alerts are routed to your team's PagerDuty/Teams channel
- [ ] Sign off on the Tool ACL matrix with your security team
- [ ] Run `./scripts/smoke-test.sh praetor` post-deployment

---

## 4. Local Development Setup

### Prerequisites

| Tool | Minimum Version | Purpose |
|---|---|---|
| Python | 3.10+ | All services (avoids `str \| None` backport issues) |
| pip | 22+ | Dependency installation |
| Redis | 7.x | Agent state & task tracking |
| Docker (optional) | 24+ | Container-based Redis |

> **Windows note:** Redis can be installed via `winget install Redis.Redis`. It registers as a Windows service and starts automatically.

### 1. Clone and install dependencies

```bash
git clone https://github.com/your-org/praetor.git
cd praetor

pip install -r requirements.txt
# Also installs: eval_type_backport (required for Python < 3.10)
```

### 2. Set required environment variables

```bash
# Required for agent LLM calls
export ANTHROPIC_API_KEY="sk-ant-..."

# Optional overrides (defaults shown)
export REDIS_HOST="localhost"
export REDIS_PASSWORD=""
export TOTAL_PTU="40"
export HARD_LIMIT_ENFORCE="true"
```

### 3. Start Redis

```bash
# Docker
docker run -d --name praetor-redis -p 6379:6379 redis:7-alpine

# Windows service (after winget install)
net start Redis

# Verify
redis-cli ping   # → PONG
```

### 4. Start all platform services

```bash
./scripts/start-local.sh --no-redis    # if Redis is already running
./scripts/start-local.sh               # starts Redis too (Docker or native)
```

The script starts services in dependency order and polls each health endpoint before proceeding.

### 5. Verify

| Service | URL | Expected |
|---|---|---|
| Orchestrator | http://localhost:8000/health/live | `{"status":"ok"}` |
| Orchestrator (ready) | http://localhost:8000/health/ready | agents_active, ptu counts |
| Budget Controller | http://localhost:8100/health/live | `{"status":"ok"}` |
| MCP Gateway | http://localhost:9000/health/live | `{"status":"ok"}` |
| NOVA-7 Agent | http://localhost:8080/health/live | `{"status":"ok"}` |
| Interactive API docs | http://localhost:8000/docs | Swagger UI |

### 6. Stop everything

```bash
./scripts/start-local.sh --stop
```

---

## 5. Service Reference

### 5.1 Orchestrator

**Source:** `src/orchestrator/main.py`
**Port:** `8000` (HTTP) · `9090` (Prometheus metrics)
**Role:** Central brain. Accepts incoming task requests, selects the best available agent, dispatches tasks as background jobs, and tracks task status in Redis.

#### Key responsibilities
- Task ingestion via `POST /tasks`
- Agent selection based on task type and agent state
- PTU-aware routing (skips errored or over-budget agents)
- Task lifecycle tracking in Redis (dispatched → working → completed/failed)
- Agent pause/resume controls for human operators

#### Task routing table

| Task Type | Primary Agent | Fallback |
|---|---|---|
| `rca` | nova-7 | weaver-4 |
| `alert` | echo-2 | sentinel-1 |
| `email` | herald-3 | — |
| `incident` | herald-3 | nova-7 |
| `correlation` | weaver-4 | nova-7 |
| `discovery` | atlas-6 | — |
| `security` | sentinel-1 | — |
| `devops` | forge-5 | — |

#### Environment variables

| Variable | Default | Description |
|---|---|---|
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PASSWORD` | _(empty)_ | Redis auth password |
| `AGENT_CONFIG_PATH` | `/app/config/agents.yaml` | Agent definitions |
| `ACL_CONFIG_PATH` | `/app/config/tool-acl.yaml` | ACL matrix |
| `TOTAL_PTU` | `40` | Total PTU pool size |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OpenTelemetry collector |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS allowed origins |

---

### 5.2 Budget Controller

**Source:** `src/budget-controller/main.py`
**Port:** `8100`
**Role:** PTU (provisioned throughput unit) budget enforcer. Every agent must call `POST /budget/request` before making any LLM call. The controller checks both the agent's per-agent cap and the global pool limit.

#### How it works

```
Agent → POST /budget/request → Budget Controller
                                    │
                        ┌───────────▼───────────┐
                        │ 1. Is agent known?    │
                        │ 2. Agent under cap?   │
                        │ 3. Pool has headroom? │
                        └───────────┬───────────┘
                                    │
                         ┌──────────▼──────────┐
                         │  approved=true/false │
                         └──────────┬──────────┘
                                    │
                     ┌──────────────▼──────────────┐
                     │ Increment Redis PTU counters │
                     └─────────────────────────────┘
```

#### PTU allocation model

| Budget | Value |
|---|---|
| Total pool | 40 PTU |
| Emergency reserve | 5 PTU |
| Allocatable pool | 35 PTU |
| Hard limit enforcement | Enabled by default |

When `HARD_LIMIT_ENFORCE=true`, over-budget requests are **rejected outright**. When false, they are capped and a warning is logged (soft limit mode for development).

#### Session vs lifetime counters

- `budget:{agent}:consumed_session` — resets per operator reset or cluster restart
- `budget:{agent}:consumed_total` — cumulative, never resets

#### Key endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/budget/request` | Request PTU allocation before an LLM call |
| `POST` | `/budget/release` | Return unused PTU after task completes |
| `GET` | `/budget/report` | Full usage report across all agents |
| `POST` | `/budget/reset/{agent_name}` | Reset session budget (operator only) |

---

### 5.3 MCP Gateway

**Source:** `src/mcp-gateway/main.py`
**Port:** `9000`
**Role:** Tool access control proxy. All agent tool calls — Splunk queries, ServiceNow updates, GitHub reads, etc. — must pass through here. The gateway enforces the ACL matrix from `config/tool-acl.yaml` and implements human approval gating for flagged tools.

#### Request flow

```
Agent → POST /tools/execute
            │
     ┌──────▼──────┐
     │  ACL check  │  → 403 Forbidden if agent lacks permission
     └──────┬──────┘
            │
     ┌──────▼──────────────┐
     │  Approval gate?     │  → Returns status: "pending_approval"
     │  (email, PR, change)│    if tool requires human sign-off
     └──────┬──────────────┘
            │
     ┌──────▼──────────────┐
     │  Dispatch to backend│  → Splunk, Dynatrace, GitHub, etc.
     └──────┬──────────────┘
            │
     ┌──────▼──────────────┐
     │  Return result +    │
     │  audit log entry    │
     └─────────────────────┘
```

#### Tools requiring human approval

These tools are queued for human review instead of executing immediately:

| Tool | Reason |
|---|---|
| `email-draft-response` | All external comms require approval |
| `servicenow-change-request` | Change management gate |
| `github-create-pr` | Code changes require human review |

#### Backend URL configuration

Each integration backend is configured via environment variable:

| Variable | Default | Backend |
|---|---|---|
| `SPLUNK_URL` | `https://splunk.your-org.com:8089` | Splunk |
| `DYNATRACE_URL` | `https://dynatrace.your-org.com/api/v2` | Dynatrace |
| `SNOW_URL` | `https://your-org.service-now.com/api/now` | ServiceNow |
| `GITHUB_MCP_URL` | `https://mcp.github.com/sse` | GitHub MCP |
| `WEBEX_URL` | `https://webexapis.com/v1` | Cisco WebEx |
| `TEAMS_URL` | `https://graph.microsoft.com/v1.0` | MS Teams |
| `EXCHANGE_URL` | `https://graph.microsoft.com/v1.0` | Email (Exchange) |
| `AZURE_URL` | `https://management.azure.com` | Azure ARM |

---

### 5.4 Agent Runtime (BaseAgent)

**Source:** `src/agents/base_agent.py`
**Role:** Abstract base class that all agents inherit from. Provides the standardised lifecycle: budget check → LLM call → tool use loop → result.

#### Implementing a new agent

```python
from base_agent import BaseAgent, AgentTask, AgentResult

class MyAgent(BaseAgent):

    @property
    def system_prompt(self) -> str:
        return "You are MY-AGENT, a specialist in..."

    async def handle_task(self, task: AgentTask) -> AgentResult:
        result_text = await self._call_llm(
            messages=[{"role": "user", "content": task.payload.get("message")}],
            task_id=task.task_id,
            estimated_ptu=2,
        )
        return AgentResult(
            task_id=task.task_id,
            agent_name="MY-AGENT",
            status="completed",
            summary=result_text,
        )
```

Every call to `_call_llm()` automatically:
1. Calls Budget Controller — rejects if over budget
2. Calls the Anthropic API with the agent's tool definitions
3. Runs the tool-use loop (calls MCP Gateway for each tool invocation)
4. Returns the final text response

#### Agent environment variables

| Variable | Description |
|---|---|
| `AGENT_NAME` | Agent identifier (e.g. `nova-7`) |
| `AGENT_PERSONA` | Display persona string |
| `AGENT_PTU_BUDGET` | Per-agent PTU cap |
| `ANTHROPIC_API_KEY` | Claude API key (injected from Vault) |
| `BUDGET_CONTROLLER_URL` | URL of budget controller service |
| `MCP_GATEWAY_URL` | URL of MCP gateway service |
| `SKILL_CONFIG_PATH` | Path to agent's skill YAML |

---

## 6. Agent Roster & Capabilities

All 12 agents run as independent FastAPI microservices on port `8080` within their respective pods.

| Agent | Persona | PTU Budget | Autonomous | Key Tools |
|---|---|---|---|---|
| **SENTINEL-1** | Security Watchdog | 8 | Yes | Splunk (R/W), Dynatrace (R), ServiceNow (R/W) |
| **NOVA-7** | RCA Analyst | 8 | Yes | Splunk (R/W), Dynatrace (R/W), ServiceNow (R/W) |
| **ECHO-2** | Alert Listener | 4 | Yes | WebEx (R/W), Teams (R/W), ServiceNow (W) |
| **WEAVER-4** | Correlation Engine | 6 | Yes | Dynatrace (R/W), Splunk (R), ServiceNow (R) |
| **HERALD-3** | Comms Analyst | 6 | Yes | Email (R/W gated), ServiceNow (R/W), Teams (R) |
| **FORGE-5** | DevOps Executor | 6 | Yes | GitHub (R/W gated), ServiceNow (R/W), Terraform (R) |
| **ATLAS-6** | Infra Mapper | 4 | Yes | Azure (R/W), ServiceNow (R/W), GitHub (R) |
| **ORACLE-8** | API Analyst | 4 | Yes | Splunk (R), Dynatrace (R), Azure (R) |
| **PRISM-9** | Log Miner | 6 | Yes | Splunk (R/W), Dynatrace (R) |
| **RELAY-10** | Escalation Mgr | 2 | Yes | WebEx (W), Teams (W), ServiceNow (R/W) |
| **CIPHER-11** | Compliance | 2 | Yes | Splunk (R), GitHub (R), Terraform (R), Azure (R) |
| **NEXUS-12** | Agent Coordinator | 4 | Yes | WebEx (R/W), Teams (R/W), ServiceNow (R/W) |

**Total defined: 60 PTU | Active allocation: 40 PTU | Reserve: 5 PTU**

---

## 7. Tool Access Control (ACL)

**Source:** `config/tool-acl.yaml`
**Enforced by:** MCP Gateway — agents cannot bypass this layer.

### Permission levels

| Level | Meaning |
|---|---|
| `read` | Query/read data only — no state changes |
| `write` | Create or update records |
| `gated` | Requires human approval before execution |
| _(omitted)_ | No access — request will be denied with HTTP 403 |

### ACL matrix summary

| Backend | SENTINEL-1 | NOVA-7 | ECHO-2 | WEAVER-4 | HERALD-3 | FORGE-5 | ATLAS-6 |
|---|---|---|---|---|---|---|---|
| Splunk | R/W | R/W | R | R | — | — | R |
| Dynatrace | R | R/W | — | R/W | — | — | R |
| ServiceNow | R/W | R/W | W | R | R/W | R/W | R/W |
| GitHub | R | R | — | — | — | R/W (G) | R |
| WebEx | R/W | — | R/W | — | — | — | — |
| Teams | R/W | — | R/W | — | R | W | — |
| Email | — | — | — | — | R/W (G) | — | — |
| Azure | R | R | — | R | — | — | R/W |
| Terraform | — | — | — | — | — | R | R |
| Deploy | — | — | — | — | — | Gated | — |

_R = read, W = write, G = gated (human approval required)_

### Global deny rules (all agents)

These actions are blocked platform-wide regardless of ACL configuration:
- `delete_production_database`
- `drop_table` / `wipe_storage`
- `disable_monitoring`
- `modify_security_policy`
- `exfiltrate_data`
- `access_pii_without_audit_log`

### Changing ACL permissions

1. Edit `config/tool-acl.yaml`
2. Open a pull request — changes require security review
3. CI pipeline runs `scripts/validate-acl.py` to check integrity
4. After merge, redeploy the MCP Gateway pod to load the new ACL

---

## 8. Human Approval Gates

Certain agent actions are never executed automatically. Instead, the agent returns a result with `status: "needs_approval"` and `human_approval_required: true`, and the action is queued for a human operator to review.

### Actions that always require approval

| Agent | Action | Reason |
|---|---|---|
| HERALD-3 | Send any email | External comms — operator must review draft |
| FORGE-5 | Merge PR to main | Code review required |
| FORGE-5 | Production deploy | Human sign-off mandatory |
| FORGE-5 | `terraform apply` | CAB (Change Advisory Board) approval |
| SENTINEL-1 | Block a network IP | Network change — network team must approve |
| SENTINEL-1 | Disable user account | Identity action — CISO approval required |

### Approval workflow

```
Agent → Flags action as needs_approval
     → Logs to audit trail (OpenTelemetry)
     → Notifies operator (Teams/WebEx)
     → Waits

Operator → Reviews payload
        → Approves or rejects via platform API or UI
        → Agent proceeds or aborts accordingly
```

### Identifying approval-required responses

A response from the MCP Gateway with `approval_required: true` looks like:

```json
{
  "call_id": "uuid",
  "tool_name": "email-draft-response",
  "agent_name": "herald-3",
  "status": "pending_approval",
  "result": {
    "queued": true,
    "reason": "Human approval required"
  },
  "approval_required": true,
  "duration_ms": 12.4
}
```

---

## 9. PTU Budget System

### What is a PTU?

PTU (Provisioned Throughput Unit) is the unit used by the Budget Controller to represent LLM resource consumption. Each agent estimates its PTU cost per task and requests an allocation before making any LLM call.

### Budget hierarchy

```
Global pool: 40 PTU total
└── Emergency reserve: 5 PTU (never allocated)
    └── Allocatable pool: 35 PTU
        ├── SENTINEL-1:  8 PTU cap
        ├── NOVA-7:      8 PTU cap
        ├── WEAVER-4:    6 PTU cap
        ├── HERALD-3:    6 PTU cap
        ├── FORGE-5:     6 PTU cap
        ├── PRISM-9:     6 PTU cap
        ├── ECHO-2:      4 PTU cap
        ├── ATLAS-6:     4 PTU cap
        ├── ORACLE-8:    4 PTU cap
        ├── NEXUS-12:    4 PTU cap
        ├── RELAY-10:    2 PTU cap
        └── CIPHER-11:   2 PTU cap
```

### Checking current usage

```bash
# Full report
curl http://localhost:8100/budget/report | python -m json.tool

# Prometheus metric
curl http://localhost:8100/metrics | grep praetor_ptu
```

### Resetting a budget (operator action)

```bash
# Reset session budget for a specific agent
curl -X POST http://localhost:8100/budget/reset/nova-7
```

### What happens when budget is exhausted

- The agent logs a warning and the task is marked `failed` with reason `"PTU budget exhausted"`
- The task status is set in Redis and surfaced via `GET /tasks/{task_id}`
- If the exhausted agent is the primary for a task type, the orchestrator falls back to the secondary agent
- Prometheus fires the `praetor_ptu_pool_remaining` gauge alert at configured thresholds

---

## 10. API Reference

All services expose interactive documentation at `/docs` (Swagger UI) and `/redoc`.

### Orchestrator API (`localhost:8000`)

#### Submit a task

```http
POST /tasks
Content-Type: application/json

{
  "task_type": "rca",
  "source": "splunk",
  "priority": "p1",
  "payload": {
    "service": "payments-api",
    "error_rate": "42%",
    "window_start": "2025-01-15T14:00:00Z"
  },
  "incident_id": "INC0012345",
  "requester": "operator@your-org.com"
}
```

**Priority levels:**

| Priority | SLA | Estimated completion |
|---|---|---|
| `p1` | Critical — immediate | 30 seconds |
| `p2` | High | 60 seconds |
| `p3` | Medium (default) | 3 minutes |
| `p4` | Low | 10 minutes |

**Task types:** `rca` · `alert` · `email` · `incident` · `correlation` · `discovery` · `security` · `devops`

**Source systems:** `splunk` · `dynatrace` · `webex` · `teams` · `servicenow` · `email` · `github`

#### Check task status

```http
GET /tasks/{task_id}
```

```json
{
  "task_id": "f47ac10b-...",
  "status": "completed",
  "agent": "nova-7"
}
```

**Status values:** `dispatched` → `working` → `completed` | `failed`

#### List all agents

```http
GET /agents
```

#### Pause / resume an agent (operator action)

```http
POST /agents/nova-7/pause
POST /agents/nova-7/resume
```

#### Health endpoints

```http
GET /health/live    → liveness probe
GET /health/ready   → readiness probe (checks Redis)
GET /metrics        → Prometheus metrics
```

---

### Budget Controller API (`localhost:8100`)

```http
POST /budget/request       # Request PTU before LLM call
POST /budget/release       # Return unused PTU
GET  /budget/report        # Full usage breakdown
POST /budget/reset/{agent} # Reset session budget
GET  /health/live
GET  /health/ready
GET  /metrics
```

---

### MCP Gateway API (`localhost:9000`)

```http
POST /tools/execute        # Execute a tool call (ACL-enforced)
GET  /acl/{agent_name}     # View ACL for a specific agent
GET  /health/live
GET  /health/ready
GET  /metrics
```

#### Execute a tool

```http
POST /tools/execute
Content-Type: application/json

{
  "agent_name": "nova-7",
  "tool_name": "splunk-rca-search",
  "input": {
    "query": "index=prod_* service=payments-api earliest=-30m",
    "parameters": { "max_events": 1000 }
  },
  "task_id": "f47ac10b-..."
}
```

---

## 11. Configuration Reference

### `config/agents.yaml`

Defines the persona, skills, tool permissions, and PTU budget for each agent. This is the **source of truth** for agent capability and personality.

**Key fields per agent:**

```yaml
agents:
  nova-7:
    name: NOVA-7
    persona:
      role: RCA Analyst
      personality: >          # System prompt content — sets LLM behaviour
        You are NOVA-7...
      tone: analytical, evidence-driven
    skills:                   # Tools exposed to the agent's LLM
      - id: splunk-rca-search
        description: ...
        tool: splunk
        permissions: [read, write]
    tools_allowed:            # Backend-level access (enforced by MCP Gateway)
      splunk: [read, write]
      dynatrace: [read, write]
    ptu_budget: 8             # Per-agent PTU cap
    autonomous: true          # If false, every action requires human approval
    human_approval_required:  # Action-level approval gates
      - action: "deploy"
        reason: "..."
```

To add or modify an agent's capabilities:
1. Edit `config/agents.yaml`
2. If adding tool access, also update `config/tool-acl.yaml`
3. Open a PR — changes are validated by CI (`scripts/validate-acl.py`)
4. Redeploy the affected agent pod and MCP Gateway

---

### `config/tool-acl.yaml`

The authoritative ACL matrix. Loaded by the MCP Gateway at startup. Changes require a security review PR.

```yaml
version: "1.0"
effective_date: "2025-01-01"
owner: "platform-security@your-org.com"

agents:
  nova-7:
    tools_allowed:
      splunk: [read, write]
    blocked_actions:          # Explicitly forbidden regardless of permissions
      - purge_logs

global_deny:                  # Applies to ALL agents
  - delete_production_database
```

---

## 12. Kubernetes / OpenShift Deployment

### Default deployment (Helm)

```bash
# First time
helm upgrade --install praetor ./helm/praetor \
  -f helm/praetor/values.yaml \
  --namespace praetor \
  --create-namespace \
  --wait

# Production (with overrides)
helm upgrade --install praetor ./helm/praetor \
  -f helm/praetor/values.yaml \
  -f helm/praetor/values-prod.yaml \
  --namespace praetor \
  --create-namespace \
  --atomic \
  --timeout 15m \
  --wait
```

### Key Helm values

| Key | Default | Description |
|---|---|---|
| `global.imageRegistry` | `registry.your-org.com/praetor` | Container registry |
| `global.imageTag` | `1.0.0` | Image tag for all services |
| `orchestrator.replicaCount` | `2` (`3` in prod) | Orchestrator replicas |
| `budgetController.totalPTU` | `40` | Total PTU pool |
| `budgetController.hardLimitEnforce` | `true` | Reject over-budget calls |
| `security.networkPolicies` | `true` | Enable zero-trust network policies |
| `monitoring.opentelemetry.collectorEndpoint` | OTEL collector URL | Trace export target |

### Pod security

All pods run with:
- `runAsNonRoot: true`, UID `1001`
- `readOnlyRootFilesystem: true` (writable `/tmp/praetor` only)
- `allowPrivilegeEscalation: false`
- All Linux capabilities dropped
- `seccompProfile: RuntimeDefault`

### Verify deployment

```bash
kubectl get pods -n praetor
kubectl get svc -n praetor
kubectl logs -n praetor deployment/praetor-orchestrator -f
```

### Scaling agents

```bash
# Scale echo-2 for higher alert volume
kubectl scale deployment praetor-agent-echo-2 -n praetor --replicas=4
```

---

## 13. CI/CD Pipeline

**Source:** `.github/workflows/ci-cd.yaml`

The pipeline runs on every push and PR, with production deployment gated behind a GitHub environment approval.

### Pipeline stages

```
push/PR
  │
  ▼
lint         Python ruff, mypy, yamllint, bandit, safety scan,
             Helm chart validation, ACL integrity check
  │
  ▼
test         pytest with Redis + Postgres services,
             coverage ≥ 75% required
  │ (main branch or release only)
  ▼
build        Docker multi-arch build + push per service,
             Trivy CVE scan — fails on CRITICAL/HIGH
  │
  ▼
deploy-staging   Helm deploy to praetor-staging namespace,
                 smoke tests via scripts/smoke-test.sh
  │ (release event only, requires manual approval)
  ▼
deploy-prod      Helm deploy to praetor namespace,
                 post-deploy health check,
                 Teams notification on success/failure
```

### Required GitHub secrets

| Secret | Used by |
|---|---|
| `REGISTRY_USER` / `REGISTRY_PASSWORD` | Container registry auth |
| `OCP_STAGING_TOKEN` | OpenShift staging deploy |
| `OCP_PROD_TOKEN` | OpenShift production deploy |
| `TEAMS_WEBHOOK` | Deployment notifications |

### Triggering a production release

1. Merge to `main` (triggers staging deploy automatically)
2. Confirm staging smoke tests pass
3. Create a GitHub Release with a semver tag (e.g. `v1.0.1`)
4. Approve the `production` environment gate in GitHub Actions
5. Pipeline deploys and posts to Teams

---

## 14. Observability & Monitoring

### Metrics — Prometheus

Each service exposes `/metrics` in Prometheus format. Key metrics:

| Metric | Type | Description |
|---|---|---|
| `praetor_tasks_dispatched_total` | Counter | Tasks submitted, by agent and type |
| `praetor_tasks_completed_total` | Counter | Tasks finished, by agent and status |
| `praetor_task_duration_seconds` | Histogram | Task duration by agent and type |
| `praetor_active_agents` | Gauge | Currently registered agents |
| `praetor_ptu_consumed` | Gauge | PTU usage by agent |
| `praetor_ptu_pool_remaining` | Gauge | Remaining allocatable PTU |
| `praetor_ptu_requests_total` | Counter | Budget requests, by agent and result |
| `praetor_tool_calls_total` | Counter | Tool calls by agent, tool, and result |
| `praetor_tool_call_duration_seconds` | Histogram | Tool call duration by tool |

### Traces — OpenTelemetry

All services emit OTLP traces to the configured collector. Key spans:

| Span | Service | Attributes |
|---|---|---|
| `orchestrator.create_task` | Orchestrator | task.id, task.type, task.priority |
| `{agent}.llm_call` | Agent | agent.name, agent.task_id, llm.model |
| `{agent}.tool_call` | Agent | tool.name, agent.name |
| `mcp_gateway.execute` | MCP Gateway | agent.name, tool.name, task.id |

### Log format

All services emit structured JSON logs:

```json
{
  "time": "2025-01-15T14:23:01",
  "level": "INFO",
  "service": "orchestrator",
  "msg": "Task f47ac10b (rca/p1) → nova-7"
}
```

### Useful log queries (Splunk)

```spl
# All failed tasks
index=praetor level=ERROR msg="Task*failed*"

# PTU rejections
index=praetor msg="PTU budget exceeded*"

# Tool ACL denials
index=praetor msg="ACL DENY*"

# Agent errors in last 1h
index=praetor level=ERROR earliest=-1h | stats count by agent_name
```

---

## 15. Security Model

### Credential management

- All secrets (API keys, passwords, tokens) are stored in **HashiCorp Vault** at `secret/praetor/`
- Secrets are injected into pods via the **Vault Agent Sidecar** — never stored in ConfigMaps or environment variables in manifests
- Secret rotation is handled by `scripts/rotate-secrets.sh`

### Authentication

- Human operator access via **Red Hat SSO (Keycloak)**, realm `praetor`
- Agent-to-service auth via **Kubernetes ServiceAccounts** with minimal RBAC
- Kong/HAProxy gateway enforces JWT validation on all inbound API calls

### Network isolation

- **Zero-trust network policies** between pods — agents cannot call each other directly
- All inter-service calls route through the Orchestrator or MCP Gateway
- Egress to external integrations is restricted to known IP ranges

### Audit trail

Every agent action is logged with:
- Agent identity
- Task ID and type
- Tool called (if any)
- Timestamp and duration
- Approval status

Audit logs flow via OpenTelemetry to Splunk and are immutable once written. Agents cannot modify or delete audit records (enforced by `global_deny` ACL rules).

### FIPS 140-2 compliance

For air-gapped environments, enable FIPS mode in your OpenShift cluster configuration. The UBI 9 base image is FIPS-capable when the host kernel is in FIPS mode.

---

## 16. Adding a New Agent

Follow these steps to add a new agent to the platform.

### Step 1 — Define the agent in `config/agents.yaml`

```yaml
agents:
  my-agent-13:
    name: MY-AGENT-13
    persona:
      role: Your Role Name
      personality: >
        You are MY-AGENT-13, a specialist in...
      tone: precise, technical
    skills:
      - id: splunk-rca-search        # Use an existing tool ID
        description: What this skill does
        tool: splunk
        permissions: [read]
    tools_allowed:
      splunk: [read]                 # Must match tool-acl.yaml
    ptu_budget: 4                    # Set an appropriate PTU cap
    autonomous: true
    human_approval_required: []
```

### Step 2 — Add ACL entry in `config/tool-acl.yaml`

```yaml
agents:
  my-agent-13:
    description: "Your Agent — what it does"
    tools_allowed:
      splunk: [read]
    blocked_actions: []
```

### Step 3 — Implement the agent class

Create `src/agents/my_agent_13.py`:

```python
from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic import BaseModel
from base_agent import BaseAgent, AgentTask, AgentResult

class MyAgent13(BaseAgent):

    @property
    def system_prompt(self) -> str:
        return "You are MY-AGENT-13..."

    async def handle_task(self, task: AgentTask) -> AgentResult:
        result = await self._call_llm(
            messages=[{"role": "user", "content": str(task.payload)}],
            task_id=task.task_id,
            estimated_ptu=1,
        )
        return AgentResult(
            task_id=task.task_id,
            agent_name="MY-AGENT-13",
            status="completed",
            summary=result,
        )

# FastAPI wrapper
agent_instance: MyAgent13 | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent_instance
    agent_instance = MyAgent13()
    yield
    if agent_instance:
        await agent_instance.close()

app = FastAPI(title="MY-AGENT-13", lifespan=lifespan)

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

@app.post("/tasks")
async def receive_task(task_in: TaskIn):
    task = AgentTask(**task_in.model_dump())
    result = await agent_instance.handle_task(task)
    return result.model_dump()
```

### Step 4 — Register the agent in the Orchestrator

In `src/orchestrator/main.py`, add to `AGENT_BASE_URLS` and `TASK_ROUTING`:

```python
AGENT_BASE_URLS["my-agent-13"] = "http://praetor-agent-my-agent-13.praetor.svc.cluster.local:8080"
TASK_ROUTING["my-task-type"] = ["my-agent-13"]
```

### Step 5 — Add to the Budget Controller

In `src/budget-controller/main.py`, add to `AGENT_BUDGETS`:

```python
AGENT_BUDGETS["my-agent-13"] = 4
```

### Step 6 — Add to Helm values

In `helm/praetor/values.yaml`, add under `agentRuntime.agents`:

```yaml
myAgent:
  name: my-agent-13
  persona: "Your Role Name"
  replicaCount: 1
  ptuBudget: 4
  resources:
    requests: { cpu: "250m", memory: "256Mi" }
    limits: { cpu: "1000m", memory: "1Gi" }
```

### Step 7 — Open a PR

The CI pipeline will validate your ACL changes. After review and merge, the agent deploys automatically to staging.

---

## 17. Troubleshooting

### Service won't start

```bash
# Check logs
cat /tmp/praetor-logs/budget-controller.log
cat /tmp/praetor-logs/orchestrator.log

# Confirm Redis is reachable
redis-cli -h localhost ping

# Check all PIDs are alive
ls /tmp/praetor-pids/
```

### "PTU budget exhausted" errors

```bash
# Check which agent is over budget
curl http://localhost:8100/budget/report | python -m json.tool

# Reset the session budget
curl -X POST http://localhost:8100/budget/reset/nova-7
```

### "ACL DENY" in logs

The agent is attempting to call a tool it is not authorised for. Check:
1. `config/tool-acl.yaml` — does the agent have the required permission?
2. `INTEGRATION_BACKENDS` in `mcp-gateway/main.py` — is the tool registered?
3. Restart the MCP Gateway after any ACL changes

### Agent stuck in "working" state

The agent pod may have crashed mid-task. The Redis key `agent:{name}:state` may be stale.

```bash
# Force-reset agent state in Redis
redis-cli set agent:nova-7:state idle
```

### Task never completes

```bash
# Check task status
curl http://localhost:8000/tasks/{task_id}

# Check the assigned agent's log
cat /tmp/praetor-logs/nova-7.log | grep {task_id}
```

### "ModuleNotFoundError" on startup (Python 3.8/3.9)

Install the backport packages:

```bash
pip install eval_type_backport
```

And ensure all source files have `from __future__ import annotations` at the top.

### Common health check endpoints

```bash
curl http://localhost:8000/health/ready   # Orchestrator (checks Redis)
curl http://localhost:8100/health/ready   # Budget Controller
curl http://localhost:9000/health/ready   # MCP Gateway
curl http://localhost:8080/health/ready   # NOVA-7 agent
```

---

*PRAETOR Enterprise v1.0.0 — Internal Use Only*
*For support, contact your platform team or open an issue in the internal GitHub repository.*
