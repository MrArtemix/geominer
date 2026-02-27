# =============================================================
# Ge O'Miner - Pipeline Service (port 8008)
# Multi-stage build optimise - Prefect worker + GDAL
# =============================================================
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# --- Runtime ---
FROM python:3.11-slim

LABEL service="pipeline-svc"
LABEL maintainer="GeoSmart Africa"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libpq5 libgdal32 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -r -u 1001 -m geominer

COPY --from=builder /install /usr/local

WORKDIR /app
COPY src/ ./src/

USER geominer
EXPOSE 8008

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8008/health || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8008"]
