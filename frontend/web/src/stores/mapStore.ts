import { create } from 'zustand';
import type { MapViewState, MiningSite } from '@/types';

/* ============================================================================
   Ge O'Miner - Store Zustand pour la carte MapLibre
   Gestion centralisee : vue, couches, selection, fond de carte, filtres,
   terrain 3D, recherche, panel lateral
   ============================================================================ */

/* ---------- Types internes ---------- */

/** Identifiants des couches disponibles sur la carte */
export type LayerId =
  | 'mining-sites'
  | 'alerts'
  | 'heatmap'
  | 'aquaguard'
  | 'operations'
  | 'h3-hexagons'
  | 'satellite-tiles'
  | 'boundaries';

/** Types de fond de carte disponibles */
export type BasemapStyle =
  | 'satellite'
  | 'dark'
  | 'terrain'
  | 'streets';

/** Filtres rapides par statut de site */
export type StatusFilter = Set<string>;

/* ---------- Configuration des fonds de carte ---------- */

export const BASEMAP_CONFIGS: Record<
  BasemapStyle,
  { label: string; url: string; description: string }
> = {
  satellite: {
    label: 'Satellite',
    url: 'https://api.maptiler.com/maps/hybrid/style.json',
    description: 'Imagerie satellite haute resolution',
  },
  dark: {
    label: 'Sombre',
    url: 'https://api.maptiler.com/maps/dataviz-dark/style.json',
    description: 'Fond sombre pour visualisation donnees',
  },
  terrain: {
    label: 'Terrain',
    url: 'https://api.maptiler.com/maps/topo-v2/style.json',
    description: 'Relief et topographie',
  },
  streets: {
    label: 'Rues',
    url: 'https://api.maptiler.com/maps/streets-v2-dark/style.json',
    description: 'Routes et infrastructure',
  },
};

/* ---------- Couches disponibles avec metadata ---------- */

export const AVAILABLE_LAYERS: {
  id: LayerId;
  label: string;
  color: string;
  description: string;
}[] = [
  { id: 'mining-sites', label: 'Sites miniers', color: '#fbbf24', description: 'Sites detectes et confirmes' },
  { id: 'alerts', label: 'Alertes', color: '#ef4444', description: 'Alertes actives geolocalisees' },
  { id: 'heatmap', label: 'Carte de chaleur', color: '#f59e0b', description: 'Densite des detections' },
  { id: 'aquaguard', label: 'Stations AquaGuard', color: '#06b6d4', description: 'Capteurs qualite eau' },
  { id: 'operations', label: 'Operations en cours', color: '#fbbf24', description: 'Zones d\'intervention' },
  { id: 'h3-hexagons', label: 'Grille H3', color: '#8b5cf6', description: 'Index spatial hexagonal' },
  { id: 'satellite-tiles', label: 'Tuiles satellite', color: '#64748b', description: 'Imagerie recente' },
  { id: 'boundaries', label: 'Limites admin.', color: '#94a3b8', description: 'Regions et departements' },
];

/* ---------- Interface du store ---------- */

interface MapStore {
  /* --- Etat de la vue --- */
  viewState: MapViewState;
  activeLayers: Set<string>;
  selectedSiteId: string | null;
  selectedSiteData: MiningSite | null;
  basemap: BasemapStyle;

  /* --- Terrain 3D --- */
  terrain3DEnabled: boolean;

  /* --- Panel lateral --- */
  sidePanelOpen: boolean;

  /* --- Recherche --- */
  searchQuery: string;
  searchResults: MiningSite[];

  /* --- Filtres statut --- */
  statusFilters: StatusFilter;

  /* --- Outils --- */
  isDrawing: boolean;
  measureMode: boolean;

  /* --- Actions vue --- */
  setViewState: (viewState: Partial<MapViewState>) => void;
  resetView: () => void;
  flyTo: (center: [number, number], zoom?: number) => void;

  /* --- Actions couches --- */
  toggleLayer: (layerId: string) => void;
  enableLayer: (layerId: string) => void;
  disableLayer: (layerId: string) => void;
  isLayerActive: (layerId: string) => boolean;

  /* --- Actions selection --- */
  selectSite: (siteId: string | null, siteData?: MiningSite | null) => void;
  clearSelection: () => void;

  /* --- Actions fond de carte --- */
  setBasemap: (basemap: BasemapStyle) => void;

  /* --- Actions terrain 3D --- */
  toggleTerrain3D: () => void;

  /* --- Actions panel lateral --- */
  setSidePanelOpen: (open: boolean) => void;
  toggleSidePanel: () => void;

