/* ============================================================================
   Ge O'Miner - TypeScript Type Definitions
   ============================================================================ */

/* -------------------------------------------------------------------------- */
/*  Enums                                                                      */
/* -------------------------------------------------------------------------- */

export enum SiteStatus {
  DETECTED = 'DETECTED',
  CONFIRMED = 'CONFIRMED',
  ACTIVE = 'ACTIVE',
  ESCALATED = 'ESCALATED',
  UNDER_OPERATION = 'UNDER_OPERATION',
  DISMANTLED = 'DISMANTLED',
  REHABILITATED = 'REHABILITATED',
  MONITORING = 'MONITORING',
}

export enum AlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  ANALYST = 'ANALYST',
  FIELD_AGENT = 'FIELD_AGENT',
  AUTHORITY = 'AUTHORITY',
  VIEWER = 'VIEWER',
}

export enum OperationStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  SUSPENDED = 'SUSPENDED',
}

/* -------------------------------------------------------------------------- */
/*  Mining Site                                                                */
/* -------------------------------------------------------------------------- */

export interface MiningSite {
  id: string;
  name: string;
  status: SiteStatus;
  latitude: number;
  longitude: number;
  area_hectares: number;
  detection_date: string;
  last_updated: string;
  ai_confidence_score: number;
  detection_source: string;
  region: string;
  department: string;
  commune: string;
  description?: string;
  estimated_workers?: number;
  environmental_impact_score?: number;
  thumbnail_url?: string;
  tags?: string[];
}

/* -------------------------------------------------------------------------- */
/*  GeoJSON Feature types for map                                              */
/* -------------------------------------------------------------------------- */

export interface SiteFeatureProperties {
  id: string;
  name: string;
  status: SiteStatus;
  ai_confidence_score: number;
  detection_date: string;
  area_hectares: number;
}

export interface SiteFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  properties: SiteFeatureProperties;
}

export interface SiteFeatureCollection {
  type: 'FeatureCollection';
  features: SiteFeature[];
}

/* -------------------------------------------------------------------------- */
/*  Alert                                                                      */
/* -------------------------------------------------------------------------- */

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  type: string;
  site_id?: string;
  site_name?: string;
  latitude?: number;
  longitude?: number;
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  resolved_by?: string;
  metadata?: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/*  User                                                                       */
/* -------------------------------------------------------------------------- */

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: boolean;
  organization?: string;
  phone?: string;
  avatar_url?: string;
  created_at: string;
  last_login?: string;
}

/* -------------------------------------------------------------------------- */
/*  Sensor Reading (AquaGuard)                                                 */
/* -------------------------------------------------------------------------- */

export interface SensorReading {
  id: string;
  station_id: string;
  station_name: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  ph: number;
  turbidity: number;
  dissolved_oxygen: number;
  conductivity: number;
  temperature: number;
  mercury_level?: number;
  cyanide_level?: number;
  arsenic_level?: number;
  is_anomaly: boolean;
  anomaly_score?: number;
}

/* -------------------------------------------------------------------------- */
/*  Gold Transaction (GoldTrack)                                               */
/* -------------------------------------------------------------------------- */

export interface GoldTransaction {
  id: string;
  transaction_date: string;
  origin_site_id?: string;
  origin_site_name?: string;
  destination: string;
  weight_grams: number;
  declared_value_xof: number;
  collector_name: string;
  collector_license?: string;
  is_suspicious: boolean;
  suspicion_score?: number;
  suspicion_reasons?: string[];
  verification_status: 'PENDING' | 'VERIFIED' | 'FLAGGED' | 'REJECTED';
  blockchain_hash?: string;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/*  Operation                                                                  */
/* -------------------------------------------------------------------------- */

export interface Operation {
  id: string;
  name: string;
  status: OperationStatus;
  type: string;
  site_ids: string[];
  description: string;
  start_date: string;
  end_date?: string;
  commander: string;
  team_size: number;
  authority: string;
  objectives: string[];
  results?: string;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/*  Map View State                                                             */
/* -------------------------------------------------------------------------- */

export interface MapViewState {
  center: [number, number]; // [longitude, latitude]
  zoom: number;
  bearing: number;
  pitch: number;
}

/* -------------------------------------------------------------------------- */
/*  API Response types                                                         */
/* -------------------------------------------------------------------------- */

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface DashboardStats {
  totalSites: number;
  activeAlerts: number;
  ongoingOperations: number;
  averageAiScore: number;
  sitesChange?: number;
  alertsChange?: number;
  operationsChange?: number;
  aiScoreChange?: number;
}
