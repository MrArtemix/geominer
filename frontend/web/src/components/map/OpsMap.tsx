'use client';

/* ============================================
   OpsMap - Main MapLibre GL JS map component
   ============================================ */

import {
  useRef,
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/* ---------- helpers ---------- */

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

export type Basemap = 'streets' | 'satellite' | 'terrain';

const BASEMAP_STYLES: Record<Basemap, string> = {
  streets: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
  satellite: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
  terrain: `https://api.maptiler.com/maps/topo-v2/style.json?key=${MAPTILER_KEY}`,
};

/* ---------- types ---------- */

export interface OpsMapProps {
  center?: [number, number];
  zoom?: number;
  className?: string;
  basemap?: Basemap;
  /** Called once the map has finished loading. */
  onMapReady?: (map: maplibregl.Map) => void;
}

export interface OpsMapHandle {
  getMap: () => maplibregl.Map | null;
}

/* ---------- component ---------- */

const OpsMap = forwardRef<OpsMapHandle, OpsMapProps>(function OpsMap(
  {
    center = [-6.42, 9.75],
    zoom = 8,
    className = '',
    basemap = 'streets',
    onMapReady,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Expose map instance to parent via ref
  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
  }));

  /* --- initialise map --- */
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLES[basemap],
      center,
      zoom,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      'bottom-right'
    );
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 200 }), 'bottom-left');

    map.on('load', () => {
      setLoaded(true);
      onMapReady?.(map);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
    // Only run on mount/unmount -- basemap changes handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- react to basemap change --- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.setStyle(BASEMAP_STYLES[basemap]);
  }, [basemap, loaded]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
      style={{ minHeight: 300 }}
    />
  );
});

export default OpsMap;
