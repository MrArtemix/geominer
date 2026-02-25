#!/bin/bash
# =============================================================
# Ge O'Miner - Insertion donnees de demonstration
# =============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Insertion des donnees de demonstration..."

docker exec -i geominer-postgres psql -U geominer -d geominerdb < "$SCRIPT_DIR/seed-data.sql"

echo "Donnees inserees avec succes:"
docker exec geominer-postgres psql -U geominer -d geominerdb -c "
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'mining_sites', COUNT(*) FROM mining_sites
UNION ALL
SELECT 'alerts', COUNT(*) FROM alerts
UNION ALL
SELECT 'operations', COUNT(*) FROM operations
UNION ALL
SELECT 'mining_permits', COUNT(*) FROM mining_permits;
"
