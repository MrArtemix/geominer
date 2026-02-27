# =============================================================
# Ge O'Miner - AquaGuard Service (port 8005)
# Multi-stage build optimise
# =============================================================
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# --- Runtime ---
FROM python:3.11-slim

LABEL service="aquaguard-svc"
LABEL maintainer="GeoSmart Africa"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -u 1001 -m geominer

COPY --from=builder /install /usr/local

WORKDIR /app
COPY src/ ./src/

USER geominer
EXPOSE 8005

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8005/health || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8005"]
