-- =============================================================
-- Ge O'Miner - Schema de Base de Donnees PostGIS
-- GeoSmart Africa - Surveillance Orpaillage Clandestin CI
-- =============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "postgis_raster";
-- H3 extension (installer separement si disponible)
-- CREATE EXTENSION IF NOT EXISTS "h3";

-- =============================================================
-- ENUMS
-- =============================================================

CREATE TYPE site_status_enum AS ENUM (
    'DETECTED',
    'UNDER_REVIEW',
    'CONFIRMED',
    'ACTIVE',
    'ESCALATED',
    'DISMANTLED',
    'RECURRED'
);

CREATE TYPE alert_severity_enum AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);

CREATE TYPE operation_status_enum AS ENUM (
    'PLANNED',
    'IN_PROGRESS',
    'COMPLETED',
    'ABORTED'
);

CREATE TYPE permit_status_enum AS ENUM (
    'PENDING',
    'APPROVED',
    'ACTIVE',
    'SUSPENDED',
    'REVOKED',
    'EXPIRED'
);

CREATE TYPE user_role_enum AS ENUM (
    'SUPER_ADMIN',
    'ADMIN_MINES',
    'ANALYSTE_SIG',
    'OFFICIER_GSLOI',
    'AGENT_TERRAIN',
    'INSPECTEUR_MINES',
    'ONG_AUDITEUR',
    'API_PARTENAIRE'
);

