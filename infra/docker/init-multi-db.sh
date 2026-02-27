#!/bin/bash
# =============================================================
# Ge O'Miner - Creation idempotente des bases additionnelles
# Cree keycloakdb et mlflowdb si elles n'existent pas
# geominerdb est cree automatiquement via POSTGRES_DB
# =============================================================
set -e

echo "=== Initialisation des bases de donnees supplementaires ==="

# Creer keycloakdb si elle n'existe pas
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE keycloakdb'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloakdb')\gexec

    SELECT 'CREATE DATABASE mlflowdb'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'mlflowdb')\gexec
EOSQL

# Accorder les privileges
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    GRANT ALL PRIVILEGES ON DATABASE keycloakdb TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE mlflowdb TO $POSTGRES_USER;
EOSQL

echo "=== Bases keycloakdb et mlflowdb pretes ==="
