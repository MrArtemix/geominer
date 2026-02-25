'use client';

/* ============================================
   /map - Full-page operations map
   ============================================ */

import { useRef, useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import maplibregl from 'maplibre-gl';
import api from '@/lib/api';
import { useMapStore } from '@/stores/mapStore';
import { useAlertStore } from '@/stores/alertStore';
import OpsMap, { type OpsMapHandle, type Basemap } from '@/components/map/OpsMap';
import SiteLayer from '@/components/map/SiteLayer';
import AlertLayer from '@/components/map/AlertLayer';
import HeatmapLayer, { type H3Cell } from '@/components/map/HeatmapLayer';
import AquaGuardLayer from '@/components/map/AquaGuardLayer';
import MapControls from '@/components/map/MapControls';
import type { SiteFeatureCollection, Alert, SensorReading } from '@/types';

export default function MapPage() {
  const mapHandleRef = useRef<OpsMapHandle>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [basemap, setBasemap] = useState<Basemap>('streets');

  const activeLayers = useMapStore((s) => s.activeLayers);
  const storeAlerts = useAlertStore((s) => s.alerts);

  const onMapReady = useCallback((map: maplibregl.Map) => {
    setMapInstance(map);
  }, []);

  /* ---------- data fetching ---------- */

  const { data: sitesGeoJSON } = useQuery<SiteFeatureCollection>({
    queryKey: ['sites', 'geojson'],
    queryFn: () => api.get('/api/sites?format=geojson').then((r) => r.data),
  });

  const { data: alertsData } = useQuery<Alert[]>({
    queryKey: ['alerts'],
    queryFn: () => api.get('/api/alerts').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const { data: heatmapData } = useQuery<H3Cell[]>({
    queryKey: ['heatmap'],
    queryFn: () => api.get('/api/analytics/heatmap').then((r) => r.data),
    enabled: activeLayers.has('heatmap'),
  });

  const { data: sensorsData } = useQuery<SensorReading[]>({
    queryKey: ['aquaguard', 'sensors'],
    queryFn: () => api.get('/api/aquaguard/sensors').then((r) => r.data),
    enabled: activeLayers.has('aquaguard'),
  });

  // Merge store alerts with fetched alerts (de-duplicate by id)
  const mergedAlerts = (() => {
    const map = new Map<string, Alert>();
    (alertsData ?? []).forEach((a) => map.set(a.id, a));
    storeAlerts.forEach((a) => map.set(a.id, a));
    return Array.from(map.values());
  })();

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 64px)' }}>
      <OpsMap
        ref={mapHandleRef}
        basemap={basemap}
        className="absolute inset-0"
        onMapReady={onMapReady}
      />

      {/* Imperative layers -- they render nothing to DOM */}
      <SiteLayer
        map={mapInstance}
        data={sitesGeoJSON ?? null}
        visible={activeLayers.has('mining-sites')}
      />
      <AlertLayer
        map={mapInstance}
        alerts={mergedAlerts}
        visible={activeLayers.has('alerts')}
      />
      <HeatmapLayer
        map={mapInstance}
        data={heatmapData ?? []}
        visible={activeLayers.has('heatmap')}
      />
      <AquaGuardLayer
        map={mapInstance}
        sensors={sensorsData ?? []}
        visible={activeLayers.has('aquaguard')}
      />

      {/* Floating controls */}
      <MapControls basemap={basemap} onBasemapChange={setBasemap} />
    </div>
  );
}