-- =============================================================
-- TABLE: users
-- =============================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keycloak_id VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'AGENT_TERRAIN',
    zones_access UUID[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_keycloak_id ON users(keycloak_id);
CREATE INDEX idx_users_role ON users(role);

-- =============================================================
-- TABLE: mining_sites
-- =============================================================

CREATE TABLE IF NOT EXISTS mining_sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_code VARCHAR(20) UNIQUE NOT NULL,
    geometry GEOMETRY(POLYGON, 4326) NOT NULL,
    area_ha NUMERIC(10,4) GENERATED ALWAYS AS (
        ST_Area(geometry::geography) / 10000.0
    ) STORED,
    centroid GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (
        ST_Centroid(geometry)
    ) STORED,
    h3_index_r7 VARCHAR(20),
    confidence_ai NUMERIC(4,3) CHECK (confidence_ai >= 0 AND confidence_ai <= 1),
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    satellite_date DATE,
    sat_source VARCHAR(50),
    status site_status_enum DEFAULT 'DETECTED',
    blockchain_txid VARCHAR(128),
    ipfs_cid VARCHAR(128),
    region VARCHAR(100),
    department VARCHAR(100),
    sous_prefecture VARCHAR(100),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index
CREATE INDEX idx_mining_sites_geometry ON mining_sites USING GIST(geometry);
CREATE INDEX idx_mining_sites_centroid ON mining_sites USING GIST(centroid);
-- H3 index
CREATE INDEX idx_mining_sites_h3 ON mining_sites(h3_index_r7);
-- Composite index for status queries
CREATE INDEX idx_mining_sites_status_detected ON mining_sites(status, detected_at DESC);
-- Site code lookup
CREATE INDEX idx_mining_sites_code ON mining_sites(site_code);

-- =============================================================
-- TABLE: alerts
-- =============================================================

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID REFERENCES mining_sites(id) ON DELETE SET NULL,
    alert_type VARCHAR(50) NOT NULL,
    severity alert_severity_enum NOT NULL DEFAULT 'MEDIUM',
    title VARCHAR(255) NOT NULL,
    message TEXT,
    coordinates GEOMETRY(POINT, 4326),
    sent_to UUID[] DEFAULT '{}',
    channels VARCHAR(50)[] DEFAULT '{}',
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMPTZ,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_site ON alerts(site_id);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_alerts_created ON alerts(created_at DESC);
CREATE INDEX idx_alerts_coordinates ON alerts USING GIST(coordinates);

-- =============================================================
-- TABLE: operations
-- =============================================================

CREATE TABLE IF NOT EXISTS operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID REFERENCES mining_sites(id) ON DELETE CASCADE,
    officer_id UUID REFERENCES users(id),
    team VARCHAR(255),
    status operation_status_enum DEFAULT 'PLANNED',
    objective TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    report_ipfs_cid VARCHAR(128),
    findings TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_operations_site ON operations(site_id);
CREATE INDEX idx_operations_officer ON operations(officer_id);
CREATE INDEX idx_operations_status ON operations(status);

-- =============================================================
-- TABLE: sensor_readings (TimescaleDB hypertable)
-- =============================================================

CREATE TABLE IF NOT EXISTS sensor_readings (
    time TIMESTAMPTZ NOT NULL,
    sensor_id VARCHAR(50) NOT NULL,
    parameter VARCHAR(30) NOT NULL,
    value NUMERIC(12,4) NOT NULL,
    unit VARCHAR(20),
    lat NUMERIC(9,6),
    lon NUMERIC(9,6),
    battery_level NUMERIC(5,2),
    signal_rssi INTEGER,
    is_anomaly BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_sensor_readings_sensor ON sensor_readings(sensor_id, time DESC);
CREATE INDEX idx_sensor_readings_param ON sensor_readings(parameter, time DESC);

-- TimescaleDB hypertable (activer si TimescaleDB est installe)
-- SELECT create_hypertable('sensor_readings', 'time', if_not_exists => TRUE);

-- =============================================================
-- TABLE: gold_transactions
-- =============================================================

CREATE TABLE IF NOT EXISTS gold_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blockchain_txid VARCHAR(128),
    from_entity VARCHAR(255) NOT NULL,
    to_entity VARCHAR(255) NOT NULL,
    weight_grams NUMERIC(10,3) NOT NULL CHECK (weight_grams > 0),
    purity_percent NUMERIC(5,2) CHECK (purity_percent >= 0 AND purity_percent <= 100),
    gps_location GEOMETRY(POINT, 4326),
    agent_id UUID REFERENCES users(id),
    is_legal BOOLEAN,
    diverg_score NUMERIC(4,3),
    source_site_id UUID REFERENCES mining_sites(id),
    notes TEXT,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gold_tx_blockchain ON gold_transactions(blockchain_txid);
CREATE INDEX idx_gold_tx_entities ON gold_transactions(from_entity, to_entity);
CREATE INDEX idx_gold_tx_location ON gold_transactions USING GIST(gps_location);
CREATE INDEX idx_gold_tx_legal ON gold_transactions(is_legal);

-- =============================================================
-- TABLE: mining_permits
-- =============================================================

CREATE TABLE IF NOT EXISTS mining_permits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    permit_number VARCHAR(50) UNIQUE NOT NULL,
    orpailleur_id VARCHAR(255) NOT NULL,
    orpailleur_name VARCHAR(255),
    zone_geometry GEOMETRY(POLYGON, 4326),
    blockchain_txid VARCHAR(128),
    status permit_status_enum DEFAULT 'PENDING',
    issued_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    issuing_authority VARCHAR(255),
    conditions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_permits_orpailleur ON mining_permits(orpailleur_id);
CREATE INDEX idx_permits_status ON mining_permits(status);
CREATE INDEX idx_permits_zone ON mining_permits USING GIST(zone_geometry);
CREATE INDEX idx_permits_expires ON mining_permits(expires_at);

-- =============================================================
-- TABLE: evidence_files
-- =============================================================

CREATE TABLE IF NOT EXISTS evidence_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID REFERENCES mining_sites(id) ON DELETE SET NULL,
    operation_id UUID REFERENCES operations(id) ON DELETE SET NULL,
    file_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255),
    file_size_bytes BIGINT,
    mime_type VARCHAR(100),
    ipfs_cid VARCHAR(128),
    sha256_hash VARCHAR(64) NOT NULL,
    blockchain_txid VARCHAR(128),
    description TEXT,
    uploaded_by UUID REFERENCES users(id),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    is_verified BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_evidence_site ON evidence_files(site_id);
CREATE INDEX idx_evidence_operation ON evidence_files(operation_id);
CREATE INDEX idx_evidence_ipfs ON evidence_files(ipfs_cid);
CREATE INDEX idx_evidence_hash ON evidence_files(sha256_hash);

-- =============================================================
-- TABLE: site_history (audit trail)
-- =============================================================

CREATE TABLE IF NOT EXISTS site_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID REFERENCES mining_sites(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    old_status site_status_enum,
    new_status site_status_enum,
    changed_by UUID REFERENCES users(id),
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_site_history_site ON site_history(site_id, created_at DESC);

-- =============================================================
-- FUNCTIONS
-- =============================================================

-- Trigger pour mettre a jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mining_sites_updated
    BEFORE UPDATE ON mining_sites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_operations_updated
    BEFORE UPDATE ON operations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_permits_updated
    BEFORE UPDATE ON mining_permits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger pour enregistrer l'historique des changements de statut
CREATE OR REPLACE FUNCTION log_site_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO site_history (site_id, action, old_status, new_status, details)
        VALUES (NEW.id, 'STATUS_CHANGE', OLD.status, NEW.status,
                jsonb_build_object('satellite_date', NEW.satellite_date, 'confidence_ai', NEW.confidence_ai));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_site_status_change
    AFTER UPDATE ON mining_sites
    FOR EACH ROW EXECUTE FUNCTION log_site_status_change();
