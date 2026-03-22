# PRAETOR Enterprise

> Autonomous 24/7 ITOps agent platform powered by Claude AI.
> Deploy a coordinated army of 12 AI agents that monitor, triage, investigate, and respond to IT events — on-premises, on Red Hat OpenShift or Kubernetes.

---

## What is PRAETOR?

PRAETOR replaces reactive, ticket-driven ITOps with a fleet of always-on AI agents. Each agent has a defined persona, a scoped set of tool permissions, and a PTU (compute) budget. They collaborate through a central orchestrator — and every action that touches production requires human approval.

```
Incoming alert / task
        │
        ▼
┌───────────────────┐      ┌──────────────────────┐
│    Orchestrator   │─────▶│   Budget Controller  │
│   routes task to  │      │   enforces PTU caps  │
│   best agent      │      └──────────────────────┘
└────────┬──────────┘
         │
         ▼
┌────────────────┐     ┌──────────────────────────────────────┐
│  MCP Gateway   │     │  Agent Fleet (12 agents)             │
│  ACL-enforces  │◀────│  SENTINEL · NOVA · ECHO · WEAVER     │
│  all tool calls│     │  HERALD · FORGE · ATLAS · ORACLE     │
└────────┬───────┘     │  PRISM · RELAY · CIPHER · NEXUS      │
         │             └──────────────────────────────────────┘
         ▼
Splunk · Dynatrace · ServiceNow · GitHub
WebEx · MS Teams · Azure · Email
```

---

## Agent Roster

| Agent | Role | PTU Budget | Key Capabilities |
|-------|------|-----------|-----------------|
| **SENTINEL-1** | Security Watchdog | 8 | Threat monitoring, IOC lookup, SIEM queries |
| **NOVA-7** | RCA Analyst | 8 | Root cause analysis, distributed trace correlation |
| **ECHO-2** | Alert Listener | 4 | 24/7 alert ingestion from WebEx & MS Teams |
| **WEAVER-4** | Correlation Engine | 6 | Cross-signal pattern analysis, topology graphs |
| **HERALD-3** | Comms Analyst | 6 | Email triage, ServiceNow incident management |
| **FORGE-5** | DevOps Executor | 6 | GitHub PRs, CI/CD log analysis, change requests |
| **ATLAS-6** | Infra Mapper | 4 | API discovery, CMDB sync |
| **ORACLE-8** | API Analyst | 4 | REST/GraphQL endpoint analysis |
| **PRISM-9** | Log Miner | 6 | Deep Splunk & ELK analysis |
| **RELAY-10** | Escalation Mgr | 2 | PagerDuty paging, on-call routing |
| **CIPHER-11** | Compliance | 2 | RBAC audit, compliance validation |
| **NEXUS-12** | Agent Coordinator | 4 | Multi-agent workflow orchestration |

**Total: 40 PTU active allocation across 12 agents**

---

## Key Features

- **Zero-trust ACL** — every tool call passes through the MCP Gateway; agents cannot exceed their declared permissions
- **Human approval gates** — production deploys, email sends, IP blocks, and account changes always require a human sign-off
- **PTU budget enforcement** — the Budget Controller rejects over-budget LLM calls before they are made; no runaway spend
- **Full audit trail** — all agent actions emitted via OpenTelemetry to Splunk
- **OpenShift-native** — UBI 9 base images, non-root pods, FIPS-ready, Helm chart included
- **Air-gappable** — no external dependencies at runtime beyond your own Vault and SSO

---

## Quick Start — Local Development

### Prerequisites

- Python 3.10+
- Redis 7.x (`winget install Redis.Redis` on Windows; `brew install redis` on macOS)
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Clone & install

```bash
git clone https://github.com/JohnNeels/JN_Praetor.git
cd JN_Praetor
pip install -r praetor/requirements.txt
```

### 2. Set your API key

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 3. Start all services

```bash
./praetor/scripts/start-local.sh --no-redis   # if Redis is already running
./praetor/scripts/start-local.sh              # starts Redis automatically
```

### 4. Verify

| Service | URL |
|---------|-----|
| Orchestrator API | http://localhost:8000/docs |
| Budget Controller | http://localhost:8100/docs |
| MCP Gateway | http://localhost:9000/docs |
| NOVA-7 Agent | http://localhost:8080/docs |

### 5. Submit a task

```bash
curl -X POST http://localhost:8000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "task_type": "rca",
    "source": "splunk",
    "priority": "p2",
    "payload": {"service": "payments-api", "error_rate": "35%"},
    "incident_id": "INC0001234"
  }'
```

### Stop everything

```bash
./praetor/scripts/start-local.sh --stop
```

---

## Project Structure

```
praetor/
├── .github/workflows/        # CI/CD pipeline (lint → test → build → staging → prod)
├── helm/praetor/             # Helm chart for OpenShift / Kubernetes deployment
│   ├── values.yaml           # Default values
│   ├── values-prod.yaml      # Production overrides
│   └── templates/            # Deployment, Service, Route, HPA, RBAC, NetworkPolicy
├── k8s/base/                 # Kustomize base manifests
├── config/
│   ├── agents.yaml           # Agent personas, skills, and PTU budgets
│   └── tool-acl.yaml         # Tool access control matrix (security-reviewed)
├── src/
│   ├── orchestrator/         # Central task router (FastAPI :8000)
│   ├── budget-controller/    # PTU budget enforcer (FastAPI :8100)
│   ├── mcp-gateway/          # Tool ACL proxy (FastAPI :9000)
│   └── agents/               # Agent implementations (BaseAgent + NOVA-7)
├── scripts/
│   └── start-local.sh        # One-command local startup
├── requirements.txt
├── README.md                 # This file
└── USER_GUIDE.md             # Full onboarding & technical documentation
```

---

## Documentation

Full onboarding guide, API reference, ACL matrix, PTU system, deployment instructions, and "adding a new agent" walkthrough are in [USER_GUIDE.md](praetor/USER_GUIDE.md).

---

## Production Deployment (OpenShift / Kubernetes)

```bash
helm upgrade --install praetor ./praetor/helm/praetor \
  -f praetor/helm/praetor/values.yaml \
  -f praetor/helm/praetor/values-prod.yaml \
  --namespace praetor \
  --create-namespace \
  --atomic --timeout 15m --wait
```

Secrets (API keys, Redis password, integration tokens) are injected at runtime via HashiCorp Vault — never stored in ConfigMaps or image layers.

---

## Security

- Credentials stored in **HashiCorp Vault** — never in config files or environment manifests
- **Red Hat SSO (Keycloak)** for human operator authentication
- **Zero-trust network policies** between pods
- **FIPS 140-2** capable (UBI 9 + FIPS-mode OpenShift)
- All agent actions logged immutably to Splunk via OpenTelemetry

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI / LLM | Anthropic Claude (`claude-sonnet-4`) |
| Agent framework | Python 3.11, AsyncAnthropic SDK |
| API services | FastAPI, Uvicorn |
| State & coordination | Redis (async) |
| Container platform | Red Hat OpenShift 4.14+ / Kubernetes 1.28+ |
| Packaging | Helm 3, Kustomize 5 |
| Base image | Red Hat UBI 9 (Python 3.11) |
| Observability | OpenTelemetry, Prometheus, Grafana, Splunk |
| Secrets | HashiCorp Vault 1.15+ |
| Identity | Red Hat SSO / Keycloak 22+ |

---

## License

Enterprise License — Internal Use Only
