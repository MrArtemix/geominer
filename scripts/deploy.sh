#!/usr/bin/env bash
# Script de deploiement Ge O'Miner
set -euo pipefail

COMPOSE_FILE="infra/docker/docker-compose.yml"
ENV_FILE="infra/docker/.env"
SERVICES=(
    "api-gateway"
    "minespotai-svc"
    "alertflow-svc"
    "aquaguard-svc"
    "goldtrack-svc"
    "legalvault-svc"
    "goldpath-svc"
    "pipeline-svc"
    "reporting-svc"
)

echo "=========================================="
echo "   Ge O'Miner - Deploiement"
echo "=========================================="

# 1. Build des images Docker
echo ""
echo "[1/4] Build des images Docker..."
for svc in "${SERVICES[@]}"; do
    echo "  Building $svc..."
    docker build -t "geominer/$svc:latest" "backend/$svc/" 2>/dev/null || echo "  WARN: Build echoue pour $svc"
done

# 2. Pull des images externes
echo ""
echo "[2/4] Pull des images externes..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull --ignore-pull-failures 2>/dev/null || true

# 3. Redemarrage progressif (rolling restart)
echo ""
echo "[3/4] Redemarrage des services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile core up -d

# 4. Verification sante
echo ""
echo "[4/4] Verification de sante des services..."
PORTS=(8000 8001 8003 8005 8004 8007 8006 8008 8010)
for i in "${!SERVICES[@]}"; do
    svc="${SERVICES[$i]}"
    port="${PORTS[$i]}"
    echo -n "  $svc (port $port)... "
    for attempt in $(seq 1 30); do
        if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
            echo "OK"
            break
        fi
        if [ "$attempt" -eq 30 ]; then
            echo "TIMEOUT"
        fi
        sleep 2
    done
done

echo ""
echo "=========================================="
echo "  Deploiement termine !"
echo "=========================================="
