#!/bin/bash
# =============================================================
# Ge O'Miner - Script de deploiement
# =============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

ENV=${1:-staging}

echo "=========================================="
echo " Ge O'Miner - Deploiement ($ENV)"
echo "=========================================="

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Validation de l'environnement
case $ENV in
    staging|production)
        info "Deploiement vers: $ENV"
        ;;
    *)
        error "Environnement invalide: $ENV (utiliser staging ou production)"
        ;;
esac

# Build des images Docker
build_images() {
    info "Build des images Docker..."

    SERVICES=(
        "backend/api-gateway"
        "backend/minespotai-svc"
        "backend/alertflow-svc"
        "backend/aquaguard-svc"
        "backend/goldtrack-svc"
        "backend/legalvault-svc"
    )

    TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")

    for svc in "${SERVICES[@]}"; do
        NAME=$(basename "$svc")
        info "Building geominer-$NAME:$TAG"
        docker build -t "geominer-$NAME:$TAG" "$PROJECT_ROOT/$svc"
    done

    info "Toutes les images sont construites (tag: $TAG)"
}

# Tests pre-deploiement
run_checks() {
    info "Execution des verifications pre-deploiement..."

    # Lint Python
    if command -v ruff >/dev/null 2>&1; then
        ruff check "$PROJECT_ROOT/backend/" || warn "Lint issues detected"
    fi

    info "Verifications terminees"
}

# Deploiement
deploy() {
    info "Deploiement..."

    if [ "$ENV" = "staging" ]; then
        info "Deploiement Docker Compose (staging)..."
        cd "$PROJECT_ROOT"
        docker compose -f infra/docker/docker-compose.yml down
        docker compose -f infra/docker/docker-compose.yml up -d
    elif [ "$ENV" = "production" ]; then
        info "Deploiement Kubernetes (production)..."
        if command -v kubectl >/dev/null 2>&1; then
            kubectl apply -k "$PROJECT_ROOT/infra/k8s/production/"
        else
            error "kubectl non disponible pour le deploiement production"
        fi
    fi

    info "Deploiement termine!"
}

run_checks
build_images
deploy
