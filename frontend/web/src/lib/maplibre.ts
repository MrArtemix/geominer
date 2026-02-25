import type { SiteStatus } from '@/types';

/* ============================================================================
   MapLibre Configuration for Ge O'Miner
   ============================================================================ */

/* -------------------------------------------------------------------------- */
/*  Map Style                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Default map style URL using MapTiler Streets.
 * Requires NEXT_PUBLIC_MAPTILER_KEY to be set.
 */
export function getMapStyle(): string {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY || '';
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`;
}

/**
 * Satellite imagery style for overlay.
 */
export function getSatelliteStyle(): string {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY || '';
  return `https://api.maptiler.com/maps/satellite/style.json?key=${key}`;
}

/**
 * Hybrid style (satellite + labels).
 */
export function getHybridStyle(): string {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY || '';
  return `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`;
}

/* -------------------------------------------------------------------------- */
/*  Default View                                                               */
/* -------------------------------------------------------------------------- */

/** Default map center: Bagoue region, Cote d'Ivoire */
export const DEFAULT_CENTER: [number, number] = [-6.42, 9.75];

/** Default zoom level */
export const DEFAULT_ZOOM = 8;

/** Default bearing (rotation) in degrees */
export const DEFAULT_BEARING = 0;

/** Default pitch (tilt) in degrees */
export const DEFAULT_PITCH = 0;

/* -------------------------------------------------------------------------- */
/*  Site Status Colors                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Color mapping for mining site statuses.
 * Used for map markers, circles, and legend.
 */
export const SITE_STATUS_COLORS: Record<SiteStatus | string, string> = {
  DETECTED: '#facc15',       // Yellow - newly detected
  CONFIRMED: '#fb923c',      // Orange - confirmed by analyst
  ACTIVE: '#ef4444',         // Red - currently active
  ESCALATED: '#991b1b',      // Dark red - escalated to authorities
  UNDER_OPERATION: '#7c3aed', // Purple - under law enforcement operation
  DISMANTLED: '#22c55e',     // Green - successfully dismantled
  REHABILITATED: '#06b6d4',  // Cyan - site rehabilitated
  MONITORING: '#3b82f6',     // Blue - under monitoring
};

/**
 * French labels for site statuses.
 */
export const SITE_STATUS_LABELS: Record<SiteStatus | string, string> = {
  DETECTED: 'Detecte',
  CONFIRMED: 'Confirme',
  ACTIVE: 'Actif',
  ESCALATED: 'Escalade',
  UNDER_OPERATION: 'En operation',
  DISMANTLED: 'Demantele',
  REHABILITATED: 'Rehabilite',
  MONITORING: 'Sous surveillance',
};

/* -------------------------------------------------------------------------- */
/*  Alert Severity Colors                                                      */
/* -------------------------------------------------------------------------- */

export const ALERT_SEVERITY_COLORS: Record<string, string> = {
  LOW: '#3b82f6',       // Blue
  MEDIUM: '#f59e0b',    // Amber
  HIGH: '#f97316',      // Orange
  CRITICAL: '#ef4444',  // Red
};

/* -------------------------------------------------------------------------- */
/*  Layer Definitions                                                          */
/* -------------------------------------------------------------------------- */

export interface MapLayerConfig {
  id: string;
  label: string;
  description: string;
  defaultVisible: boolean;
}

export const MAP_LAYERS: MapLayerConfig[] = [
  {
    id: 'mining-sites',
    label: 'Sites miniers',
    description: 'Sites miniers artisanaux detectes',
    defaultVisible: true,
  },
  {
    id: 'satellite-imagery',
    label: 'Imagerie satellite',
    description: 'Couche satellite haute resolution',
    defaultVisible: true,
  },
  {
    id: 'water-stations',
    label: 'Stations AquaGuard',
    description: "Stations de surveillance de la qualite de l'eau",
    defaultVisible: false,
  },
  {
    id: 'gold-routes',
    label: 'Routes GoldTrack',
    description: "Circuits de commercialisation de l'or",
    defaultVisible: false,
  },
  {
    id: 'protected-areas',
    label: 'Zones protegees',
    description: 'Forets classees et zones protegees',
    defaultVisible: false,
  },
  {
    id: 'admin-boundaries',
    label: 'Limites administratives',
    description: 'Departements et sous-prefectures',
    defaultVisible: false,
  },
  {
    id: 'ndvi-overlay',
    label: 'NDVI (Vegetation)',
    description: 'Indice de vegetation par difference normalisee',
    defaultVisible: false,
  },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Get the circle radius for a site based on its area.
 */
export function getSiteRadius(areaHectares: number): number {
  if (areaHectares < 1) return 6;
  if (areaHectares < 5) return 8;
  if (areaHectares < 20) return 10;
  if (areaHectares < 50) return 12;
  return 14;
}

/**
 * Get the color for a confidence score (0-1).
 */
export function getConfidenceColor(score: number): string {
  if (score >= 0.9) return '#ef4444';  // Red - very high confidence
  if (score >= 0.7) return '#f97316';  // Orange - high confidence
  if (score >= 0.5) return '#f59e0b';  // Amber - medium confidence
  return '#3b82f6';                     // Blue - low confidence
}
