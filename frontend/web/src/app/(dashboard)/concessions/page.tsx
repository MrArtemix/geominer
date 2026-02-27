'use client';

/* ============================================
   Concessions - Gestion des permis miniers
   Zone 1 : 4 StatCards
   Zone 2 : DataTable concessions
   Zone 3 : PieChart donut + Mini carte MapLibre
   ============================================ */

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Landmark,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { format } from 'date-fns';
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

/* ---------- Tooltip custom ---------- */

function CustomPieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
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
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.payload.color }} />
        <span style={{ color: 'var(--text-primary)' }} className="font-semibold">{d.name}</span>
      </div>
      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{d.value} concessions</p>
    </div>
  );
}

/* ---------- Types ---------- */

interface Concession {
  id: string;
  name: string;
  holder: string;
  region: string;
  surface_km2: number;
  expiration_date: string;
  status: 'ACTIVE' | 'EXPIRED' | 'PENDING' | 'SUSPENDED';
  latitude: number;
  longitude: number;
}

/* ---------- Statut config ---------- */

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  EXPIRED: 'Expiree',
  PENDING: 'En attente',
  SUSPENDED: 'Suspendue',
};

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: 'badge-success',
  EXPIRED: 'badge-danger',
  PENDING: 'badge-warning',
  SUSPENDED: 'badge-medium',
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#22c55e',
  EXPIRED: '#ef4444',
  PENDING: '#f59e0b',
  SUSPENDED: '#64748b',
};

/* ---------- Mock data ---------- */

const MOCK_CONCESSIONS: Concession[] = [
  { id: 'c1', name: 'Permis Bagoue-01', holder: 'SODEMI', region: 'Bagoue', surface_km2: 125, expiration_date: '2027-06-15', status: 'ACTIVE', latitude: 9.75, longitude: -6.42 },
  { id: 'c2', name: 'Permis Tonkpi-03', holder: 'Newcrest Mining', region: 'Tonkpi', surface_km2: 85, expiration_date: '2026-12-01', status: 'ACTIVE', latitude: 7.40, longitude: -7.10 },
  { id: 'c3', name: 'Permis Folon-02', holder: 'Perseus Mining', region: 'Folon', surface_km2: 210, expiration_date: '2028-03-20', status: 'ACTIVE', latitude: 9.90, longitude: -7.80 },
  { id: 'c4', name: 'Permis Kabadougou-01', holder: 'Randgold', region: 'Kabadougou', surface_km2: 160, expiration_date: '2025-08-30', status: 'EXPIRED', latitude: 9.55, longitude: -7.40 },
  { id: 'c5', name: 'Permis Hambol-05', holder: 'Endeavour Mining', region: 'Hambol', surface_km2: 95, expiration_date: '2025-02-15', status: 'EXPIRED', latitude: 8.20, longitude: -5.20 },
  { id: 'c6', name: 'Permis Bounkani-02', holder: 'COMINOR', region: 'Bounkani', surface_km2: 180, expiration_date: '2026-09-10', status: 'PENDING', latitude: 9.30, longitude: -3.00 },
  { id: 'c7', name: 'Permis Worodougou-01', holder: 'Ivoire Gold', region: 'Worodougou', surface_km2: 70, expiration_date: '2027-01-25', status: 'PENDING', latitude: 8.00, longitude: -6.60 },
  { id: 'c8', name: 'Permis Tchologo-04', holder: 'Anglogold Ashanti', region: 'Tchologo', surface_km2: 145, expiration_date: '2027-11-05', status: 'ACTIVE', latitude: 9.50, longitude: -5.60 },
];

const PIE_DATA = [
  { name: 'Actives', value: 4, color: '#22c55e' },
  { name: 'Expirees', value: 2, color: '#ef4444' },
  { name: 'En attente', value: 2, color: '#f59e0b' },
];

/* ---------- DataTable columns ---------- */

const columns: ColumnDef<Concession>[] = [
  {
    key: 'name', header: 'Concession', sortable: true,
    render: (row) => (
      <div>
        <p className="font-semibold text-geo-300">{row.name}</p>
        <p className="text-[11px] text-geo-600">{row.holder}</p>
      </div>
    ),
  },
  { key: 'region', header: 'Region', sortable: true },
  {
    key: 'surface_km2', header: 'Surface (km2)', sortable: true,
    render: (row) => <span className="font-mono text-xs text-geo-400">{row.surface_km2} km&sup2;</span>,
  },
  {
    key: 'expiration_date', header: 'Expiration', sortable: true,
    render: (row) => (
      <span className="text-geo-500 font-mono text-xs">
        {format(new Date(row.expiration_date), 'dd MMM yyyy', { locale: fr })}
      </span>
    ),
  },
  {
    key: 'status', header: 'Statut',
    render: (row) => (
      <span className={STATUS_CLASS[row.status] || 'badge-low'}>
        {STATUS_LABEL[row.status] || row.status}
      </span>
    ),
  },
];

