-- =============================================================
-- Ge O'Miner - Donnees de Test (Seed Data)
-- Region de la Bagoue, Cote d'Ivoire
-- =============================================================

-- Utilisateurs de test (avec username et last_login)
INSERT INTO users (id, keycloak_id, email, username, full_name, role, last_login) VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'kc-admin-001', 'admin@geominer.ci', 'admin', 'Kouame Affoue', 'SUPER_ADMIN', '2026-02-20 08:00:00+00'),
    ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'kc-analyste-001', 'analyste@geominer.ci', 'analyste', 'Traore Ibrahim', 'ANALYSTE_SIG', '2026-02-19 14:30:00+00'),
    ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'kc-officier-001', 'officier@geominer.ci', 'officier', 'Coulibaly Seydou', 'OFFICIER_GSLOI', '2026-02-18 09:15:00+00'),
    ('d4e5f6a7-b8c9-0123-defa-234567890123', 'kc-agent-001', 'agent@geominer.ci', 'agent', 'Bamba Moussa', 'AGENT_TERRAIN', '2026-02-17 11:45:00+00'),
    ('e5f6a7b8-c9d0-1234-efab-345678901234', 'kc-inspecteur-001', 'inspecteur@geominer.ci', 'inspecteur', 'Kone Aminata', 'INSPECTEUR_MINES', '2026-02-16 16:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- Sites miniers detectes dans la region de la Bagoue
INSERT INTO mining_sites (id, site_code, geometry, h3_index_r7, confidence_ai, detected_at, satellite_date, sat_source, status, gold_estim_ton, status_history, region, department, sous_prefecture, created_by) VALUES
    (
        '11111111-1111-1111-1111-111111111111',
        'BAG-2024-001',
        ST_GeomFromText('POLYGON((-6.425 9.812, -6.420 9.812, -6.420 9.808, -6.425 9.808, -6.425 9.812))', 4326),
        '871f24a5fffffff',
        0.945,
        '2024-11-15 08:30:00+00',
        '2024-11-14',
        'Sentinel-2',
        'CONFIRMED',
        2.3500,
        '[{"status": "DETECTED", "date": "2024-11-15"}, {"status": "UNDER_REVIEW", "date": "2024-11-20"}, {"status": "CONFIRMED", "date": "2024-12-01"}]',
        'Bagoue',
        'Boundiali',
        'Boundiali',
        'b2c3d4e5-f6a7-8901-bcde-f12345678901'
    ),
    (
        '22222222-2222-2222-2222-222222222222',
        'BAG-2024-002',
        ST_GeomFromText('POLYGON((-6.380 9.750, -6.375 9.750, -6.375 9.746, -6.380 9.746, -6.380 9.750))', 4326),
        '871f24a6fffffff',
        0.872,
        '2024-11-20 10:15:00+00',
        '2024-11-19',
        'Sentinel-2',
        'UNDER_REVIEW',
        0.8200,
        '[{"status": "DETECTED", "date": "2024-11-20"}, {"status": "UNDER_REVIEW", "date": "2024-11-25"}]',
        'Bagoue',
        'Boundiali',
        'Kolia',
        'b2c3d4e5-f6a7-8901-bcde-f12345678901'
    ),
    (
        '33333333-3333-3333-3333-333333333333',
        'BAG-2024-003',
        ST_GeomFromText('POLYGON((-6.510 9.680, -6.503 9.680, -6.503 9.674, -6.510 9.674, -6.510 9.680))', 4326),
        '871f24b0fffffff',
        0.931,
        '2024-12-01 07:45:00+00',
        '2024-11-30',
        'Sentinel-1-SAR',
        'ACTIVE',
        5.1000,
        '[{"status": "DETECTED", "date": "2024-12-01"}, {"status": "ACTIVE", "date": "2024-12-10"}]',
        'Bagoue',
        'Tengrela',
        'Tengrela',
        'b2c3d4e5-f6a7-8901-bcde-f12345678901'
    ),
    (
        '44444444-4444-4444-4444-444444444444',
        'BAG-2024-004',
        ST_GeomFromText('POLYGON((-6.350 9.720, -6.344 9.720, -6.344 9.715, -6.350 9.715, -6.350 9.720))', 4326),
        '871f24a7fffffff',
        0.785,
        '2024-12-05 09:00:00+00',
        '2024-12-04',
        'Sentinel-2',
        'DETECTED',
        0.4500,
        '[{"status": "DETECTED", "date": "2024-12-05"}]',
        'Bagoue',
        'Boundiali',
        'Ganaoni',
        NULL
    ),
    (
        '55555555-5555-5555-5555-555555555555',
        'BAG-2024-005',
        ST_GeomFromText('POLYGON((-6.460 9.790, -6.452 9.790, -6.452 9.783, -6.460 9.783, -6.460 9.790))', 4326),
        '871f24a8fffffff',
        0.968,
        '2024-12-10 11:20:00+00',
        '2024-12-09',
        'Sentinel-2',
        'ESCALATED',
        8.7000,
        '[{"status": "DETECTED", "date": "2024-12-10"}, {"status": "CONFIRMED", "date": "2024-12-15"}, {"status": "ESCALATED", "date": "2024-12-20"}]',
        'Bagoue',
        'Boundiali',
        'Boundiali',
        'b2c3d4e5-f6a7-8901-bcde-f12345678901'
    )
ON CONFLICT (id) DO NOTHING;

-- Alertes de demonstration
INSERT INTO alerts (id, site_id, alert_type, severity, title, message, coordinates, channels, sent_to) VALUES
    (
        'aaaa1111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111',
        'NEW_SITE_DETECTED',
        'HIGH',
        'Nouveau site minier detecte - Boundiali',
        'Un site minier de 2.1 ha a ete detecte par IA avec un score de confiance de 94.5%. Localisation: Boundiali, Region Bagoue.',
        ST_GeomFromText('POINT(-6.4225 9.810)', 4326),
        ARRAY['DASHBOARD', 'EMAIL'],
        ARRAY['a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID, 'c3d4e5f6-a7b8-9012-cdef-123456789012'::UUID]
    ),
    (
        'aaaa2222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
        'SITE_EXPANDED',
        'CRITICAL',
        'Site actif en expansion rapide - Tengrela',
        'Le site BAG-2024-003 a ete confirme ACTIF et montre une expansion de 35% sur les 2 dernieres semaines. Intervention terrain recommandee.',
        ST_GeomFromText('POINT(-6.5065 9.677)', 4326),
        ARRAY['DASHBOARD', 'SMS', 'EMAIL'],
        ARRAY['a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID, 'c3d4e5f6-a7b8-9012-cdef-123456789012'::UUID]
    ),
    (
        'aaaa3333-3333-3333-3333-333333333333',
        '55555555-5555-5555-5555-555555555555',
        'ESCALATION_REQUIRED',
        'CRITICAL',
        'Escalade requise - Site BAG-2024-005',
        'Le site BAG-2024-005 a ete escalde. Score de confiance IA: 96.8%. Superficie estimee: 4.8 ha. Deforestation visible sur imagerie.',
        ST_GeomFromText('POINT(-6.456 9.7865)', 4326),
        ARRAY['DASHBOARD', 'SMS'],
        ARRAY['a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID]
    ),
    (
        'aaaa4444-4444-4444-4444-444444444444',
        NULL,
        'WATER_QUALITY_ALERT',
        'HIGH',
        'Pollution mercure detectee - Riviere Bagoe',
        'Le capteur AQ-BAG-001 a detecte un niveau de mercure de 0.0045 mg/L, depassant le seuil OMS de 0.001 mg/L. Localisation: confluence Bagoe-Kouroukele.',
        ST_GeomFromText('POINT(-6.440 9.795)', 4326),
        ARRAY['DASHBOARD', 'EMAIL'],
        ARRAY['a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID, 'e5f6a7b8-c9d0-1234-efab-345678901234'::UUID]
    )
ON CONFLICT (id) DO NOTHING;

-- Operations de terrain
INSERT INTO operations (id, site_id, officer_id, team, status, objective, started_at) VALUES
    (
        'bbbb1111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111',
        'c3d4e5f6-a7b8-9012-cdef-123456789012',
        'Equipe Alpha - GSLOI Boundiali',
        'IN_PROGRESS',
        'Verification terrain du site BAG-2024-001. Collecte de preuves photographiques et prelevements.',
        '2024-12-15 06:00:00+00'
    ),
    (
        'bbbb2222-2222-2222-2222-222222222222',
        '55555555-5555-5555-5555-555555555555',
        'c3d4e5f6-a7b8-9012-cdef-123456789012',
        'Equipe Bravo - GSLOI Tengrela',
        'PLANNED',
        'Intervention programmee sur site BAG-2024-005 suite a escalade. Coordination avec Gendarmerie.',
        NULL
    )
ON CONFLICT (id) DO NOTHING;

-- Historique des sites
INSERT INTO site_history (site_id, action, old_status, new_status, changed_by, details) VALUES
    ('11111111-1111-1111-1111-111111111111', 'STATUS_CHANGE', 'DETECTED', 'UNDER_REVIEW', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', '{"reason": "Verification imagerie SAR confirmee"}'),
    ('11111111-1111-1111-1111-111111111111', 'STATUS_CHANGE', 'UNDER_REVIEW', 'CONFIRMED', 'c3d4e5f6-a7b8-9012-cdef-123456789012', '{"reason": "Validation terrain effectuee"}'),
    ('33333333-3333-3333-3333-333333333333', 'STATUS_CHANGE', 'DETECTED', 'ACTIVE', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', '{"reason": "Activite miniere confirmee par images multi-temporelles"}'),
    ('55555555-5555-5555-5555-555555555555', 'STATUS_CHANGE', 'DETECTED', 'CONFIRMED', 'b2c3d4e5-f6a7-8901-bcde-f12345678901', '{"reason": "Double confirmation Sentinel-2 + SAR"}'),
    ('55555555-5555-5555-5555-555555555555', 'STATUS_CHANGE', 'CONFIRMED', 'ESCALATED', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', '{"reason": "Superficie > 4ha, proximite zone protegee"}');

-- Permis miniers
INSERT INTO mining_permits (id, permit_number, orpailleur_id, orpailleur_name, zone_geometry, status, issued_at, expires_at, issuing_authority) VALUES
    (
        'cccc1111-1111-1111-1111-111111111111',
        'PM-BAG-2024-0001',
        'ORP-CI-2024-0042',
        'Cooperative Aurifere de Boundiali',
        ST_GeomFromText('POLYGON((-6.440 9.830, -6.430 9.830, -6.430 9.820, -6.440 9.820, -6.440 9.830))', 4326),
        'ACTIVE',
        '2024-01-15 00:00:00+00',
        '2025-01-15 00:00:00+00',
        'Direction Generale des Mines et de la Geologie'
    ),
    (
        'cccc2222-2222-2222-2222-222222222222',
        'PM-BAG-2024-0002',
        'ORP-CI-2024-0078',
        'Association Miniere Tengrela Nord',
        ST_GeomFromText('POLYGON((-6.520 9.700, -6.510 9.700, -6.510 9.690, -6.520 9.690, -6.520 9.700))', 4326),
        'SUSPENDED',
        '2024-03-01 00:00:00+00',
        '2025-03-01 00:00:00+00',
        'Direction Generale des Mines et de la Geologie'
    )
ON CONFLICT (id) DO NOTHING;

-- =============================================================
-- Capteurs AquaGuard - 3 cours d'eau de la region Bagoue
-- 4 mesures par capteur : turbidity, mercury, ph, dissolved_oxygen
-- =============================================================

-- Capteur 1 : Riviere Comoe (AQ-COM-001)
INSERT INTO sensor_readings (time, sensor_id, parameter, value, unit, lat, lon, battery_level, signal_rssi, is_anomaly) VALUES
    ('2026-02-24 06:00:00+00', 'AQ-COM-001', 'turbidity', 145.2000, 'NTU', 9.4520, -5.9830, 87.50, -65, false),
    ('2026-02-24 06:00:00+00', 'AQ-COM-001', 'mercury', 0.0023, 'mg/L', 9.4520, -5.9830, 87.50, -65, true),
    ('2026-02-24 06:00:00+00', 'AQ-COM-001', 'ph', 6.8000, 'pH', 9.4520, -5.9830, 87.50, -65, false),
    ('2026-02-24 06:00:00+00', 'AQ-COM-001', 'dissolved_oxygen', 5.2000, 'mg/L', 9.4520, -5.9830, 87.50, -65, false);

-- Capteur 2 : Riviere Bandama (AQ-BAN-001)
INSERT INTO sensor_readings (time, sensor_id, parameter, value, unit, lat, lon, battery_level, signal_rssi, is_anomaly) VALUES
    ('2026-02-24 06:15:00+00', 'AQ-BAN-001', 'turbidity', 210.8000, 'NTU', 9.3100, -5.8450, 72.30, -72, true),
    ('2026-02-24 06:15:00+00', 'AQ-BAN-001', 'mercury', 0.0051, 'mg/L', 9.3100, -5.8450, 72.30, -72, true),
    ('2026-02-24 06:15:00+00', 'AQ-BAN-001', 'ph', 5.9000, 'pH', 9.3100, -5.8450, 72.30, -72, true),
    ('2026-02-24 06:15:00+00', 'AQ-BAN-001', 'dissolved_oxygen', 4.1000, 'mg/L', 9.3100, -5.8450, 72.30, -72, true);

-- Capteur 3 : Riviere Sassandra (AQ-SAS-001)
INSERT INTO sensor_readings (time, sensor_id, parameter, value, unit, lat, lon, battery_level, signal_rssi, is_anomaly) VALUES
    ('2026-02-24 06:30:00+00', 'AQ-SAS-001', 'turbidity', 78.5000, 'NTU', 9.1250, -6.1200, 93.10, -58, false),
    ('2026-02-24 06:30:00+00', 'AQ-SAS-001', 'mercury', 0.0008, 'mg/L', 9.1250, -6.1200, 93.10, -58, false),
    ('2026-02-24 06:30:00+00', 'AQ-SAS-001', 'ph', 7.2000, 'pH', 9.1250, -6.1200, 93.10, -58, false),
    ('2026-02-24 06:30:00+00', 'AQ-SAS-001', 'dissolved_oxygen', 6.8000, 'mg/L', 9.1250, -6.1200, 93.10, -58, false);

-- =============================================================
-- Scores de risque H3 pour 5 cellules de la region
-- =============================================================

INSERT INTO h3_risk_scores (h3_index, resolution, risk_score, site_count, alert_count, water_risk, deforestation_risk, computed_at, metadata) VALUES
    ('871f24a5fffffff', 7, 0.890, 1, 2, 0.750, 0.820, '2026-02-24 00:00:00+00', '{"source": "auto-compute", "model_version": "v1.2"}'),
    ('871f24a6fffffff', 7, 0.650, 1, 0, 0.300, 0.450, '2026-02-24 00:00:00+00', '{"source": "auto-compute", "model_version": "v1.2"}'),
    ('871f24b0fffffff', 7, 0.920, 1, 1, 0.880, 0.950, '2026-02-24 00:00:00+00', '{"source": "auto-compute", "model_version": "v1.2"}'),
    ('871f24a7fffffff', 7, 0.420, 1, 0, 0.200, 0.310, '2026-02-24 00:00:00+00', '{"source": "auto-compute", "model_version": "v1.2"}'),
    ('871f24a8fffffff', 7, 0.960, 1, 2, 0.700, 0.980, '2026-02-24 00:00:00+00', '{"source": "auto-compute", "model_version": "v1.2"}')
ON CONFLICT (h3_index, resolution) DO NOTHING;
