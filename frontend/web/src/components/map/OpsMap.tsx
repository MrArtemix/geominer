'use client';

/* ==========================================================================
   OpsMap - Carte principale MapLibre GL JS
   Ge O'Miner OpsCenter - Carte operationnelle

   Fonctionnalites :
   - Basemap MapTiler OSM (demo style pour MVP)
   - Centre sur la Cote d'Ivoire [-5.5, 7.5], zoom 6.5
   - Terrain 3D : source DEM raster + hillshade (exaggeration 1.5)
   - Controles de navigation, geolocalisation, echelle
   - Changement de basemap dynamique
   ========================================================================== */

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DEMO_STYLE,
  getMapStyle,
  getSatelliteStyle,
  getHybridStyle,
  getDEMSourceUrl,
  getDEMEncoding,
  TERRAIN_EXAGGERATION,
  TERRAIN_PITCH,
} from '@/lib/maplibre';

/* ---------- Types de basemap ---------- */

export type Basemap = 'osm' | 'satellite' | 'terrain';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

/**
 * Retourne l'URL du style selon le basemap selectionne.
 * Utilise le style demo MapLibre pour le MVP (pas besoin de cle).
 */
function getBasemapStyle(basemap: Basemap): string {
  if (!MAPTILER_KEY) {
    // MVP : style demo MapLibre pour tous les basemaps
    return DEMO_STYLE;
  }
  switch (basemap) {
    case 'satellite':
      return getSatelliteStyle();
    case 'terrain':
      return getMapStyle(); // Le terrain 3D est gere par la source DEM
    default:
      return getMapStyle();
  }
}

/* ---------- Interface des props ---------- */

export interface OpsMapProps {
  /** Centre initial de la carte [longitude, latitude] */
  center?: [number, number];
  /** Niveau de zoom initial */
  zoom?: number;
  /** Classes CSS additionnelles */
  className?: string;
  /** Basemap selectionne */
  basemap?: Basemap;
  /** Terrain 3D active */
  terrain3D?: boolean;
  /** Callback quand la carte est prete */
  onMapReady?: (map: maplibregl.Map) => void;
  /** Callback sur deplacement de la carte */
  onMoveEnd?: (center: [number, number], zoom: number) => void;
}

/** Ref exposee au parent pour acceder a l'instance MapLibre */
export interface OpsMapHandle {
  getMap: () => maplibregl.Map | null;
  /** Voler vers une position avec animation fluide */
  flyTo: (center: [number, number], zoom?: number) => void;
  /** Recentrer sur la Cote d'Ivoire */
  resetView: () => void;
}

/* ---------- Composant principal ---------- */

const OpsMap = forwardRef<OpsMapHandle, OpsMapProps>(function OpsMap(
  {
    center = DEFAULT_CENTER,
    zoom = DEFAULT_ZOOM,
    className = '',
    basemap = 'osm',
    terrain3D = false,
    onMapReady,
    onMoveEnd,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  /* --- Methodes exposees via ref --- */
  const flyTo = useCallback((target: [number, number], targetZoom?: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: target,
      zoom: targetZoom ?? 12,
      duration: 2000,
      essential: true,
    });
  }, []);

  const resetView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      bearing: 0,
      pitch: 0,
      duration: 1500,
      essential: true,
    });
  }, []);

  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
    flyTo,
    resetView,
  }));

  /* --- Initialisation de la carte --- */
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getBasemapStyle(basemap),
      center,
      zoom,
      pitch: terrain3D ? TERRAIN_PITCH : 0,
      bearing: 0,
      attributionControl: false,
      maxZoom: 18,
      minZoom: 3,
    });

    /* --- Controles de navigation --- */
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      'bottom-right'
    );
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      'bottom-right'
    );
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 200, unit: 'metric' }),
      'bottom-left'
    );

    /* --- Attribution discrete --- */
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-left'
    );

    /* --- Evenement de chargement --- */
    map.on('load', () => {
      setLoaded(true);

      /* Ajout de la source DEM pour le terrain 3D et hillshade */
      if (!map.getSource('dem-source')) {
        map.addSource('dem-source', {
          type: 'raster-dem',
          tiles: [getDEMSourceUrl()],
          tileSize: 256,
          encoding: getDEMEncoding(),
        });
      }

      /* Couche hillshade pour le relief subtil (toujours presente) */
      if (!map.getLayer('hillshade-layer')) {
        map.addLayer({
          id: 'hillshade-layer',
          type: 'hillshade',
          source: 'dem-source',
          paint: {
            'hillshade-shadow-color': '#0a0a0a',
            'hillshade-highlight-color': '#ffffff',
            'hillshade-accent-color': '#333333',
            'hillshade-illumination-direction': 335,
            'hillshade-exaggeration': 0.3,
          },
        });
      }

      /* Activation du terrain 3D si demande */
      if (terrain3D) {
        map.setTerrain({
          source: 'dem-source',
          exaggeration: TERRAIN_EXAGGERATION,
        });
      }

      onMapReady?.(map);
    });

    /* --- Evenement de deplacement --- */
    if (onMoveEnd) {
      map.on('moveend', () => {
        const c = map.getCenter();
        const z = map.getZoom();
        onMoveEnd([c.lng, c.lat], z);
      });
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
    // Initialisation unique au montage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- Reaction au changement de basemap --- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.setStyle(getBasemapStyle(basemap));

    /* Re-ajouter les sources/couches apres changement de style */
    map.once('styledata', () => {
      // Remettre la source DEM
      if (!map.getSource('dem-source')) {
        map.addSource('dem-source', {
          type: 'raster-dem',
          tiles: [getDEMSourceUrl()],
          tileSize: 256,
          encoding: getDEMEncoding(),
        });
      }
      // Remettre le hillshade
      if (!map.getLayer('hillshade-layer')) {
        map.addLayer({
          id: 'hillshade-layer',
          type: 'hillshade',
          source: 'dem-source',
          paint: {
            'hillshade-shadow-color': '#0a0a0a',
            'hillshade-highlight-color': '#ffffff',
            'hillshade-accent-color': '#333333',
            'hillshade-illumination-direction': 335,
            'hillshade-exaggeration': 0.3,
          },
        });
      }
      // Remettre le terrain si actif
      if (terrain3D) {
        map.setTerrain({
          source: 'dem-source',
          exaggeration: TERRAIN_EXAGGERATION,
        });
      }
    });
  }, [basemap, loaded, terrain3D]);

  /* --- Reaction au toggle terrain 3D --- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    if (terrain3D) {
      /* Activer le terrain 3D */
      if (map.getSource('dem-source')) {
        map.setTerrain({
          source: 'dem-source',
          exaggeration: TERRAIN_EXAGGERATION,
        });
      }
      /* Incliner la camera pour un bel effet 3D */
      map.easeTo({
        pitch: TERRAIN_PITCH,
        duration: 800,
      });
    } else {
      /* Desactiver le terrain 3D */
      map.setTerrain(undefined as unknown as maplibregl.TerrainSpecification);
      map.easeTo({
        pitch: 0,
        duration: 800,
      });
    }
  }, [terrain3D, loaded]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
      style={{ minHeight: 300 }}
    />
  );
});

export default OpsMap;