/* ---------- Mini carte MapLibre ---------- */

function ConcessionMiniMap({ concessions }: { concessions: Concession[] }) {
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
      center: [-5.55, 8.5],
      zoom: 5.5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      concessions.forEach((c) => {
        const el = document.createElement('div');
        el.style.cssText = `
          width: 14px; height: 14px; border-radius: 50%;
          background: ${STATUS_COLOR[c.status]};
          border: 2px solid rgba(255,255,255,0.3);
          box-shadow: 0 0 8px ${STATUS_COLOR[c.status]}80;
          cursor: pointer;
        `;

        const popup = new maplibregl.Popup({ offset: 10, closeButton: false })
          .setHTML(`
            <div style="background:rgba(15,23,42,0.95);padding:8px 12px;border-radius:8px;border:1px solid rgba(148,163,184,0.15);min-width:140px;">
              <p style="color:#f1f5f9;font-weight:600;font-size:12px;margin:0 0 4px">${c.name}</p>
              <p style="color:#94a3b8;font-size:11px;margin:0">${c.holder}</p>
              <p style="color:#64748b;font-size:10px;margin:4px 0 0">${c.surface_km2} km&sup2; &bull; ${c.region}</p>
            </div>
          `);

        new maplibregl.Marker({ element: el })
          .setLngLat([c.longitude, c.latitude])
          .setPopup(popup)
          .addTo(map);
      });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [concessions]);

  return <div ref={mapContainerRef} className="absolute inset-0" />;
}

/* ---------- Page principale ---------- */

export default function ConcessionsPage() {
  const { data: concessions = [], isLoading } = useQuery({
    queryKey: ['concessions'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/v1/concessions');
        return res.data.results;
      } catch {
        return MOCK_CONCESSIONS;
      }
    },
  });

  const actives = concessions.filter((c: Concession) => c.status === 'ACTIVE').length;
  const expirees = concessions.filter((c: Concession) => c.status === 'EXPIRED').length;
  const enAttente = concessions.filter((c: Concession) => c.status === 'PENDING').length;
  const total = concessions.length;
  const pieTotal = PIE_DATA.reduce((s, d) => s + d.value, 0);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Titre */}
      <motion.div variants={item}>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Concessions</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Gestion des permis et concessions minieres — Cote d&apos;Ivoire
        </p>
      </motion.div>

      {/* Zone 1 : StatCards */}
      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={FileText} title="Total concessions" value={total} variant="info" loading={isLoading} />
        <StatCard icon={CheckCircle2} title="Actives" value={actives} delta={5.0} variant="success" loading={isLoading} />
        <StatCard icon={XCircle} title="Expirees" value={expirees} delta={-10.0} variant="danger" loading={isLoading} />
        <StatCard icon={Clock} title="En attente" value={enAttente} variant="warning" loading={isLoading} />
      </motion.div>

      {/* Zone 2 : DataTable */}
      <motion.div variants={item}>
        <div className="glass-card">
          <div className="flex items-center gap-2 mb-4">
            <Landmark className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Liste des concessions
            </h3>
          </div>
          <DataTable columns={columns} data={concessions} isLoading={isLoading} />
        </div>
      </motion.div>

      {/* Zone 3 : Donut + Mini carte */}
      <motion.div variants={item} className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* PieChart donut */}
        <div className="glass-card">
          <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Repartition par statut
          </h3>
          <div className="flex items-center gap-6">
            <div className="w-40 h-40 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={PIE_DATA}
                    cx="50%" cy="50%"
                    innerRadius={42}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {PIE_DATA.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-3">
              {PIE_DATA.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{d.value}</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      ({Math.round((d.value / pieTotal) * 100)}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mini carte MapLibre */}
        <div className="glass-card !p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" style={{ color: 'var(--gold)' }} />
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Localisation
              </h3>
            </div>
          </div>
          <div className="relative" style={{ height: 280 }}>
            <ConcessionMiniMap concessions={concessions.length > 0 ? concessions : MOCK_CONCESSIONS} />
            {/* Legende */}
            <div
              className="absolute bottom-2 left-2 flex items-center gap-3 px-3 py-1.5 rounded-lg text-[10px]"
              style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(8px)',
                border: '1px solid var(--glass-border)',
              }}
            >
              {Object.entries(STATUS_COLOR).map(([s, c]) => (
                <span key={s} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                  <span style={{ color: 'var(--text-muted)' }}>{STATUS_LABEL[s]}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
