#!/bin/bash
# =============================================================
# Ge O'Miner - Script d'installation complete
# =============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo " Ge O'Miner - Installation"
echo "=========================================="

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Verification des prerequis
check_prerequisites() {
    info "Verification des prerequis..."

    command -v docker >/dev/null 2>&1 || error "Docker n'est pas installe"
    command -v docker compose >/dev/null 2>&1 || error "Docker Compose n'est pas installe"
    command -v python3 >/dev/null 2>&1 || warn "Python 3 n'est pas installe (requis pour le backend)"
    command -v node >/dev/null 2>&1 || warn "Node.js n'est pas installe (requis pour le frontend)"

    DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+')
    info "Docker version: $DOCKER_VERSION"

    info "Prerequis OK"
}

# Configuration des variables d'environnement
setup_env() {
    info "Configuration de l'environnement..."

    ENV_FILE="$PROJECT_ROOT/infra/docker/.env"
    ENV_EXAMPLE="$PROJECT_ROOT/infra/docker/.env.example"

    if [ ! -f "$ENV_FILE" ]; then
        cp "$ENV_EXAMPLE" "$ENV_FILE"
        info "Fichier .env cree a partir de .env.example"
    else
        info "Fichier .env existant conserve"
    fi
}

# Lancement de l'infrastructure Docker
start_infrastructure() {
    info "Lancement de l'infrastructure Docker..."

    cd "$PROJECT_ROOT"
    docker compose -f infra/docker/docker-compose.yml up -d

    info "Attente du demarrage des services..."
    sleep 10

    # Attendre PostgreSQL
    info "Attente de PostgreSQL..."
    for i in $(seq 1 30); do
        if docker exec geominer-postgres pg_isready -U geominer >/dev/null 2>&1; then
            info "PostgreSQL est pret"
            break
        fi
        sleep 2
    done

    # Attendre Redis
    info "Verification de Redis..."
    docker exec geominer-redis redis-cli -a redis_secret_2024 ping >/dev/null 2>&1 && info "Redis est pret" || warn "Redis non disponible"

    # Attendre MinIO
    info "Verification de MinIO..."
    curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1 && info "MinIO est pret" || warn "MinIO non disponible"
}

# Initialisation de la base de donnees
init_database() {
    info "Initialisation de la base de donnees..."

    docker exec -i geominer-postgres psql -U geominer -d geominerdb < "$PROJECT_ROOT/scripts/schema.sql" 2>/dev/null || warn "Schema deja applique ou erreur"

    info "Insertion des donnees de test..."
    docker exec -i geominer-postgres psql -U geominer -d geominerdb < "$PROJECT_ROOT/scripts/seed-data.sql" 2>/dev/null || warn "Seed data deja insere ou erreur"

    info "Base de donnees initialisee"
}

# Installation du frontend
setup_frontend() {
    info "Installation du frontend..."

    FRONTEND_DIR="$PROJECT_ROOT/frontend/web"

    if [ -f "$FRONTEND_DIR/package.json" ]; then
        cd "$FRONTEND_DIR"

        if [ ! -f ".env.local" ]; then
            cp .env.local.example .env.local 2>/dev/null || true
            info "Fichier .env.local cree"
        fi

        if command -v npm >/dev/null 2>&1; then
            npm install
            info "Dependances frontend installees"
        else
            warn "npm non disponible - installation frontend ignoree"
        fi
    fi
}

# Verification finale
verify() {
    info "Verification de l'installation..."
    echo ""

    # PostgreSQL + PostGIS
    POSTGIS=$(docker exec geominer-postgres psql -U geominer -d geominerdb -tAc "SELECT PostGIS_version();" 2>/dev/null || echo "N/A")
    echo -e "  PostGIS:    ${GREEN}${POSTGIS}${NC}"

    # Nombre de sites
    SITES=$(docker exec geominer-postgres psql -U geominer -d geominerdb -tAc "SELECT COUNT(*) FROM mining_sites;" 2>/dev/null || echo "N/A")
    echo -e "  Sites seed: ${GREEN}${SITES}${NC}"

    # Redis
    REDIS=$(docker exec geominer-redis redis-cli -a redis_secret_2024 ping 2>/dev/null || echo "N/A")
    echo -e "  Redis:      ${GREEN}${REDIS}${NC}"

    # MinIO
    MINIO=$(curl -sf http://localhost:9000/minio/health/live && echo "OK" || echo "N/A")
    echo -e "  MinIO:      ${GREEN}${MINIO}${NC}"

    echo ""
    info "Installation terminee!"
    echo ""
    echo "  Prochaines etapes:"
    echo "    1. Lancer le backend:  cd backend/api-gateway && uvicorn src.main:app --port 8000"
    echo "    2. Lancer le frontend: cd frontend/web && npm run dev"
    echo "    3. Ouvrir: http://localhost:3000"
    echo ""
}

# Execution
check_prerequisites
setup_env
start_infrastructure
init_database
setup_frontend
verify
