#!/bin/bash
# =============================================================
# Ge O'Miner - Script d'installation complete
# Infrastructure Docker avec healthchecks robustes
# =============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/infra/docker/docker-compose.yml"
ENV_FILE="$PROJECT_ROOT/infra/docker/.env"
ENV_EXAMPLE="$PROJECT_ROOT/infra/docker/.env.example"

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Compteur de temps
START_TIME=$(date +%s)

info()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[FAIL]${NC}  $1"; }
section() { echo -e "\n${CYAN}${BOLD}--- $1 ---${NC}"; }

# =============================================================
# Banniere ASCII
# =============================================================
print_banner() {
    echo -e "${CYAN}"
    cat << 'BANNER'

   ██████╗ ███████╗     ██████╗ ██╗███╗   ███╗██╗███╗   ██╗███████╗██████╗
  ██╔════╝ ██╔════╝    ██╔═══██╗╚██╗██╔╝██║████╗  ██║██╔════╝██╔══██╗
  ██║  ███╗█████╗      ██║   ██║ ╚███╔╝ ██║██╔██╗ ██║█████╗  ██████╔╝
  ██║   ██║██╔══╝      ██║   ██║ ██╔██╗ ██║██║╚██╗██║██╔══╝  ██╔══██╗
  ╚██████╔╝███████╗    ╚██████╔╝██╔╝ ██╗██║██║ ╚████║███████╗██║  ██║
   ╚═════╝ ╚══════╝     ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝

      GeoSmart Africa — Surveillance Orpaillage Clandestin CI
BANNER
    echo -e "${NC}"
}

# =============================================================
# Attente d'un service avec timeout
# $1: nom du service, $2: commande de test, $3: timeout en secondes
# =============================================================
wait_for_service() {
    local name="$1"
    local cmd="$2"
    local timeout="${3:-120}"
    local elapsed=0
    local interval=3

    printf "  Attente de %-20s " "$name..."
    while [ $elapsed -lt $timeout ]; do
        if eval "$cmd" >/dev/null 2>&1; then
            echo -e "${GREEN}OK${NC} (${elapsed}s)"
            return 0
        fi
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    echo -e "${RED}TIMEOUT${NC} (${timeout}s)"
    return 1
}

