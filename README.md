# Ge O'Miner - GeoSmart Africa

Plateforme souveraine de surveillance geospatiale contre l'orpaillage clandestin en Cote d'Ivoire.

## Architecture

- **Backend** : Python 3.12 / FastAPI - 11 microservices
- **Frontend** : Next.js 14 / TypeScript / MapLibre GL JS
- **Base de donnees** : PostgreSQL 16 + PostGIS 3.4 + TimescaleDB
- **Cache / Streams** : Redis 7
- **Stockage objet** : MinIO (compatible S3)
- **Auth SSO** : Keycloak 24 (OIDC/PKCE)
- **Blockchain** : Hyperledger Fabric 2.5
- **IoT** : LoRaWAN + MQTT (Mosquitto)
- **IA** : SegFormer-B4 (segmentation satellite)
- **Orchestration** : Prefect 2 / Docker Compose / Kubernetes

## Prerequis

- Docker >= 24.0 et Docker Compose >= 2.20
- Python >= 3.12
- Node.js >= 20 LTS
- Go >= 1.21 (pour les chaincodes Hyperledger)
- GDAL >= 3.8

## Installation rapide

```bash
# 1. Cloner le depot
git clone <repo-url> geominer && cd geominer

# 2. Copier les variables d'environnement
cp infra/docker/.env.example infra/docker/.env

# 3. Lancer l'infrastructure
docker compose -f infra/docker/docker-compose.yml up -d

# 4. Initialiser la base de donnees
docker exec -i geominer-postgres psql -U geominer -d geominerdb < scripts/schema.sql
docker exec -i geominer-postgres psql -U geominer -d geominerdb < scripts/seed-data.sql

# 5. Lancer le frontend
cd frontend/web && npm install && npm run dev
```

## Structure du projet

```
geominer/
├── backend/           # Microservices Python (FastAPI)
│   ├── api-gateway/   # Gateway + auth + rate limiting
│   ├── minespotai-svc/# Detection IA sites miniers
│   ├── pipeline-svc/  # Pipeline satellite Prefect
│   ├── alertflow-svc/ # Alertes temps reel
│   ├── aquaguard-svc/ # Capteurs IoT qualite eau
│   ├── goldtrack-svc/ # Tracabilite or (blockchain)
│   ├── goldpath-svc/  # Analyse flux or
│   ├── legalvault-svc/# Preuves legales (IPFS)
│   └── reporting-svc/ # Rapports
├── frontend/
│   ├── web/           # Next.js 14 + MapLibre
│   └── mobile/        # App mobile (futur)
├── ml/                # Modeles IA & entrainement
├── blockchain/        # Hyperledger Fabric
├── iot/               # Capteurs & simulateur
├── infra/             # Docker, K8s, Terraform
├── shared/            # Types & schemas partages
└── scripts/           # Scripts utilitaires
```

## Verification

```bash
# PostGIS
psql -h localhost -U geominer -d geominerdb -c "SELECT PostGIS_version();"

# Keycloak
curl http://localhost:8080/realms/geominer

# MinIO
curl http://localhost:9000/minio/health/live

# API Gateway
curl http://localhost:8000/health

# MineSPOT AI
curl http://localhost:8001/health
```

## Licence

Proprietary - AUCTAL 360 / Republique de Cote d'Ivoire
