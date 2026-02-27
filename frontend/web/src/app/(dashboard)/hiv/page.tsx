'use client';

/* ============================================
   HIV - Hydrologie & Impact sur la Vie
   Zone 1 : 4 StatCards
   Zone 2 : Mini carte MapLibre stations
   Zone 3 : LineChart qualite eau 24h
   Zone 4 : DataTable anomalies
   Zone 5 : BarChart contamination par region
   ============================================ */

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Droplets,
  AlertTriangle,
  Gauge,
  MapPin,
  Radio,
  Activity,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import api from '@/lib/api';
import StatCard from '@/components/ui/StatCard';
import DataTable, { type ColumnDef } from '@/components/ui/DataTable';

/* ---------- Animation stagger ---------- */

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

/* ---------- Tooltip custom glassmorphism ---------- */

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--glass-border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}
    >
      <p className="font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>{label}</p>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center gap-2 text-xs">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: entry.color }} />
          <span style={{ color: 'var(--text-muted)' }}>{entry.name} :</span>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Types ---------- */

interface WaterStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: 'normal' | 'warning' | 'critical';
}

interface Anomaly {
  id: string;
  station: string;
  region: string;
  parameter: string;
  value: number;
  threshold: number;
  date: string;
  severity: 'warning' | 'critical';
}

/* ---------- Station colors ---------- */

const STATION_COLORS: Record<string, string> = {
  normal: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
};

/* ---------- Mock data ---------- */

const MOCK_STATIONS: WaterStation[] = [
  { id: 'aq-01', name: 'Station Bagoe-Amont', latitude: 9.78, longitude: -6.45, status: 'normal' },
  { id: 'aq-02', name: 'Station Bagoe-Aval', latitude: 9.60, longitude: -6.38, status: 'critical' },
  { id: 'aq-03', name: 'Station Bandama-Nord', latitude: 8.10, longitude: -5.25, status: 'normal' },
  { id: 'aq-04', name: 'Station Bandama-Sud', latitude: 7.50, longitude: -5.10, status: 'warning' },
  { id: 'aq-05', name: 'Station Cavally', latitude: 6.80, longitude: -7.50, status: 'normal' },
  { id: 'aq-06', name: 'Station Sassandra', latitude: 6.90, longitude: -6.20, status: 'warning' },
  { id: 'aq-07', name: 'Station Comoe-Nord', latitude: 9.20, longitude: -3.80, status: 'critical' },
  { id: 'aq-08', name: 'Station Comoe-Sud', latitude: 7.20, longitude: -3.60, status: 'normal' },
  { id: 'aq-09', name: 'Station Bia', latitude: 6.50, longitude: -3.20, status: 'normal' },
  { id: 'aq-10', name: 'Station Leraba', latitude: 10.10, longitude: -5.20, status: 'warning' },
  { id: 'aq-11', name: 'Station Marahoue', latitude: 7.00, longitude: -5.80, status: 'normal' },
  { id: 'aq-12', name: 'Station N\'zi', latitude: 7.80, longitude: -4.50, status: 'normal' },
];

const WATER_QUALITY_24H = Array.from({ length: 24 }, (_, i) => ({
  heure: `${String(i).padStart(2, '0')}h`,
  ph: +(6.2 + Math.random() * 1.8).toFixed(1),
  turbidite: +(5 + Math.random() * 45).toFixed(1),
  mercure: +(0.1 + Math.random() * 2.5).toFixed(2),
}));

const MOCK_ANOMALIES: Anomaly[] = [
  { id: 'a1', station: 'Station Bagoe-Aval', region: 'Bagoue', parameter: 'Mercure', value: 2.8, threshold: 1.0, date: new Date(Date.now() - 1_800_000).toISOString(), severity: 'critical' },
  { id: 'a2', station: 'Station Comoe-Nord', region: 'Bounkani', parameter: 'Turbidite', value: 52, threshold: 30, date: new Date(Date.now() - 3_600_000).toISOString(), severity: 'critical' },
  { id: 'a3', station: 'Station Bandama-Sud', region: 'Hambol', parameter: 'pH', value: 5.2, threshold: 6.0, date: new Date(Date.now() - 5_400_000).toISOString(), severity: 'warning' },
  { id: 'a4', station: 'Station Sassandra', region: 'Worodougou', parameter: 'Mercure', value: 1.5, threshold: 1.0, date: new Date(Date.now() - 7_200_000).toISOString(), severity: 'warning' },
  { id: 'a5', station: 'Station Leraba', region: 'Folon', parameter: 'Turbidite', value: 38, threshold: 30, date: new Date(Date.now() - 14_400_000).toISOString(), severity: 'warning' },
  { id: 'a6', station: 'Station Bagoe-Aval', region: 'Bagoue', parameter: 'Cyanure', value: 0.35, threshold: 0.2, date: new Date(Date.now() - 21_600_000).toISOString(), severity: 'critical' },
];