  /* --- Actions recherche --- */
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: MiningSite[]) => void;
  clearSearch: () => void;

  /* --- Actions filtres --- */
  toggleStatusFilter: (status: string) => void;
  setStatusFilters: (filters: StatusFilter) => void;
  clearStatusFilters: () => void;

  /* --- Actions outils --- */
  setDrawing: (drawing: boolean) => void;
  setMeasureMode: (measure: boolean) => void;
}

/* ---------- Valeurs par defaut ---------- */

/** Centre par defaut : Cote d'Ivoire (vue nationale) */
const DEFAULT_VIEW_STATE: MapViewState = {
  center: [-5.5, 7.5],
  zoom: 6.5,
  bearing: 0,
  pitch: 0,
};

/** Couches actives par defaut */
const DEFAULT_LAYERS = new Set<string>([
  'mining-sites',
  'alerts',
]);

/** Tous les statuts actifs par defaut (aucun filtrage) */
const ALL_STATUSES = new Set<string>([
  'DETECTED',
  'CONFIRMED',
  'ACTIVE',
  'ESCALATED',
  'UNDER_OPERATION',
  'DISMANTLED',
  'REHABILITATED',
  'MONITORING',
]);

/* ---------- Creation du store ---------- */

export const useMapStore = create<MapStore>((set, get) => ({
  /* --- Etat initial --- */
  viewState: { ...DEFAULT_VIEW_STATE },
  activeLayers: new Set(DEFAULT_LAYERS),
  selectedSiteId: null,
  selectedSiteData: null,
  basemap: 'dark',
  terrain3DEnabled: false,
  sidePanelOpen: false,
  searchQuery: '',
  searchResults: [],
  statusFilters: new Set(ALL_STATUSES),
  isDrawing: false,
  measureMode: false,

  /* --- Actions vue --- */

  setViewState: (partial) =>
    set((state) => ({
      viewState: { ...state.viewState, ...partial },
    })),

  resetView: () =>
    set({
      viewState: { ...DEFAULT_VIEW_STATE },
      selectedSiteId: null,
      selectedSiteData: null,
      sidePanelOpen: false,
    }),

  flyTo: (center, zoom) =>
    set((state) => ({
      viewState: {
        ...state.viewState,
        center,
        zoom: zoom ?? state.viewState.zoom,
      },
    })),

  /* --- Actions couches --- */

  toggleLayer: (layerId) =>
    set((state) => {
      const newLayers = new Set(state.activeLayers);
      if (newLayers.has(layerId)) {
        newLayers.delete(layerId);
      } else {
        newLayers.add(layerId);
      }
      return { activeLayers: newLayers };
    }),

  enableLayer: (layerId) =>
    set((state) => {
      const newLayers = new Set(state.activeLayers);
      newLayers.add(layerId);
      return { activeLayers: newLayers };
    }),

  disableLayer: (layerId) =>
    set((state) => {
      const newLayers = new Set(state.activeLayers);
      newLayers.delete(layerId);
      return { activeLayers: newLayers };
    }),

  isLayerActive: (layerId) => {
    return get().activeLayers.has(layerId);
  },

  /* --- Actions selection --- */

  selectSite: (siteId, siteData = null) =>
    set({
      selectedSiteId: siteId,
      selectedSiteData: siteData ?? null,
      sidePanelOpen: siteId !== null,
    }),

  clearSelection: () =>
    set({
      selectedSiteId: null,
      selectedSiteData: null,
      sidePanelOpen: false,
    }),

  /* --- Actions fond de carte --- */

  setBasemap: (basemap) =>
    set({ basemap }),

  /* --- Actions terrain 3D --- */

  toggleTerrain3D: () =>
    set((state) => ({
      terrain3DEnabled: !state.terrain3DEnabled,
      viewState: {
        ...state.viewState,
        pitch: state.terrain3DEnabled ? 0 : 45,
      },
    })),

  /* --- Actions panel lateral --- */

  setSidePanelOpen: (open) => set({ sidePanelOpen: open }),

  toggleSidePanel: () =>
    set((state) => ({ sidePanelOpen: !state.sidePanelOpen })),

  /* --- Actions recherche --- */

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  clearSearch: () => set({ searchQuery: '', searchResults: [] }),

  /* --- Actions filtres --- */

  toggleStatusFilter: (status) =>
    set((state) => {
      const newFilters = new Set(state.statusFilters);
      if (newFilters.has(status)) {
        newFilters.delete(status);
      } else {
        newFilters.add(status);
      }
      return { statusFilters: newFilters };
    }),

  setStatusFilters: (filters) => set({ statusFilters: filters }),

  clearStatusFilters: () =>
    set({ statusFilters: new Set(ALL_STATUSES) }),

  /* --- Actions outils --- */

  setDrawing: (drawing) =>
    set({ isDrawing: drawing, measureMode: false }),

  setMeasureMode: (measure) =>
    set({ measureMode: measure, isDrawing: false }),
}));
