'use client';

/* ============================================
   GIS - Systeme d'Information Geographique
   Carte MapLibre plein ecran + panneau lateral
   Couches : Sites, Alertes, Heatmap, AquaGuard
   ============================================ */

import { useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  ChevronLeft,
  ChevronRight,
  Mountain,
  Bell,
  Hexagon,
  Droplets,
  Landmark,
  Ruler,
  Circle,
  Download,
  Eye,
  EyeOff,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import OpsMap, { type OpsMapHandle } from '@/components/map/OpsMap';
import SiteLayer from '@/components/map/SiteLayer';
import AlertLayer from '@/components/map/AlertLayer';
import HeatmapLayer from '@/components/map/HeatmapLayer';
import AquaGuardLayer from '@/components/map/AquaGuardLayer';
import type { Alert, SiteFeatureCollection, SensorReading } from '@/types';
import type { H3Cell } from '@/components/map/HeatmapLayer';
import type maplibregl from 'maplibre-gl';

/* ---------- Site status config ---------- */

const SITE_STATUS_CONFIG = [
  { status: 'DETECTED', label: 'Detecte', color: '#F0A500' },
  { status: 'CONFIRMED', label: 'Confirme', color: '#CC2200' },
  { status: 'ACTIVE', label: 'Actif', color: '#FF0000' },
  { status: 'ESCALATED', label: 'Escalade', color: '#8B0000' },
  { status: 'UNDER_OPERATION', label: 'Sous operation', color: '#FB923C' },
  { status: 'DISMANTLED', label: 'Demantele', color: '#1A7A4A' },
  { status: 'REHABILITATED', label: 'Rehabilite', color: '#06b6d4' },
  { status: 'MONITORING', label: 'Surveillance', color: '#3b82f6' },
];

/* ---------- Layer toggle config ---------- */

interface LayerConfig {
  id: string;
  label: string;
  icon: typeof Mountain;
  color: string;
}

const LAYERS: LayerConfig[] = [
  { id: 'sites', label: 'Sites miniers', icon: Mountain, color: '#fbbf24' },
  { id: 'alerts', label: 'Alertes', icon: Bell, color: '#ef4444' },
  { id: 'heatmap', label: 'Heatmap H3', icon: Hexagon, color: '#f59e0b' },
  { id: 'aquaguard', label: 'AquaGuard', icon: Droplets, color: '#06b6d4' },
  { id: 'concessions', label: 'Concessions', icon: Landmark, color: '#22c55e' },
];

/* ---------- Mock data for layers ---------- */

const MOCK_SITES_GEOJSON: SiteFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-6.42, 9.75] }, properties: { id: 's1', name: 'BG-042', status: 'ACTIVE' as any, ai_confidence_score: 0.96, detection_date: '2025-11-15', area_hectares: 12.5 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-7.10, 7.40] }, properties: { id: 's2', name: 'TK-018', status: 'ESCALATED' as any, ai_confidence_score: 0.91, detection_date: '2025-10-20', area_hectares: 8.3 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-7.40, 9.55] }, properties: { id: 's3', name: 'KB-007', status: 'CONFIRMED' as any, ai_confidence_score: 0.88, detection_date: '2025-12-01', area_hectares: 15.1 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-5.40, 7.60] }, properties: { id: 's4', name: 'HB-012', status: 'DISMANTLED' as any, ai_confidence_score: 0.85, detection_date: '2025-08-10', area_hectares: 6.7 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-6.10, 8.20] }, properties: { id: 's5', name: 'WR-003', status: 'DETECTED' as any, ai_confidence_score: 0.78, detection_date: '2026-01-15', area_hectares: 4.2 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-3.00, 9.30] }, properties: { id: 's6', name: 'BK-033', status: 'MONITORING' as any, ai_confidence_score: 0.82, detection_date: '2025-09-20', area_hectares: 9.4 } },
  ],
};

