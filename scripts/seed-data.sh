#!/usr/bin/env bash
# Script de seed complet pour Ge O'Miner
set -euo pipefail

CONTAINER="geominer-postgres"
DB_USER="geominer"
DB_NAME="geominerdb"

echo "=== Seed Ge O'Miner ==="

# 1. Appliquer le schema
echo "[1/4] Application du schema SQL..."
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < scripts/schema.sql

# 2. Seed data
echo "[2/4] Insertion des donnees de seed..."
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < scripts/seed-data.sql

# 3. Creer les index supplementaires
echo "[3/4] Creation des index..."
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
  CREATE INDEX IF NOT EXISTS idx_mining_sites_h3 ON mining_sites(h3_index_r7);
  CREATE INDEX IF NOT EXISTS idx_mining_sites_status ON mining_sites(status);
  CREATE INDEX IF NOT EXISTS idx_mining_sites_region ON mining_sites(region);
  CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
  CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
  CREATE INDEX IF NOT EXISTS idx_sensor_readings_sensor ON sensor_readings(sensor_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_gold_transactions_site ON gold_transactions(site_id);
  CREATE INDEX IF NOT EXISTS idx_miners_registry_status ON miners_registry(status);
  CREATE INDEX IF NOT EXISTS idx_evidence_records_site ON evidence_records(site_id);
"

# 4. Seed sensor data (7 jours)
echo "[4/4] Generation des donnees capteurs (7 jours)..."
if command -v python3 &>/dev/null; then
    python3 scripts/seed-sensor-data.py
else
    echo "  Python3 non disponible, skip seed-sensor-data.py"
fi

# Verification
echo ""
echo "=== Verification ==="
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "
  SELECT 'users' AS table_name, COUNT(*) FROM users
  UNION ALL SELECT 'mining_sites', COUNT(*) FROM mining_sites
  UNION ALL SELECT 'alerts', COUNT(*) FROM alerts
  UNION ALL SELECT 'operations', COUNT(*) FROM operations
  UNION ALL SELECT 'sensor_readings', COUNT(*) FROM sensor_readings
  UNION ALL SELECT 'miners_registry', COUNT(*) FROM miners_registry
  UNION ALL SELECT 'evidence_records', COUNT(*) FROM evidence_records
  UNION ALL SELECT 'h3_risk_scores', COUNT(*) FROM h3_risk_scores
  ORDER BY table_name;
"

echo ""
echo "Seed termine avec succes !"
