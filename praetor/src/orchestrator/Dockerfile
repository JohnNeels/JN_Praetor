# ============================================================
# PRAETOR — Orchestrator Dockerfile
# Base: Red Hat Universal Base Image (UBI) 9 — enterprise standard
# Multi-stage build for minimal final image
# ============================================================

# ── Stage 1: Builder ──
FROM registry.access.redhat.com/ubi9/python-311:latest AS builder

USER root
WORKDIR /build

# Install build tools
RUN dnf install -y gcc python3-devel && \
    dnf clean all

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Runtime ──
FROM registry.access.redhat.com/ubi9/python-311:latest AS runtime

# OCI labels — required for enterprise registry
LABEL org.opencontainers.image.title="praetor-orchestrator"
LABEL org.opencontainers.image.description="PRAETOR ITOps Orchestrator Service"
LABEL org.opencontainers.image.vendor="Your Org"
LABEL org.opencontainers.image.source="https://github.com/your-org/praetor"
LABEL org.opencontainers.image.licenses="Proprietary"

# Security hardening
USER root
RUN dnf upgrade -y --security && \
    dnf clean all && \
    # Remove unnecessary packages
    dnf remove -y curl wget && \
    # Create non-root user (OpenShift compatible — arbitrary UID)
    useradd -u 1001 -r -g 0 -s /sbin/nologin \
            -c "PRAETOR Service Account" praetor

# Copy installed packages from builder
COPY --from=builder /install /usr/local

WORKDIR /app

# Copy application code
COPY --chown=1001:0 main.py .
COPY --chown=1001:0 config/ ./config/

# OpenShift: directories must be group-writable (GID 0)
RUN chmod -R g=u /app && \
    # Create writable tmp (read-only rootfs)
    mkdir -p /tmp/praetor && \
    chown -R 1001:0 /tmp/praetor && \
    chmod -R g=u /tmp/praetor

# Switch to non-root
USER 1001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/live')"

EXPOSE 8000 9090

# Tini init for signal handling
ENTRYPOINT ["python", "-m", "uvicorn", "main:app", \
    "--host", "0.0.0.0", \
    "--port", "8000", \
    "--workers", "2", \
    "--log-config", "/app/config/logging.json"]