const MOCK_ALERTS: Alert[] = [
  { id: 'a1', title: 'Site actif zone protegee', description: '', severity: 'CRITICAL' as any, type: 'SITE_DETECTED', latitude: 9.78, longitude: -6.45, is_read: false, is_resolved: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'a2', title: 'Contamination eau', description: '', severity: 'HIGH' as any, type: 'WATER_QUALITY', latitude: 7.45, longitude: -7.05, is_read: false, is_resolved: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'a3', title: 'Expansion detectee', description: '', severity: 'MEDIUM' as any, type: 'STATUS_CHANGE', latitude: 8.25, longitude: -6.15, is_read: true, is_resolved: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

const MOCK_H3_DATA: H3Cell[] = [
  { h3_index: '872830828ffffff', latitude: 9.75, longitude: -6.42, risk_score: 0.92, count: 5 },
  { h3_index: '872830829ffffff', latitude: 9.60, longitude: -6.35, risk_score: 0.78, count: 3 },
  { h3_index: '87283082affffff', latitude: 7.40, longitude: -7.10, risk_score: 0.85, count: 4 },
  { h3_index: '87283082bffffff', latitude: 7.50, longitude: -6.80, risk_score: 0.65, count: 2 },
  { h3_index: '87283082cffffff', latitude: 8.20, longitude: -6.10, risk_score: 0.71, count: 3 },
  { h3_index: '87283082dffffff', latitude: 9.30, longitude: -3.00, risk_score: 0.55, count: 1 },
  { h3_index: '87283082effffff', latitude: 7.60, longitude: -5.40, risk_score: 0.48, count: 2 },
  { h3_index: '87283082fffffff', latitude: 8.50, longitude: -5.80, risk_score: 0.62, count: 3 },
];

const MOCK_SENSORS: SensorReading[] = [
  { id: 'sq1', station_id: 'aq-01', station_name: 'Bagoe-Amont', timestamp: new Date().toISOString(), latitude: 9.78, longitude: -6.45, ph: 7.1, turbidity: 12, dissolved_oxygen: 6.5, conductivity: 250, temperature: 28.5, mercury_level: 0.3, is_anomaly: false },
  { id: 'sq2', station_id: 'aq-02', station_name: 'Bagoe-Aval', timestamp: new Date().toISOString(), latitude: 9.60, longitude: -6.38, ph: 5.8, turbidity: 48, dissolved_oxygen: 3.2, conductivity: 420, temperature: 29.1, mercury_level: 2.8, is_anomaly: true, anomaly_score: 0.95 },
  { id: 'sq3', station_id: 'aq-03', station_name: 'Bandama-Nord', timestamp: new Date().toISOString(), latitude: 8.10, longitude: -5.25, ph: 6.8, turbidity: 15, dissolved_oxygen: 5.8, conductivity: 280, temperature: 27.3, mercury_level: 0.5, is_anomaly: false },
  { id: 'sq4', station_id: 'aq-04', station_name: 'Cavally', timestamp: new Date().toISOString(), latitude: 6.80, longitude: -7.50, ph: 6.2, turbidity: 35, dissolved_oxygen: 4.1, conductivity: 380, temperature: 28.8, mercury_level: 1.5, is_anomaly: true, anomaly_score: 0.72 },
];

/* ---------- Page principale ---------- */

export default function GISPage() {
  const mapRef = useRef<OpsMapHandle>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({
    sites: true,
    alerts: true,
    heatmap: false,
    aquaguard: true,
    concessions: false,
  });

  const toggleLayer = useCallback((id: string) => {
    setVisibleLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    setMapInstance(map);
  }, []);

  /* Fetch data with mock fallback */
  const { data: sitesData } = useQuery({
    queryKey: ['gis-sites'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/v1/sites/geojson');
        return res.data as SiteFeatureCollection;
      } catch {
        return MOCK_SITES_GEOJSON;
      }
    },
  });

  const { data: alertsData } = useQuery({
    queryKey: ['gis-alerts'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/v1/alerts', { params: { is_resolved: false } });
        return res.data.results as Alert[];
      } catch {
        return MOCK_ALERTS;
      }
    },
  });

  const { data: h3Data } = useQuery({
    queryKey: ['gis-h3'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/v1/sites/h3-risk');
        return res.data as H3Cell[];
      } catch {
        return MOCK_H3_DATA;
      }
    },
  });

  const { data: sensorsData } = useQuery({
    queryKey: ['gis-sensors'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/v1/sensors/latest');
        return res.data.results as SensorReading[];
      } catch {
        return MOCK_SENSORS;
      }
    },
  });

  return (
    <div className="relative flex" style={{ height: 'calc(100vh - 72px - 2rem)' }}>
      {/* Panneau lateral */}
      <AnimatePresence mode="wait">
        {panelOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="flex-shrink-0 overflow-hidden z-10"
          >
            <div
              className="h-full w-[280px] flex flex-col overflow-y-auto"
              style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(20px)',
                borderRight: '1px solid var(--border-subtle)',
              }}
            >
              {/* Header panneau */}
              <div className="px-4 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4" style={{ color: 'var(--gold)' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Couches
                  </h3>
                </div>
              </div>

              {/* Toggles couches */}
              <div className="px-4 py-3 space-y-1">
                {LAYERS.map((layer) => {
                  const Icon = layer.icon;
                  const visible = visibleLayers[layer.id];
                  return (
                    <button
                      key={layer.id}
                      onClick={() => toggleLayer(layer.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all',
                        visible
                          ? 'bg-white/[0.06]'
                          : 'hover:bg-white/[0.03] opacity-50',
                      )}
                    >
                      <Icon size={16} style={{ color: layer.color }} />
                      <span className="flex-1 text-left" style={{ color: visible ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {layer.label}
                      </span>
                      {visible ? (
                        <Eye size={14} style={{ color: 'var(--text-secondary)' }} />
                      ) : (
                        <EyeOff size={14} style={{ color: 'var(--text-muted)' }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legende statuts sites */}
              <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                  Statuts sites
                </p>
                <div className="space-y-1.5">
                  {SITE_STATUS_CONFIG.map((s) => (
                    <div key={s.status} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Outils */}
              <div className="px-4 py-3 mt-auto" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                  Outils
                </p>
                <div className="space-y-1.5">
                  <button className="btn-ghost w-full flex items-center gap-2 !justify-start !text-xs !py-2">
                    <Ruler size={14} style={{ color: 'var(--cyan)' }} />
                    Mesurer distance
                  </button>
                  <button className="btn-ghost w-full flex items-center gap-2 !justify-start !text-xs !py-2">
                    <Circle size={14} style={{ color: 'var(--violet)' }} />
                    Zone tampon
                  </button>
                  <button className="btn-ghost w-full flex items-center gap-2 !justify-start !text-xs !py-2">
                    <Download size={14} style={{ color: 'var(--gold)' }} />
                    Exporter carte
                  </button>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Bouton toggle panneau */}
      <button
        onClick={() => setPanelOpen((prev) => !prev)}
        className="absolute z-20 flex items-center justify-center w-6 h-12 rounded-r-lg transition-all"
        style={{
          left: panelOpen ? 280 : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-subtle)',
          borderLeft: panelOpen ? 'none' : undefined,
          color: 'var(--text-secondary)',
        }}
      >
        {panelOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* Carte MapLibre plein ecran */}
      <div className="flex-1 relative rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
        <OpsMap
          ref={mapRef}
          onMapReady={handleMapReady}
          className="absolute inset-0"
        />

        {/* Layers rendus sur la carte */}
        <SiteLayer
          map={mapInstance}
          data={sitesData ?? null}
          visible={visibleLayers.sites}
        />
        <AlertLayer
          map={mapInstance}
          alerts={alertsData ?? []}
          visible={visibleLayers.alerts}
        />
        <HeatmapLayer
          map={mapInstance}
          data={h3Data ?? []}
          visible={visibleLayers.heatmap}
        />
        <AquaGuardLayer
          map={mapInstance}
          sensors={sensorsData ?? []}
          visible={visibleLayers.aquaguard}
        />

        {/* Badge info coin superieur droit */}
        <div
          className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] z-10"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-muted)',
          }}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          SIG Operationnel — Temps reel
        </div>
      </div>
    </div>
  );
}
