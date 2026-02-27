// Types partages pour le frontend et les services Ge O'Miner

// Enums
export enum SiteStatus {
  DETECTED = "DETECTED",
  UNDER_REVIEW = "UNDER_REVIEW",
  CONFIRMED = "CONFIRMED",
  ACTIVE = "ACTIVE",
  ESCALATED = "ESCALATED",
  DISMANTLED = "DISMANTLED",
  RECURRED = "RECURRED",
}

export enum AlertSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN_MINES = "ADMIN_MINES",
  ANALYSTE_SIG = "ANALYSTE_SIG",
  AGENT_TERRAIN = "AGENT_TERRAIN",
  SUPERVISEUR_OPS = "SUPERVISEUR_OPS",
  DATA_SCIENTIST = "DATA_SCIENTIST",
  OBSERVATEUR = "OBSERVATEUR",
  AUDITEUR = "AUDITEUR",
}

// Types GeoJSON
export interface Geometry {
  type: "Polygon" | "Point" | "MultiPolygon";
  coordinates: number[][][] | number[] | number[][][][];
}

// Site minier (GeoJSON Feature)
export interface MiningSite {
  type: "Feature";
  id: string;
  geometry: Geometry;
  properties: {
    site_code: string;
    area_ha: number | null;
    h3_index_r7: string | null;
    confidence_ai: number | null;
    detected_at: string | null;
    satellite_date: string | null;
    sat_source: string | null;
    status: SiteStatus;
    blockchain_txid: string | null;
    ipfs_cid: string | null;
    region: string | null;
    department: string | null;
    sous_prefecture: string | null;
    gold_estim_ton: number | null;
    notes: string | null;
  };
}

export interface MiningSiteCollection {
  type: "FeatureCollection";
  features: MiningSite[];
  total_count: number;
}

// Alerte
export interface Alert {
  id: string;
  site_id: string | null;
  alert_type: string;
  severity: AlertSeverity;
  title: string;
  message: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string | null;
}

// Lecture capteur
export interface SensorReading {
  id: number;
  sensor_id: string;
  parameter: string;
  value: number;
  unit: string;
  timestamp: string;
  battery: number | null;
  lat: number | null;
  lon: number | null;
}

// Transaction d'or
export interface GoldTransaction {
  id: string;
  site_id: string;
  blockchain_txid: string;
  from_entity: string;
  to_entity: string;
  quantity_grams: number;
  is_legal: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// Mineur
export interface Miner {
  id: string;
  full_name: string;
  national_id: string;
  phone: string | null;
  photo_url: string | null;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED";
  training_completed: boolean;
  training_date: string | null;
  zone_polygon: Geometry | null;
  registered_by: string | null;
  created_at: string;
}

// Permis minier
export interface Permit {
  permit_number: string;
  miner_id: string;
  status: "LEGAL" | "SUSPENDED" | "EXPIRED" | "REVOKED";
  zone_polygon: Geometry | null;
  blockchain_txid: string | null;
  qr_code_url: string | null;
  issued_at: string;
  expires_at: string | null;
}

// Operation de terrain
export interface Operation {
  id: string;
  site_id: string;
  operation_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  team_members: string[];
  equipment_seized: Record<string, unknown> | null;
  arrests_count: number;
  blockchain_txid: string | null;
  notes: string | null;
}