# =============================================================
# 1. Prerequis
# =============================================================
check_prerequisites() {
    section "Verification des prerequis"

    command -v docker >/dev/null 2>&1 || { error "Docker n'est pas installe"; exit 1; }
    command -v docker compose >/dev/null 2>&1 || { error "Docker Compose n'est pas installe"; exit 1; }

    DOCKER_VERSION=$(docker --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
    info "Docker version: $DOCKER_VERSION"

    command -v python3 >/dev/null 2>&1 && info "Python3 detecte" || warn "Python3 non installe (requis pour le backend)"
    command -v node >/dev/null 2>&1 && info "Node.js detecte" || warn "Node.js non installe (requis pour le frontend)"

    # Verifier que Docker daemon tourne
    docker info >/dev/null 2>&1 || { error "Docker daemon n'est pas demarre"; exit 1; }
    info "Docker daemon actif"
}

# =============================================================
# 2. Configuration environnement
# =============================================================
setup_env() {
    section "Configuration de l'environnement"

    if [ ! -f "$ENV_FILE" ]; then
        if [ -f "$ENV_EXAMPLE" ]; then
            cp "$ENV_EXAMPLE" "$ENV_FILE"
            info "Fichier .env cree a partir de .env.example"
        else
            error "Fichier .env.example introuvable : $ENV_EXAMPLE"
            exit 1
        fi
    else
        info "Fichier .env existant conserve"
    fi

    # Charger les variables pour les verifications
    set -a
    source "$ENV_FILE"
    set +a
    info "Variables d'environnement chargees"
}

# =============================================================
# 3. Lancement Docker Compose (profil core)
# =============================================================
start_infrastructure() {
    section "Lancement de l'infrastructure Docker (profil core)"

    cd "$PROJECT_ROOT"
    docker compose -f "$COMPOSE_FILE" --profile core up -d

    info "Conteneurs lances"
}

# =============================================================
# 4. Healthchecks par service
# =============================================================
wait_for_services() {
    section "Attente des services (healthchecks)"

    local failed=0

    # PostgreSQL / TimescaleDB
    wait_for_service "PostgreSQL" \
        "docker exec geominer-postgres pg_isready -U ${POSTGRES_USER:-geominer} -d ${POSTGRES_DB:-geominerdb}" \
        90 || failed=$((failed + 1))

    # Redis
    wait_for_service "Redis" \
        "docker exec geominer-redis redis-cli -a ${REDIS_PASSWORD:-redis_secret_2024} ping" \
        60 || failed=$((failed + 1))

    # MinIO
    wait_for_service "MinIO" \
        "curl -sf http://localhost:${MINIO_PORT:-9000}/minio/health/live" \
        60 || failed=$((failed + 1))

    # Keycloak (demarrage lent)
    wait_for_service "Keycloak" \
        "curl -sf http://localhost:${KEYCLOAK_PORT:-8080}/health/ready" \
        180 || failed=$((failed + 1))

    # Mosquitto
    wait_for_service "Mosquitto" \
        "docker exec geominer-mosquitto mosquitto_sub -t '\$SYS/#' -C 1 -i healthcheck -W 3 -u geominer -P geominer_secret_2024" \
        60 || failed=$((failed + 1))

    # Prefect
    wait_for_service "Prefect" \
        "curl -sf http://localhost:${PREFECT_PORT:-4200}/api/health" \
        90 || failed=$((failed + 1))

    # MLflow
    wait_for_service "MLflow" \
        "curl -sf http://localhost:${MLFLOW_PORT:-5000}/health" \
        120 || failed=$((failed + 1))

    # IPFS
    wait_for_service "IPFS/Kubo" \
        "curl -sf -X POST http://localhost:${IPFS_API_PORT:-5001}/api/v0/id" \
        60 || failed=$((failed + 1))

    # Vault
    wait_for_service "Vault" \
        "curl -sf http://localhost:${VAULT_PORT:-8200}/v1/sys/health" \
        60 || failed=$((failed + 1))

    if [ $failed -gt 0 ]; then
        warn "$failed service(s) n'ont pas repondu dans le delai imparti"
    else
        info "Tous les services sont operationnels"
    fi
}

# =============================================================
# 5. Verification base de donnees
# =============================================================
verify_database() {
    section "Verification de la base de donnees"

    # PostGIS
    POSTGIS=$(docker exec geominer-postgres psql -U "${POSTGRES_USER:-geominer}" -d "${POSTGRES_DB:-geominerdb}" -tAc "SELECT PostGIS_version();" 2>/dev/null || echo "N/A")
    if [ "$POSTGIS" != "N/A" ]; then
        info "PostGIS: $POSTGIS"
    else
        warn "PostGIS non disponible"
    fi

    # TimescaleDB
    TSDB=$(docker exec geominer-postgres psql -U "${POSTGRES_USER:-geominer}" -d "${POSTGRES_DB:-geominerdb}" -tAc "SELECT extversion FROM pg_extension WHERE extname='timescaledb';" 2>/dev/null || echo "N/A")
    if [ -n "$TSDB" ] && [ "$TSDB" != "N/A" ]; then
        info "TimescaleDB: $TSDB"
    else
        warn "TimescaleDB non disponible"
    fi

    # Nombre de tables
    TABLE_COUNT=$(docker exec geominer-postgres psql -U "${POSTGRES_USER:-geominer}" -d "${POSTGRES_DB:-geominerdb}" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" 2>/dev/null || echo "0")
    if [ "$TABLE_COUNT" -ge 10 ] 2>/dev/null; then
        info "Tables creees: $TABLE_COUNT"
    else
        warn "Nombre de tables insuffisant: $TABLE_COUNT (attendu >= 10)"
    fi

    # Donnees seed
    SITES=$(docker exec geominer-postgres psql -U "${POSTGRES_USER:-geominer}" -d "${POSTGRES_DB:-geominerdb}" -tAc "SELECT COUNT(*) FROM mining_sites;" 2>/dev/null || echo "0")
    USERS=$(docker exec geominer-postgres psql -U "${POSTGRES_USER:-geominer}" -d "${POSTGRES_DB:-geominerdb}" -tAc "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
    SENSORS=$(docker exec geominer-postgres psql -U "${POSTGRES_USER:-geominer}" -d "${POSTGRES_DB:-geominerdb}" -tAc "SELECT COUNT(DISTINCT sensor_id) FROM sensor_readings;" 2>/dev/null || echo "0")
    info "Donnees seed: $USERS utilisateurs, $SITES sites, $SENSORS capteurs AquaGuard"

    # Bases supplementaires
    KC_DB=$(docker exec geominer-postgres psql -U "${POSTGRES_USER:-geominer}" -d "${POSTGRES_DB:-geominerdb}" -tAc "SELECT 1 FROM pg_database WHERE datname='keycloakdb';" 2>/dev/null || echo "")
    ML_DB=$(docker exec geominer-postgres psql -U "${POSTGRES_USER:-geominer}" -d "${POSTGRES_DB:-geominerdb}" -tAc "SELECT 1 FROM pg_database WHERE datname='mlflowdb';" 2>/dev/null || echo "")
    [ -n "$KC_DB" ] && info "Base keycloakdb: OK" || warn "Base keycloakdb absente"
    [ -n "$ML_DB" ] && info "Base mlflowdb: OK" || warn "Base mlflowdb absente"
}

# =============================================================
# 6. Verification MinIO (buckets)
# =============================================================
verify_minio() {
    section "Verification MinIO"

    MINIO_HEALTH=$(curl -sf http://localhost:${MINIO_PORT:-9000}/minio/health/live && echo "OK" || echo "FAIL")
    if [ "$MINIO_HEALTH" = "OK" ]; then
        info "MinIO health: OK"
    else
        warn "MinIO non joignable"
    fi
}

# =============================================================
# 7. Verification Keycloak
# =============================================================
verify_keycloak() {
    section "Verification Keycloak"

    REALM=$(curl -sf http://localhost:${KEYCLOAK_PORT:-8080}/realms/geominer 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('realm',''))" 2>/dev/null || echo "")
    if [ "$REALM" = "geominer" ]; then
        info "Realm 'geominer' importe avec succes"
    else
        warn "Realm 'geominer' non detecte (Keycloak en cours de demarrage ?)"
    fi
}

# =============================================================
# 8. Resume final
# =============================================================
print_summary() {
    local END_TIME=$(date +%s)
    local DURATION=$((END_TIME - START_TIME))
    local MINUTES=$((DURATION / 60))
    local SECONDS=$((DURATION % 60))

    echo ""
    echo -e "${CYAN}${BOLD}============================================${NC}"
    echo -e "${CYAN}${BOLD}  Ge O'Miner - Installation terminee${NC}"
    echo -e "${CYAN}${BOLD}  Duree: ${MINUTES}m ${SECONDS}s${NC}"
    echo -e "${CYAN}${BOLD}============================================${NC}"
    echo ""
    echo -e "${BOLD}  Services disponibles :${NC}"
    echo -e "    PostgreSQL/TimescaleDB  ${GREEN}localhost:${POSTGRES_PORT:-5432}${NC}"
    echo -e "    Redis                   ${GREEN}localhost:${REDIS_PORT:-6379}${NC}"
    echo -e "    MinIO API               ${GREEN}http://localhost:${MINIO_PORT:-9000}${NC}"
    echo -e "    MinIO Console           ${GREEN}http://localhost:${MINIO_CONSOLE_PORT:-9001}${NC}"
    echo -e "    Keycloak                ${GREEN}http://localhost:${KEYCLOAK_PORT:-8080}${NC}"
    echo -e "    Mosquitto MQTT          ${GREEN}localhost:${MQTT_PORT:-1883}${NC}"
    echo -e "    Prefect                 ${GREEN}http://localhost:${PREFECT_PORT:-4200}${NC}"
    echo -e "    MLflow                  ${GREEN}http://localhost:${MLFLOW_PORT:-5000}${NC}"
    echo -e "    IPFS API                ${GREEN}http://localhost:${IPFS_API_PORT:-5001}${NC}"
    echo -e "    IPFS Gateway            ${GREEN}http://localhost:${IPFS_GATEWAY_PORT:-8081}${NC}"
    echo -e "    Vault                   ${GREEN}http://localhost:${VAULT_PORT:-8200}${NC}"
    echo ""
    echo -e "${BOLD}  Feature Flags :${NC}"
    echo -e "    USE_MOCK_BLOCKCHAIN      = ${USE_MOCK_BLOCKCHAIN:-true}"
    echo -e "    USE_IPFS_FALLBACK_MINIO  = ${USE_IPFS_FALLBACK_MINIO:-true}"
    echo -e "    ENABLE_REAL_SENTINEL     = ${ENABLE_REAL_SENTINEL:-false}"
    echo ""
    echo -e "${BOLD}  Identifiants :${NC}"
    echo -e "    Keycloak Admin    : admin / admin2026"
    echo -e "    Keycloak Users    : *@geominer.ci / Demo2026!"
    echo -e "    MinIO             : geominer / geominer2026"
    echo -e "    PostgreSQL        : geominer / geominer2026"
    echo -e "    Vault Token       : geominer-vault-token"
    echo ""
    echo -e "${BOLD}  Prochaines etapes :${NC}"
    echo -e "    1. Backend  : cd backend/api-gateway && uvicorn src.main:app --port 8000"
    echo -e "    2. Frontend : cd frontend/web && npm run dev"
    echo -e "    3. Ouvrir   : ${GREEN}http://localhost:3000${NC}"
    echo ""
}

# =============================================================
# Execution principale
# =============================================================
print_banner
check_prerequisites
setup_env
start_infrastructure
wait_for_services
verify_database
verify_minio
verify_keycloak
print_summary