const CONTAMINATION_DATA = [
  { region: 'Bagoue', mercure: 2.8, turbidite: 45 },
  { region: 'Bounkani', mercure: 1.2, turbidite: 52 },
  { region: 'Tonkpi', mercure: 1.8, turbidite: 35 },
  { region: 'Kabadougou', mercure: 1.5, turbidite: 28 },
  { region: 'Folon', mercure: 0.9, turbidite: 38 },
  { region: 'Hambol', mercure: 0.6, turbidite: 22 },
  { region: 'Worodougou', mercure: 1.1, turbidite: 30 },
  { region: 'Tchologo', mercure: 0.4, turbidite: 18 },
];

/* ---------- Anomaly columns ---------- */

const SEVERITY_CLASS: Record<string, string> = {
  warning: 'badge-warning',
  critical: 'badge-critical',
};

const anomalyColumns: ColumnDef<Anomaly>[] = [
  {
    key: 'station', header: 'Station', sortable: true,
    render: (row) => <span className="font-semibold text-geo-300">{row.station}</span>,
  },
  { key: 'region', header: 'Region', sortable: true },
  {
    key: 'parameter', header: 'Parametre',
    render: (row) => (
      <span className="text-geo-400 font-mono text-xs">{row.parameter}</span>
    ),
  },
  {
    key: 'value', header: 'Valeur', sortable: true,
    render: (row) => (
      <span className="font-mono text-xs font-bold text-red-400">{row.value}</span>
    ),
  },
  {
    key: 'threshold', header: 'Seuil',
    render: (row) => (
      <span className="font-mono text-xs text-geo-500">{row.threshold}</span>
    ),
  },
  {
    key: 'date', header: 'Date', sortable: true,
    render: (row) => (
      <span className="text-geo-500 text-xs">
        {formatDistanceToNow(new Date(row.date), { addSuffix: true, locale: fr })}
      </span>
    ),
  },
  {
    key: 'severity', header: 'Severite',
    render: (row) => (
      <span className={SEVERITY_CLASS[row.severity] || 'badge-low'}>
        {row.severity === 'critical' ? 'Critique' : 'Alerte'}
      </span>
    ),
  },
];

/* ---------- Mini carte stations ---------- */

