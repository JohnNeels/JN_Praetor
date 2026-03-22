#!/usr/bin/env bash
# ============================================================
# PRAETOR Enterprise — Local Development Startup Script
# Starts all platform services for local dev/testing.
#
# Services started (in dependency order):
#   1. Redis          — shared state & agent coordination
#   2. Budget Controller  — PTU enforcement (port 8100)
#   3. MCP Gateway    — tool ACL proxy (port 9000)
#   4. Orchestrator   — central coordinator (port 8000)
#   5. NOVA-7 Agent   — RCA Analyst agent (port 8080)
#
# Usage:
#   ./scripts/start-local.sh              # start all
#   ./scripts/start-local.sh --no-redis   # skip Redis (use existing)
#   ./scripts/start-local.sh --stop       # stop all background services
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$PROJECT_ROOT/src"
CONFIG="$PROJECT_ROOT/config"
PID_DIR="/tmp/praetor-pids"
LOG_DIR="/tmp/praetor-logs"

# ─── Colours ───
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[PRAETOR]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}$*${NC}"; }

# ─── CLI args ───
SKIP_REDIS=false
STOP_MODE=false
for arg in "$@"; do
  case "$arg" in
    --no-redis) SKIP_REDIS=true ;;
    --stop)     STOP_MODE=true ;;
  esac
done

