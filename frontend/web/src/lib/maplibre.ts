import type { SiteStatus } from '@/types';

/* ==========================================================================
   MapLibre Configuration pour Ge O'Miner
   Styles de carte, constantes de vue, couleurs et utilitaires
   ========================================================================== */

/* -------------------------------------------------------------------------- */
/*  Cles et URLs de base                                                       */
/* -------------------------------------------------------------------------- */

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || '';

/* -------------------------------------------------------------------------- */
/*  Styles de carte (basemaps)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Style OSM MapLibre demo (MVP sans cle MapTiler).
 * Utilise pour le developpement local.
 */
export const DEMO_STYLE = 'https://demotiles.maplibre.org/style.json';

/**
 * Style MapTiler Streets.
 */
export function getMapStyle(): string {
  if (!MAPTILER_KEY) return DEMO_STYLE;
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;
}

/**
 * Style satellite MapTiler.
 */
export function getSatelliteStyle(): string {
  if (!MAPTILER_KEY) return DEMO_STYLE;
  return `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`;
}

/**
 * Style hybride (satellite + etiquettes).
 */
export function getHybridStyle(): string {
  if (!MAPTILER_KEY) return DEMO_STYLE;
  return `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`;
}

/**
 * Style topographique terrain.
 */
export function getTerrainStyle(): string {
  if (!MAPTILER_KEY) return DEMO_STYLE;
  return `https://api.maptiler.com/maps/topo-v2/style.json?key=${MAPTILER_KEY}`;
}

/* -------------------------------------------------------------------------- */
/*  Source DEM pour terrain 3D                                                 */
/* -------------------------------------------------------------------------- */

/**
 * URL du jeu de tuiles DEM pour le relief 3D.
 * Utilise MapTiler Terrain si la cle est disponible, sinon AWS Terrain Tiles.
 */
export function getDEMSourceUrl(): string {
  if (MAPTILER_KEY) {
    return `https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp?key=${MAPTILER_KEY}`;
  }
  // Fallback : tuiles terrain AWS (publiques)
  return 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
}

/**
 * Encoding du DEM (mapbox pour MapTiler, terrarium pour AWS).
 */
export function getDEMEncoding(): 'mapbox' | 'terrarium' {
  return MAPTILER_KEY ? 'mapbox' : 'terrarium';
}

/** Exaggeration du terrain 3D */
export const TERRAIN_EXAGGERATION = 1.5;

/* -------------------------------------------------------------------------- */
/*  Vue par defaut - Cote d'Ivoire                                             */
/* -------------------------------------------------------------------------- */

/** Centre par defaut : Cote d'Ivoire */
export const DEFAULT_CENTER: [number, number] = [-5.5, 7.5];

/** Niveau de zoom par defaut */
export const DEFAULT_ZOOM = 6.5;

/** Orientation (rotation) par defaut en degres */
export const DEFAULT_BEARING = 0;

/** Inclinaison par defaut en degres */
export const DEFAULT_PITCH = 0;

/** Pitch pour la vue 3D terrain */
export const TERRAIN_PITCH = 45;

/* -------------------------------------------------------------------------- */
/*  Couleurs des statuts de sites miniers                                      */
/* -------------------------------------------------------------------------- */

/**
 * Association statut → couleur pour les marqueurs et couches.
 * Palette miniere : or, terre, emeraude, danger.
 */
export const SITE_STATUS_COLORS: Record<SiteStatus | string, string> = {
  DETECTED: '#F0A500',          // Or - nouvellement detecte
  CONFIRMED: '#CC2200',         // Rouge-brun - confirme par analyste
  ACTIVE: '#FF0000',            // Rouge vif - site actif
  ESCALATED: '#8B0000',         // Rouge fonce - escalade aux autorites
  UNDER_OPERATION: '#FB923C',   // Orange - operation en cours
  DISMANTLED: '#1A7A4A',        // Emeraude - demantele
  REHABILITATED: '#06b6d4',     // Cyan - rehabilite
  MONITORING: '#3b82f6',        // Bleu - sous surveillance
  RECURRED: '#8B00FF',          // Violet - recidive
};

/**
 * Etiquettes francaises des statuts.
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
  RECURRED: 'Recidive',
};

/* -------------------------------------------------------------------------- */
/*  Couleurs des severites d'alertes                                           */
/* -------------------------------------------------------------------------- */

export const ALERT_SEVERITY_COLORS: Record<string, string> = {
  LOW: '#3b82f6',       // Bleu
  MEDIUM: '#f59e0b',    // Ambre
  HIGH: '#f97316',      // Orange
  CRITICAL: '#ef4444',  // Rouge
};

/* -------------------------------------------------------------------------- */
/*  Palette heatmap H3 (risk_score 0→1)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Palette vert → jaune → rouge pour la heatmap H3.
 * Chaque arret : [valeur, couleur].
 */
export const H3_RISK_PALETTE: [number, string][] = [
  [0.0, '#fbbf24'],   // Vert - risque nul
  [0.2, '#84cc16'],   // Vert-jaune
  [0.4, '#eab308'],   // Jaune
  [0.6, '#f97316'],   // Orange
  [0.8, '#ef4444'],   // Rouge
  [1.0, '#991b1b'],   // Rouge fonce
];

/* -------------------------------------------------------------------------- */
/*  Configuration des couches                                                  */
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
    id: 'alerts',
    label: 'Alertes',
    description: 'Alertes actives georeferencees',
    defaultVisible: true,
  },
  {
    id: 'heatmap',
    label: 'Risque H3',
    description: 'Heatmap hexagonale H3 de risque',
    defaultVisible: false,
  },
  {
    id: 'aquaguard',
    label: 'Capteurs AquaGuard',
    description: 'Stations de surveillance qualite eau',
    defaultVisible: false,
  },
  {
    id: 'operations',
    label: 'Operations',
    description: 'Operations de terrain en cours',
    defaultVisible: false,
  },
];

/* -------------------------------------------------------------------------- */
/*  Utilitaires                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Calcule le rayon du cercle selon la superficie du site.
 */
export function getSiteRadius(areaHectares: number): number {
  if (areaHectares < 1) return 6;
  if (areaHectares < 5) return 8;
  if (areaHectares < 20) return 10;
  if (areaHectares < 50) return 12;
  return 14;
}

/**
 * Retourne la couleur pour un score de confiance (0-1).
 */
export function getConfidenceColor(score: number): string {
  if (score >= 0.9) return '#ef4444';  // Rouge - tres haute confiance
  if (score >= 0.7) return '#f97316';  // Orange - haute confiance
  if (score >= 0.5) return '#f59e0b';  // Ambre - confiance moyenne
  return '#3b82f6';                     // Bleu - basse confiance
}

/**
 * Formate un score de confiance en pourcentage lisible.
 */
export function formatConfidence(score: number): string {
  return `${Math.round(score * 100)}%`;
}