function StationMiniMap({ stations }: { stations: WaterStation[] }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';
    const hasValidKey = MAPTILER_KEY && !MAPTILER_KEY.includes('your_');

    const style: string | maplibregl.StyleSpecification = hasValidKey
      ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`
      : {
          version: 8,
          sources: {
            'osm-tiles': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '&copy; OpenStreetMap',
            },
          },
          layers: [
            { id: 'osm', type: 'raster', source: 'osm-tiles' },
            { id: 'darken', type: 'background', paint: { 'background-color': 'rgba(10, 22, 40, 0.65)' } },
          ],
        };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: [-5.55, 7.54],
      zoom: 5.8,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      stations.forEach((st) => {
        const el = document.createElement('div');
        const color = STATION_COLORS[st.status];
        el.innerHTML = `<svg width="20" height="24" viewBox="0 0 20 24" fill="none">
          <path d="M10 0C4.5 0 0 4.5 0 10c0 7.5 10 14 10 14s10-6.5 10-14C20 4.5 15.5 0 10 0z" fill="${color}" fill-opacity="0.8"/>
          <circle cx="10" cy="9" r="4" fill="white" fill-opacity="0.9"/>
        </svg>`;
        el.style.cursor = 'pointer';

        const popup = new maplibregl.Popup({ offset: 12, closeButton: false })
          .setHTML(`
            <div style="background:rgba(15,23,42,0.95);padding:8px 12px;border-radius:8px;border:1px solid rgba(148,163,184,0.15);min-width:130px;">
              <p style="color:#f1f5f9;font-weight:600;font-size:12px;margin:0 0 2px">${st.name}</p>
              <p style="color:${color};font-size:11px;margin:0;text-transform:capitalize">${st.status === 'normal' ? 'Normal' : st.status === 'warning' ? 'Alerte' : 'Critique'}</p>
            </div>
          `);

        new maplibregl.Marker({ element: el })
          .setLngLat([st.longitude, st.latitude])
          .setPopup(popup)
          .addTo(map);
      });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [stations]);

  return <div ref={mapContainerRef} className="absolute inset-0" />;
}

/* ---------- Page principale ---------- */

export default function HIVPage() {
  const { data: stations = MOCK_STATIONS, isLoading } = useQuery({
    queryKey: ['hiv-stations'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/v1/sensors/stations');
        return res.data.results;
      } catch {
        return MOCK_STATIONS;
      }
    },
  });

  const stationsActives = stations.length;
  const alertesEau = stations.filter((s: WaterStation) => s.status !== 'normal').length;
  const zonesRisque = stations.filter((s: WaterStation) => s.status === 'critical').length;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Titre */}
      <motion.div variants={item}>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          HIV — Hydrologie & Impact
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Surveillance de la qualite des eaux et impact environnemental
        </p>
      </motion.div>

      {/* Zone 1 : StatCards */}
      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Radio} title="Stations actives" value={stationsActives} delta={8.3} variant="info" loading={isLoading} />
        <StatCard icon={AlertTriangle} title="Alertes eau" value={alertesEau} delta={-12.0} variant="danger" loading={isLoading} />
        <StatCard icon={Gauge} title="Indice qualite" value={62} suffix="/100" delta={-3.2} variant="warning" loading={isLoading} />
        <StatCard icon={MapPin} title="Zones a risque" value={zonesRisque} variant="danger" loading={isLoading} />
      </motion.div>

      {/* Zone 2 : Mini carte stations */}
      <motion.div variants={item}>
        <div className="glass-card !p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4" style={{ color: 'var(--cyan)' }} />
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Reseau de stations AquaGuard
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              {Object.entries(STATION_COLORS).map(([s, c]) => (
                <span key={s} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                  <span style={{ color: 'var(--text-muted)' }} className="capitalize">
                    {s === 'normal' ? 'Normal' : s === 'warning' ? 'Alerte' : 'Critique'}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div className="relative" style={{ height: 300 }}>
            <StationMiniMap stations={stations} />
          </div>
        </div>
      </motion.div>

      {/* Zone 3 : LineChart qualite eau 24h */}
      <motion.div variants={item}>
        <div className="glass-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Qualite de l&apos;eau — derniere 24h
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Mesures horaires moyennes toutes stations
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded-full" style={{ background: '#06b6d4' }} />
                <span style={{ color: 'var(--text-muted)' }}>pH</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded-full" style={{ background: '#f59e0b' }} />
                <span style={{ color: 'var(--text-muted)' }}>Turbidite (NTU)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded-full" style={{ background: '#ef4444' }} />
                <span style={{ color: 'var(--text-muted)' }}>Mercure (ug/L)</span>
              </span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={WATER_QUALITY_24H}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="heure" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false} interval={2} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="ph" name="pH" stroke="#06b6d4" strokeWidth={2}
                  dot={false} activeDot={{ r: 5, fill: '#06b6d4', stroke: 'rgba(6,182,212,0.3)', strokeWidth: 6 }}
                />
                <Line type="monotone" dataKey="turbidite" name="Turbidite" stroke="#f59e0b" strokeWidth={2}
                  dot={false} activeDot={{ r: 5, fill: '#f59e0b', stroke: 'rgba(245,158,11,0.3)', strokeWidth: 6 }}
                />
                <Line type="monotone" dataKey="mercure" name="Mercure" stroke="#ef4444" strokeWidth={2}
                  dot={false} activeDot={{ r: 5, fill: '#ef4444', stroke: 'rgba(239,68,68,0.3)', strokeWidth: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Zone 4 : DataTable anomalies */}
      <motion.div variants={item}>
        <div className="glass-card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--danger)' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Anomalies detectees
            </h3>
          </div>
          <DataTable columns={anomalyColumns} data={MOCK_ANOMALIES} />
        </div>
      </motion.div>

      {/* Zone 5 : BarChart contamination par region */}
      <motion.div variants={item}>
        <div className="glass-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Contamination par region
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Niveaux moyens de mercure et turbidite
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded" style={{ background: '#ef4444' }} />
                <span style={{ color: 'var(--text-muted)' }}>Mercure (ug/L)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded" style={{ background: '#f59e0b' }} />
                <span style={{ color: 'var(--text-muted)' }}>Turbidite (NTU)</span>
              </span>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={CONTAMINATION_DATA} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false} />
                <YAxis type="category" dataKey="region" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} stroke="transparent" axisLine={false} width={90} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="mercure" name="Mercure" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={12} fillOpacity={0.85} />
                <Bar dataKey="turbidite" name="Turbidite" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={12} fillOpacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