# ─── Stop Mode ───
stop_all() {
  header "Stopping PRAETOR services..."
  if [[ -d "$PID_DIR" ]]; then
    for pidfile in "$PID_DIR"/*.pid; do
      [[ -f "$pidfile" ]] || continue
      svc=$(basename "$pidfile" .pid)
      pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null && success "Stopped $svc (PID $pid)"
      else
        warn "$svc was not running"
      fi
      rm -f "$pidfile"
    done
  fi
  # Stop Redis container if we started it
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^praetor-redis$'; then
    docker stop praetor-redis 2>/dev/null && success "Stopped Redis container"
  fi
  success "All services stopped."
  exit 0
}

[[ "$STOP_MODE" == true ]] && stop_all

# ─── Preflight checks ───
header "PRAETOR Enterprise — Local Startup"

check_cmd() {
  command -v "$1" &>/dev/null || { error "Required command not found: $1"; exit 1; }
}
check_cmd python3
check_cmd uvicorn

info "Python: $(python3 --version)"
info "Project root: $PROJECT_ROOT"

# ─── Verify required config files ───
for f in "$CONFIG/agents.yaml" "$CONFIG/tool-acl.yaml"; do
  [[ -f "$f" ]] || { error "Missing config: $f"; exit 1; }
done

# ─── Environment — set sensible local defaults ───
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PASSWORD="${REDIS_PASSWORD:-}"
export AGENT_CONFIG_PATH="${AGENT_CONFIG_PATH:-$CONFIG/agents.yaml}"
export ACL_CONFIG_PATH="${ACL_CONFIG_PATH:-$CONFIG/tool-acl.yaml}"
export BUDGET_CONTROLLER_URL="${BUDGET_CONTROLLER_URL:-http://localhost:8100}"
export MCP_GATEWAY_URL="${MCP_GATEWAY_URL:-http://localhost:9000}"
export ORCHESTRATOR_URL="${ORCHESTRATOR_URL:-http://localhost:8000}"
export OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-http://localhost:4317}"
export TOTAL_PTU="${TOTAL_PTU:-40}"
export RESERVE_PTU="${RESERVE_PTU:-5}"
export HARD_LIMIT_ENFORCE="${HARD_LIMIT_ENFORCE:-true}"
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:3000}"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"

if [[ -z "$ANTHROPIC_API_KEY" ]]; then
  warn "ANTHROPIC_API_KEY is not set — agent LLM calls will fail."
  warn "Export it before starting: export ANTHROPIC_API_KEY=sk-ant-..."
fi

mkdir -p "$PID_DIR" "$LOG_DIR"

# ─── Helper: start a uvicorn service in background ───
start_service() {
  local name="$1"
  local module="$2"
  local port="$3"
  local workdir="$4"

  local logfile="$LOG_DIR/${name}.log"
  local pidfile="$PID_DIR/${name}.pid"

  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    warn "$name already running (PID $(cat "$pidfile"))"
    return 0
  fi

  info "Starting $name on port $port..."
  pushd "$workdir" > /dev/null
  uvicorn "$module:app" \
    --host 0.0.0.0 \
    --port "$port" \
    --log-level info \
    > "$logfile" 2>&1 &
  local pid=$!
  popd > /dev/null

  echo "$pid" > "$pidfile"
  success "$name started (PID $pid) — logs: $logfile"
}

# ─── Helper: wait for HTTP health endpoint ───
wait_healthy() {
  local name="$1"
  local url="$2"
  local retries="${3:-20}"
  local delay=1

  info "Waiting for $name to be ready..."
  for i in $(seq 1 "$retries"); do
    if curl -sf "$url" -o /dev/null 2>/dev/null; then
      success "$name is ready."
      return 0
    fi
    sleep "$delay"
  done
  error "$name did not become ready after $((retries * delay))s. Check logs: $LOG_DIR"
  return 1
}

# ─── 1. Redis ───
header "1/5  Redis"
if [[ "$SKIP_REDIS" == true ]]; then
  info "Skipping Redis start (--no-redis). Assuming Redis is already running on $REDIS_HOST:6379."
else
  if command -v docker &>/dev/null; then
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^praetor-redis$'; then
      warn "Redis container 'praetor-redis' already running."
    else
      docker run -d \
        --name praetor-redis \
        --restart unless-stopped \
        -p 6379:6379 \
        redis:7-alpine \
        redis-server ${REDIS_PASSWORD:+--requirepass "$REDIS_PASSWORD"} \
        > /dev/null
      success "Redis container started."
    fi
  elif command -v redis-server &>/dev/null; then
    if ! redis-cli ping &>/dev/null; then
      redis-server --daemonize yes --logfile "$LOG_DIR/redis.log"
      success "Redis (native) started."
    else
      warn "Redis already responding on localhost:6379."
    fi
  else
    warn "Docker and redis-server not found. Assuming Redis is already running."
  fi

  # Wait for Redis to accept connections
  for i in $(seq 1 15); do
    redis-cli -h "$REDIS_HOST" ${REDIS_PASSWORD:+-a "$REDIS_PASSWORD"} ping &>/dev/null && break
    sleep 1
  done
  redis-cli -h "$REDIS_HOST" ${REDIS_PASSWORD:+-a "$REDIS_PASSWORD"} ping &>/dev/null \
    && success "Redis is accepting connections." \
    || warn "Could not confirm Redis connectivity — continuing anyway."
fi

# ─── 2. Budget Controller (port 8100) ───
header "2/5  Budget Controller"
start_service "budget-controller" "main" 8100 "$SRC/budget-controller"
wait_healthy "Budget Controller" "http://localhost:8100/health/live"

# ─── 3. MCP Gateway (port 9000) ───
header "3/5  MCP Gateway"
start_service "mcp-gateway" "main" 9000 "$SRC/mcp-gateway"
wait_healthy "MCP Gateway" "http://localhost:9000/health/live"

# ─── 4. Orchestrator (port 8000) ───
header "4/5  Orchestrator"
start_service "orchestrator" "main" 8000 "$SRC/orchestrator"
wait_healthy "Orchestrator" "http://localhost:8000/health/live"

# ─── 5. NOVA-7 Agent (port 8080) ───
header "5/5  NOVA-7 Agent"
# nova7.py imports base_agent, so run from the agents directory
export AGENT_NAME="nova-7"
export AGENT_PERSONA="RCA Analyst"
export AGENT_PTU_BUDGET="8"
export SKILL_CONFIG_PATH="$CONFIG/agents.yaml"
start_service "nova-7" "nova7" 8080 "$SRC/agents"
wait_healthy "NOVA-7" "http://localhost:8080/health/live"

# ─── Summary ───
header "PRAETOR Platform — Ready"
echo ""
echo -e "  ${GREEN}Orchestrator   ${NC}→  http://localhost:8000  (docs: http://localhost:8000/docs)"
echo -e "  ${GREEN}Budget Ctrl    ${NC}→  http://localhost:8100  (docs: http://localhost:8100/docs)"
echo -e "  ${GREEN}MCP Gateway    ${NC}→  http://localhost:9000  (docs: http://localhost:9000/docs)"
echo -e "  ${GREEN}NOVA-7 Agent   ${NC}→  http://localhost:8080  (docs: http://localhost:8080/docs)"
echo -e "  ${GREEN}Redis          ${NC}→  ${REDIS_HOST}:6379"
echo ""
echo -e "  Logs  →  ${LOG_DIR}/"
echo -e "  PIDs  →  ${PID_DIR}/"
echo ""
echo -e "  Stop all:  ${BOLD}./scripts/start-local.sh --stop${NC}"
echo ""
