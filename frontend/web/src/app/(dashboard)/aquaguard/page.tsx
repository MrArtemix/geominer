'use client';

/* ============================================
   /aquaguard - Dashboard IoT sombre
   ============================================ */

import { useRef, useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import maplibregl from 'maplibre-gl';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Droplets, AlertTriangle, Activity } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import OpsMap, { type OpsMapHandle } from '@/components/map/OpsMap';
import AquaGuardLayer from '@/components/map/AquaGuardLayer';
import type { SensorReading } from '@/types';

/* ---------- seuils ---------- */

const THRESHOLDS = {
  ph: { min: 6.5, max: 8.5 },
  turbidity: { max: 5 },
  mercury: { max: 0.001 },
};

/* ---------- helpers statut ---------- */

type WaterQualityStatus = 'normal' | 'warning' | 'critical';

function deriveStatus(r: SensorReading): WaterQualityStatus {
  if (r.is_anomaly) return 'critical';
  if (
    r.ph < THRESHOLDS.ph.min ||
    r.ph > THRESHOLDS.ph.max ||
    r.turbidity > THRESHOLDS.turbidity.max ||
    (r.mercury_level != null && r.mercury_level > THRESHOLDS.mercury.max)
  ) {
    return 'warning';
  }
  return 'normal';
}

const STATUS_COLOR: Record<WaterQualityStatus, string> = {
  normal: '#fbbf24',
  warning: '#f59e0b',
  critical: '#ef4444',
};

const STATUS_LABEL_FR: Record<WaterQualityStatus, string> = {
  normal: 'Normal',
  warning: 'Attention',
  critical: 'Critique',
};

/* ---------- types séries temporelles ---------- */

interface TimeSeriesPoint {
  timestamp: string;
  label: string;
  ph: number;
  turbidity: number;
  mercury_level: number | null;
}

/* ---------- tooltip dark ---------- */

const darkTooltipStyle = {
  backgroundColor: 'rgba(30, 41, 59, 0.95)',
  border: '1px solid rgba(148, 163, 184, 0.15)',
  borderRadius: '8px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  color: '#f1f5f9',
};

/* ---------- composant ---------- */

