# 🦾 PRAETOR Enterprise — ITOps Agentic Platform

> Autonomous 24/7 ITOps agent army deployed on Red Hat OpenShift / Kubernetes.  
> On-premises. Air-gappable. Enterprise-hardened.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRAETOR Enterprise Platform                  │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │  API Gateway  │    │ Orchestrator │    │  Budget Controller│  │
│  │  (Kong/NGINX) │───▶│  (FastAPI)   │───▶│  (40 PTU Limiter)│  │
│  └──────────────┘    └──────┬───────┘    └──────────────────┘  │
│                             │                                    │
│           ┌─────────────────┼─────────────────┐                 │
│           ▼                 ▼                  ▼                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐      │
│  │  MCP Gateway │  │ Agent Runtime│  │  Security Vault  │      │
│  │  (GitHub,    │  │ (12 Agents)  │  │  (HashiCorp      │      │
│  │  ServiceNow, │  │              │  │   Vault / RHSSO) │      │
│  │  Splunk...)  │  └──────────────┘  └──────────────────┘      │
│  └──────────────┘                                                │
│           │                                                      │
│  ┌────────▼──────────────────────────────────────────────────┐  │
│  │               Integration Layer                            │  │
│  │  WebEx │ MS Teams │ Splunk │ Dynatrace │ ServiceNow │ Git  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Repository Structure

```
praetor/
├── .github/workflows/        # CI/CD pipelines (GitHub Actions)
├── helm/praetor/            # Helm chart for full platform deployment
│   ├── Chart.yaml
│   ├── values.yaml           # Default values
│   ├── values-prod.yaml      # Production overrides
│   └── templates/            # K8s manifest templates
├── k8s/
│   ├── base/                 # Kustomize base manifests
│   └── overlays/             # Environment overlays (dev/staging/prod)
├── src/
│   ├── orchestrator/         # Central agent orchestrator (FastAPI)
│   ├── agents/               # Individual agent definitions
│   ├── mcp-gateway/          # MCP server gateway
│   ├── budget-controller/    # LLM PTU budget enforcement
│   └── api-gateway/          # External API gateway config
├── config/
│   ├── agents.yaml           # Agent skill + persona definitions
│   ├── tool-acl.yaml         # Tool access control matrix
│   └── integrations.yaml     # Integration endpoints
├── monitoring/
│   ├── prometheus/           # Scrape configs + alert rules
│   └── grafana/              # Dashboard JSON exports
├── scripts/
│   ├── bootstrap.sh          # First-time cluster setup
│   └── rotate-secrets.sh     # Secret rotation helper
└── docs/
    ├── architecture.md
    ├── agent-guide.md
    └── security.md
```

## Prerequisites

| Component | Minimum Version |
|-----------|----------------|
| Red Hat OpenShift | 4.14+ |
| Kubernetes | 1.28+ |
| Helm | 3.12+ |
| Kustomize | 5.x |
| Python | 3.11+ |
| Podman / Docker | 4.x |
| HashiCorp Vault | 1.15+ |
| Red Hat SSO (Keycloak) | 22+ |

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/praetor.git
cd praetor

# 2. Bootstrap cluster prerequisites
./scripts/bootstrap.sh --env prod --cluster ocp-prod-01

# 3. Configure secrets in Vault
./scripts/rotate-secrets.sh --init

# 4. Deploy with Helm
helm upgrade --install praetor ./helm/praetor \
  -f helm/praetor/values-prod.yaml \
  --namespace praetor \
  --create-namespace \
  --wait

# 5. Verify deployment
kubectl get pods -n praetor
```

## Agent Roster

| Agent | Persona | Primary Skills | PTU Budget |
|-------|---------|---------------|------------|
| SENTINEL-1 | Security Watchdog | Splunk SIEM, Threat Intel | 8 PTU |
| NOVA-7 | RCA Analyst | Splunk APM, Dynatrace | 8 PTU |
| ECHO-2 | Alert Listener | WebEx, MS Teams | 4 PTU |
| WEAVER-4 | Correlation Engine | Dynatrace, Topology | 6 PTU |
| HERALD-3 | Comms Analyst | Email, ServiceNow | 6 PTU |
| FORGE-5 | DevOps Executor | GitHub MCP, CI/CD | 6 PTU |
| ATLAS-6 | Infra Mapper | API Discovery, CMDB | 4 PTU |
| ORACLE-8 | API Analyst | REST APIs, GraphQL | 4 PTU |
| PRISM-9 | Log Miner | Splunk, ELK | 6 PTU |
| RELAY-10 | Escalation | PagerDuty, On-Call | 2 PTU |
| CIPHER-11 | Compliance | RBAC, Audit | 2 PTU |
| NEXUS-12 | Orchestrator | Agent Coordination | 4 PTU |

**Total: 60 PTU defined / 40 PTU active allocation**

## Security Model

- All agent credentials stored in **HashiCorp Vault** — never in ConfigMaps or env vars
- **Red Hat SSO (Keycloak)** for human operator authentication
- Per-agent **Tool ACL matrix** enforced at MCP Gateway layer
- **Human approval gates** required for: deploys, production writes, email sends
- Full **audit log** to Splunk via OpenTelemetry
- Network policies enforce **zero-trust pod-to-pod** communication
- Supports **FIPS 140-2** mode for air-gapped environments

## License

Enterprise License — Internal Use Only
