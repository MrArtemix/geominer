'use client';

/* ============================================
   /aquaguard - AquaGuard IoT sensor dashboard
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

/* ---------- thresholds ---------- */

const THRESHOLDS = {
  ph: { min: 6.5, max: 8.5 },
  turbidity: { max: 5 },
  mercury: { max: 0.001 },
};

/* ---------- status helpers ---------- */

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
  normal: '#22C55E',
  warning: '#F59E0B',
  critical: '#EF4444',
};

const STATUS_LABEL_FR: Record<WaterQualityStatus, string> = {
  normal: 'Normal',
  warning: 'Attention',
  critical: 'Critique',
};

/* ---------- types for time-series ---------- */

interface TimeSeriesPoint {
  timestamp: string;
  label: string;
  ph: number;
  turbidity: number;
  mercury_level: number | null;
}

/* ---------- component ---------- */

export default function AquaGuardPage() {
  const mapHandleRef = useRef<OpsMapHandle>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);

  const onMapReady = useCallback((map: maplibregl.Map) => {
    setMapInstance(map);
  }, []);

  /* ---------- data ---------- */

  // Latest readings per station
  const { data: sensors = [], isLoading: sensorsLoading } = useQuery<SensorReading[]>({
    queryKey: ['aquaguard', 'sensors'],
    queryFn: () => api.get('/api/aquaguard/sensors').then((r) => r.data),
  });

  // Historical readings for selected station
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

  /* ---------- summary stats ---------- */

  const stats = useMemo(() => {
    const total = sensors.length;
    const critical = sensors.filter((s) => deriveStatus(s) === 'critical').length;
    const warning = sensors.filter((s) => deriveStatus(s) === 'warning').length;
    return { total, critical, warning, normal: total - critical - warning };
  }, [sensors]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ---- header ---- */}
      <div className="flex items-center gap-3">
        <Droplets size={28} className="text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">AquaGuard - Capteurs IoT</h1>
      </div>

      {/* ---- stat pills ---- */}
      <div className="flex flex-wrap gap-3">
        <div className="card flex items-center gap-3 px-5 py-3">
          <Activity size={18} className="text-gray-400" />
          <div>
            <p className="text-xs text-gray-500">Capteurs actifs</p>
            <p className="text-lg font-bold text-gray-900">{stats.total}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 px-5 py-3 border-l-4 border-l-green-500">
          <div>
            <p className="text-xs text-gray-500">Normal</p>
            <p className="text-lg font-bold text-green-600">{stats.normal}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 px-5 py-3 border-l-4 border-l-yellow-500">
          <div>
            <p className="text-xs text-gray-500">Attention</p>
            <p className="text-lg font-bold text-yellow-600">{stats.warning}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 px-5 py-3 border-l-4 border-l-red-500">
          <AlertTriangle size={18} className="text-red-500" />
          <div>
            <p className="text-xs text-gray-500">Critique</p>
            <p className="text-lg font-bold text-red-600">{stats.critical}</p>
          </div>
        </div>
      </div>

      {/* ---- map ---- */}
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm h-80">
        <OpsMap
          ref={mapHandleRef}
          className="w-full h-full"
          zoom={9}
          onMapReady={onMapReady}
        />
        <AquaGuardLayer map={mapInstance} sensors={sensors} visible />
      </div>

      {/* ---- sensor cards grid ---- */}
      <h2 className="text-lg font-semibold text-gray-900">Capteurs</h2>

      {sensorsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card animate-pulse space-y-3">
              <div className="h-4 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
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
                  'card-hover text-left transition-all',
                  isSelected && 'ring-2 ring-primary-500 border-primary-300',
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900 text-sm">
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
                    <p className="text-gray-400">pH</p>
                    <p
                      className={cn(
                        'font-semibold',
                        sensor.ph < THRESHOLDS.ph.min || sensor.ph > THRESHOLDS.ph.max
                          ? 'text-red-600'
                          : 'text-gray-700',
                      )}
                    >
                      {sensor.ph.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Turbidite</p>
                    <p
                      className={cn(
                        'font-semibold',
                        sensor.turbidity > THRESHOLDS.turbidity.max
                          ? 'text-red-600'
                          : 'text-gray-700',
                      )}
                    >
                      {sensor.turbidity.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Hg</p>
                    <p
                      className={cn(
                        'font-semibold',
                        sensor.mercury_level != null &&
                          sensor.mercury_level > THRESHOLDS.mercury.max
                          ? 'text-red-600'
                          : 'text-gray-700',
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

      {/* ---- time-series charts ---- */}
      {selectedStation && chartData.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Historique -{' '}
            {sensors.find((s) => s.station_id === selectedStation)?.station_name ??
              selectedStation}
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* pH chart */}
            <div className="card">
              <p className="text-sm font-medium text-gray-600 mb-3">pH</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis domain={[5, 10]} tick={{ fontSize: 11 }} width={30} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="ph"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Turbidity chart */}
            <div className="card">
              <p className="text-sm font-medium text-gray-600 mb-3">Turbidite (NTU)</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={30} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="turbidity"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Mercury chart */}
            <div className="card">
              <p className="text-sm font-medium text-gray-600 mb-3">Mercure (mg/L)</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="mercury_level"
                    stroke="#EF4444"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