export default function AquaGuardPage() {
  const mapHandleRef = useRef<OpsMapHandle>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);

  const onMapReady = useCallback((map: maplibregl.Map) => {
    setMapInstance(map);
  }, []);

  const { data: sensors = [], isLoading: sensorsLoading } = useQuery<SensorReading[]>({
    queryKey: ['aquaguard', 'sensors'],
    queryFn: () => api.get('/api/aquaguard/sensors').then((r) => r.data),
  });

  const { data: timeSeries = [] } = useQuery<SensorReading[]>({
    queryKey: ['aquaguard', 'readings', selectedStation],
    queryFn: () =>
      api
        .get(`/api/aquaguard/stations/${selectedStation}/readings`)
        .then((r) => r.data),
    enabled: !!selectedStation,
    refetchInterval: 60_000,
  });

  const chartData: TimeSeriesPoint[] = useMemo(
    () =>
      timeSeries.map((r) => ({
        timestamp: r.timestamp,
        label: new Date(r.timestamp).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        ph: r.ph,
        turbidity: r.turbidity,
        mercury_level: r.mercury_level ?? null,
      })),
    [timeSeries],
  );

  const stats = useMemo(() => {
    const total = sensors.length;
    const critical = sensors.filter((s) => deriveStatus(s) === 'critical').length;
    const warning = sensors.filter((s) => deriveStatus(s) === 'warning').length;
    return { total, critical, warning, normal: total - critical - warning };
  }, [sensors]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <Droplets size={28} className="text-cyan-400" />
        <h1 className="text-2xl font-bold text-geo-400">AquaGuard - Capteurs IoT</h1>
      </div>

      {/* Stats avec glow latéral */}
      <div className="flex flex-wrap gap-3">
        <div className="glass-card flex items-center gap-3 px-5 py-3">
          <Activity size={18} className="text-geo-500" />
          <div>
            <p className="text-xs text-geo-600">Capteurs actifs</p>
            <p className="text-lg font-bold text-geo-400">{stats.total}</p>
          </div>
        </div>
        <div className="glass-card flex items-center gap-3 px-5 py-3" style={{ borderLeft: '3px solid #fbbf24' }}>
          <div>
            <p className="text-xs text-geo-600">Normal</p>
            <p className="text-lg font-bold text-gold-400">{stats.normal}</p>
          </div>
        </div>
        <div className="glass-card flex items-center gap-3 px-5 py-3" style={{ borderLeft: '3px solid #f59e0b' }}>
          <div>
            <p className="text-xs text-geo-600">Attention</p>
            <p className="text-lg font-bold text-gold-400">{stats.warning}</p>
          </div>
        </div>
        <div className="glass-card flex items-center gap-3 px-5 py-3" style={{ borderLeft: '3px solid #ef4444' }}>
          <AlertTriangle size={18} className="text-danger-400" />
          <div>
            <p className="text-xs text-geo-600">Critique</p>
            <p className="text-lg font-bold text-danger-400">{stats.critical}</p>
          </div>
        </div>
      </div>

      {/* Carte */}
      <div className="rounded-xl overflow-hidden h-80" style={{ border: '1px solid rgba(148,163,184,0.1)' }}>
        <OpsMap
          ref={mapHandleRef}
          className="w-full h-full"
          zoom={9}
          onMapReady={onMapReady}
        />
        <AquaGuardLayer map={mapInstance} sensors={sensors} visible />
      </div>

      {/* Grille capteurs */}
      <h2 className="text-lg font-semibold text-geo-400">Capteurs</h2>

      {sensorsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-card space-y-3">
              <div className="h-4 shimmer-bg rounded w-1/2" />
              <div className="h-3 shimmer-bg rounded w-3/4" />
              <div className="h-3 shimmer-bg rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sensors.map((sensor) => {
            const status = deriveStatus(sensor);
            const isSelected = selectedStation === sensor.station_id;
            return (
              <button
                key={sensor.id}
                onClick={() =>
                  setSelectedStation(isSelected ? null : sensor.station_id)
                }
                className={cn(
                  'glass-card-hover text-left transition-all',
                  isSelected && 'ring-2 ring-gold-500/50',
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-geo-400 text-sm">
                    {sensor.station_name}
                  </span>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                    style={{
                      backgroundColor: `${STATUS_COLOR[status]}20`,
                      color: STATUS_COLOR[status],
                    }}
                  >
                    {STATUS_LABEL_FR[status]}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-geo-600">pH</p>
                    <p
                      className={cn(
                        'font-semibold mono',
                        sensor.ph < THRESHOLDS.ph.min || sensor.ph > THRESHOLDS.ph.max
                          ? 'text-danger-400'
                          : 'text-geo-400',
                      )}
                    >
                      {sensor.ph.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-geo-600">Turbidité</p>
                    <p
                      className={cn(
                        'font-semibold mono',
                        sensor.turbidity > THRESHOLDS.turbidity.max
                          ? 'text-danger-400'
                          : 'text-geo-400',
                      )}
                    >
                      {sensor.turbidity.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-geo-600">Hg</p>
                    <p
                      className={cn(
                        'font-semibold mono',
                        sensor.mercury_level != null &&
                          sensor.mercury_level > THRESHOLDS.mercury.max
                          ? 'text-danger-400'
                          : 'text-geo-400',
                      )}
                    >
                      {sensor.mercury_level != null
                        ? sensor.mercury_level.toFixed(3)
                        : '--'}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Graphiques séries temporelles */}
      {selectedStation && chartData.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-geo-400">
            Historique -{' '}
            {sensors.find((s) => s.station_id === selectedStation)?.station_name ??
              selectedStation}
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="glass-card">
              <p className="text-sm font-medium text-geo-500 mb-3">pH</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} stroke="transparent" />
                  <YAxis domain={[5, 10]} tick={{ fontSize: 11, fill: '#64748b' }} width={30} stroke="transparent" />
                  <Tooltip contentStyle={darkTooltipStyle} />
                  <Line type="monotone" dataKey="ph" stroke="#06b6d4" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card">
              <p className="text-sm font-medium text-geo-500 mb-3">Turbidité (NTU)</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} stroke="transparent" />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={30} stroke="transparent" />
                  <Tooltip contentStyle={darkTooltipStyle} />
                  <Line type="monotone" dataKey="turbidity" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card">
              <p className="text-sm font-medium text-geo-500 mb-3">Mercure (mg/L)</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} stroke="transparent" />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={40} stroke="transparent" />
                  <Tooltip contentStyle={darkTooltipStyle} />
                  <Line type="monotone" dataKey="mercury_level" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
