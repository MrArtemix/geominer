import { create } from 'zustand';
import type { MapViewState } from '@/types';

/* -------------------------------------------------------------------------- */
/*  Map Store                                                                  */
/* -------------------------------------------------------------------------- */

interface MapStore {
  // State
  viewState: MapViewState;
  activeLayers: Set<string>;
  selectedSiteId: string | null;

  // Actions
  setViewState: (viewState: Partial<MapViewState>) => void;
  toggleLayer: (layerId: string) => void;
  enableLayer: (layerId: string) => void;
  disableLayer: (layerId: string) => void;
  selectSite: (siteId: string | null) => void;
  resetView: () => void;
}

const DEFAULT_VIEW_STATE: MapViewState = {
  center: [-6.42, 9.75], // Bagoue region, Cote d'Ivoire
  zoom: 8,
  bearing: 0,
  pitch: 0,
};

const DEFAULT_LAYERS = new Set([
  'mining-sites',
  'satellite-imagery',
]);

export const useMapStore = create<MapStore>((set) => ({
  // Initial state
  viewState: { ...DEFAULT_VIEW_STATE },
  activeLayers: new Set(DEFAULT_LAYERS),
  selectedSiteId: null,

  // Actions
  setViewState: (partial) =>
    set((state) => ({
      viewState: { ...state.viewState, ...partial },
    })),

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

  selectSite: (siteId) =>
    set({ selectedSiteId: siteId }),

  resetView: () =>
    set({
      viewState: { ...DEFAULT_VIEW_STATE },
      selectedSiteId: null,
    }),
}));
