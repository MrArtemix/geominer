'use client';

/* ============================================
   Dashboard Home Premium - Ge O'Miner
   Zone 1 : StatCards (4) avec gradient borders
   Zone 2 : LineChart + BarChart
   Zone 3 : Jauge confiance IA + Donut statut sites
   Zone 4 : Alertes recentes + Feed activite
   Zone 5 : Mini MapLibre heatmap
   ============================================ */

import { useRef, useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Mountain,
  Bell,
  Gem,
  BarChart3,
  ArrowRight,
  MapIcon,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  Info,
  ExternalLink,
  Brain,
  Activity,
  Zap,
  Clock,
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import StatCard from '@/components/ui/StatCard';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { Alert } from '@/types';

/* ---------- Badge severite ---------- */

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: 'Critique',
  HIGH: 'Eleve',
  MEDIUM: 'Modere',
  LOW: 'Faible',
};

const SEVERITY_CLASS: Record<string, string> = {
  CRITICAL: 'badge-critical',
  HIGH: 'badge-high',
  MEDIUM: 'badge-medium',
  LOW: 'badge-low',
};

const SEVERITY_ICON: Record<string, typeof Info> = {
  CRITICAL: ShieldAlert,
  HIGH: AlertCircle,
  MEDIUM: AlertTriangle,
  LOW: Info,
};

function SeverityBadge({ severity }: { severity: string }) {
  const Icon = SEVERITY_ICON[severity] || Info;
  return (
    <span className={cn('inline-flex items-center gap-1', SEVERITY_CLASS[severity] || 'badge-low')}>
      <Icon size={11} />
      {SEVERITY_LABEL[severity] || severity}
    </span>
  );
}

/* ---------- Donnees graphiques mockees ---------- */

const trendData = [
  { month: 'Jan', nouveaux: 8, demanteles: 3 },
  { month: 'Fev', nouveaux: 12, demanteles: 5 },
  { month: 'Mar', nouveaux: 10, demanteles: 7 },
  { month: 'Avr', nouveaux: 15, demanteles: 9 },
  { month: 'Mai', nouveaux: 22, demanteles: 11 },
  { month: 'Jun', nouveaux: 18, demanteles: 14 },
  { month: 'Jul', nouveaux: 25, demanteles: 16 },
  { month: 'Aou', nouveaux: 20, demanteles: 18 },
  { month: 'Sep', nouveaux: 28, demanteles: 20 },
  { month: 'Oct', nouveaux: 24, demanteles: 22 },
  { month: 'Nov', nouveaux: 30, demanteles: 19 },
  { month: 'Dec', nouveaux: 27, demanteles: 24 },
];

const regionsData = [
  { region: 'Bagoue', count: 42 },
  { region: 'Tonkpi', count: 38 },
  { region: 'Kabadougou', count: 31 },
  { region: 'Bounkani', count: 27 },
  { region: 'Folon', count: 23 },
  { region: 'Tchologo', count: 19 },
  { region: 'Hambol', count: 15 },
  { region: 'Worodougou', count: 12 },
];

const siteStatusData = [
  { name: 'Actif', value: 54, color: '#ef4444' },
  { name: 'Suspect', value: 32, color: '#f59e0b' },
  { name: 'Confirme', value: 28, color: '#fbbf24' },
  { name: 'Remedie', value: 13, color: '#22c55e' },
];

const activityFeed = [
  { id: '1', text: 'Nouveau site detecte zone Bagoue-Nord', type: 'alert', time: Date.now() - 300_000 },
  { id: '2', text: 'Modele MineSpot v3.2 deploye avec succes', type: 'system', time: Date.now() - 1_200_000 },
  { id: '3', text: 'Contamination mercure station AQ-07', type: 'critical', time: Date.now() - 2_400_000 },
  { id: '4', text: 'Operation Tonkpi : 3 sites demanteles', type: 'success', time: Date.now() - 5_400_000 },
  { id: '5', text: 'Capteur temperature M-03 restaure', type: 'info', time: Date.now() - 7_200_000 },
  { id: '6', text: 'Transaction or suspecte GoldTrack-12', type: 'alert', time: Date.now() - 10_800_000 },
];

const ACTIVITY_COLORS: Record<string, string> = {
  alert: 'text-amber-400',
  critical: 'text-red-400',
  success: 'text-emerald-400',
  system: 'text-violet-400',
  info: 'text-cyan-400',
};

const ACTIVITY_ICONS: Record<string, typeof Info> = {
  alert: AlertTriangle,
  critical: ShieldAlert,
  success: Zap,
  system: Brain,
  info: Info,
};

/* Heatmap sites CI (mock) */
const MOCK_HEATMAP_POINTS: [number, number][] = [
  [-6.42, 9.75], [-6.35, 9.80], [-6.50, 9.65],
  [-6.28, 9.72], [-6.55, 9.90], [-6.38, 9.58],
  [-7.10, 7.40], [-7.05, 7.45], [-6.90, 7.35],
  [-6.80, 7.50], [-5.40, 7.60], [-5.50, 7.55],
  [-5.30, 7.70], [-5.60, 7.45], [-6.10, 8.20],
  [-6.20, 8.30], [-6.00, 8.15], [-5.80, 8.40],
  [-7.50, 8.00], [-7.40, 8.10], [-7.60, 7.90],
  [-8.10, 6.80], [-8.00, 6.90], [-7.90, 6.70],
  [-6.60, 6.50], [-6.70, 6.40], [-6.50, 6.60],
];

/* ---------- Animation stagger ---------- */

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
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
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: entry.color }}
          />
          <span style={{ color: 'var(--text-muted)' }}>{entry.name} :</span>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Jauge confiance IA (SVG circulaire) ---------- */

function AIConfidenceGauge({ score = 87 }: { score?: number }) {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <div className="glass-card flex flex-col items-center justify-center py-6">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-4 h-4" style={{ color: 'var(--gold)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Confiance IA
        </h3>
      </div>
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
          <circle
            cx="64" cy="64" r={radius}
            fill="none"
            stroke="var(--bg-elevated)"
            strokeWidth="8"
          />
          <motion.circle
            cx="64" cy="64" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-3xl font-bold"
            style={{ color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {score}%
          </motion.span>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            MineSpot v3
          </span>
        </div>
      </div>
      <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
        Score moyen de detection sur 30j
      </p>
    </div>
  );
}

/* ---------- Donut chart statut sites ---------- */

function SiteStatusDonut() {
  const total = siteStatusData.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="glass-card flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4" style={{ color: 'var(--gold)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Statut des sites
        </h3>
      </div>
      <div className="flex-1 flex items-center gap-4">
        <div className="w-32 h-32 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={siteStatusData}
                cx="50%" cy="50%"
                innerRadius={35}
                outerRadius={55}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {siteStatusData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {siteStatusData.map((d) => (
            <div key={d.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                <span style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{d.value}</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  ({Math.round((d.value / total) * 100)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Feed activite ---------- */

function ActivityFeed() {
  return (
    <div className="glass-card flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4" style={{ color: 'var(--gold)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Activite recente
          </h3>
        </div>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[280px]">
        {activityFeed.map((a) => {
          const Icon = ACTIVITY_ICONS[a.type] || Info;
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
            >
              <Icon size={14} className={cn('mt-0.5 flex-shrink-0', ACTIVITY_COLORS[a.type])} />
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {a.text}
                </p>
                <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  <Clock size={9} />
                  {formatDistanceToNow(new Date(a.time), { addSuffix: true, locale: fr })}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Mini carte composant ---------- */

function DashboardMiniMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';
    const hasValidKey = MAPTILER_KEY && !MAPTILER_KEY.includes('your_');

    /* Style : MapTiler dark si cle valide, sinon style minimal embarque */
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
            /* Couche assombrissante par-dessus */
            {
              id: 'darken',
              type: 'background',
              paint: { 'background-color': 'rgba(10, 22, 40, 0.65)' },
            },
          ],
        };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: [-5.55, 7.54],
      zoom: 5.8,
      attributionControl: false,
      interactive: false,
    });

    map.on('load', () => {
      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: MOCK_HEATMAP_POINTS.map(([lng, lat]) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [lng, lat] },
          properties: { weight: 0.5 + Math.random() * 0.5 },
        })),
      };

      map.addSource('sites-heat', { type: 'geojson', data: geojson });

      map.addLayer({
        id: 'heatmap-layer',
        type: 'heatmap',
        source: 'sites-heat',
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': 1.2,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.2, 'rgba(251,191,36,0.2)',
            0.4, 'rgba(245,158,11,0.4)',
            0.6, 'rgba(239,68,68,0.5)',
            0.8, 'rgba(220,38,38,0.7)',
            1, 'rgba(185,28,28,0.9)',
          ],
          'heatmap-radius': 30,
          'heatmap-opacity': 0.85,
        },
      });

      map.addLayer({
        id: 'points-glow',
        type: 'circle',
        source: 'sites-heat',
        paint: {
          'circle-radius': 4,
          'circle-color': '#fbbf24',
          'circle-opacity': 0.6,
          'circle-blur': 0.5,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={mapContainerRef} className="absolute inset-0" />;
}

/* ---------- Skeleton loader ---------- */

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('glass-card', className)}>
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-32 shimmer-bg rounded" />
        <div className="h-8 w-20 shimmer-bg rounded" />
        <div className="h-40 shimmer-bg rounded-lg" />
      </div>
    </div>
  );
}

/* ---------- Dashboard principal ---------- */

export default function DashboardPage() {
  const router = useRouter();

  useWebSocket();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      try {
        const response = await api.get('/api/v1/dashboard/stats');
        return response.data;
      } catch {
        return {
          activeSites: 127,
          alerts24h: 23,
          estimatedGoldTons: 4.8,
          formalizationRate: 34.2,
          activeSitesChange: 12.5,
          alerts24hChange: -8.3,
          goldChange: 6.1,
          formalizationChange: 3.7,
        };
      }
    },
    refetchInterval: 60_000,
  });

  const { data: recentAlerts = [], isLoading: alertsLoading } = useQuery<Alert[]>({
    queryKey: ['recent-alerts-dashboard'],
    queryFn: async () => {
      try {
        const response = await api.get('/api/v1/alerts', {
          params: { limit: 5, ordering: '-created_at' },
        });
        return response.data.results;
      } catch {
        return [
          {
            id: '1', title: 'Nouveau site detecte - Zone Bagoue Nord',
            description: '', severity: 'HIGH', type: 'SITE_DETECTED',
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            is_read: false, is_resolved: false, site_name: 'Site BG-042',
          },
          {
            id: '2', title: 'Contamination eau - Riviere Bagoe',
            description: '', severity: 'CRITICAL', type: 'WATER_QUALITY',
            created_at: new Date(Date.now() - 3_600_000).toISOString(), updated_at: new Date(Date.now() - 3_600_000).toISOString(),
            is_read: false, is_resolved: false, site_name: 'AquaGuard Station 7',
          },
          {
            id: '3', title: 'Transaction or suspecte - Volume anormal',
            description: '', severity: 'MEDIUM', type: 'ESCALATION',
            created_at: new Date(Date.now() - 7_200_000).toISOString(), updated_at: new Date(Date.now() - 7_200_000).toISOString(),
            is_read: true, is_resolved: false, site_name: 'GoldTrack Point 12',
          },
          {
            id: '4', title: 'Expansion site confirme - Zone forestiere',
            description: '', severity: 'HIGH', type: 'STATUS_CHANGE',
            created_at: new Date(Date.now() - 14_400_000).toISOString(), updated_at: new Date(Date.now() - 14_400_000).toISOString(),
            is_read: true, is_resolved: false, site_name: 'Site BG-038',
          },
          {
            id: '5', title: 'Capteur hors ligne - Station meteo',
            description: '', severity: 'LOW', type: 'SYSTEM',
            created_at: new Date(Date.now() - 28_800_000).toISOString(), updated_at: new Date(Date.now() - 28_800_000).toISOString(),
            is_read: true, is_resolved: true, site_name: 'Station M-03',
          },
        ] as Alert[];
      }
    },
    refetchInterval: 60_000,
  });

  const handleRegionClick = useCallback((data: any) => {
    if (data?.region) {
      router.push(`/map?region=${encodeURIComponent(data.region)}`);
    }
  }, [router]);

  const sitesVariant = (stats?.activeSites ?? 0) > 50 ? 'danger' : 'success';

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* ===== TITRE ===== */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Tableau de bord
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Vue d&apos;ensemble de la surveillance miniere — Cote d&apos;Ivoire
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs mono" style={{ color: 'var(--text-muted)' }}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Temps reel actif
        </div>
      </motion.div>

      {/* ===== ZONE 1 : 4 StatCards ===== */}
      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Mountain} title="Sites actifs"
          value={stats?.activeSites ?? 0} delta={stats?.activeSitesChange}
          variant={sitesVariant} loading={statsLoading}
        />
        <StatCard
          icon={Bell} title="Alertes 24h"
          value={stats?.alerts24h ?? 0} delta={stats?.alerts24hChange}
          variant="danger" loading={statsLoading}
        />
        <StatCard
          icon={Gem} title="Or illegal estime"
          value={stats?.estimatedGoldTons ?? 0} delta={stats?.goldChange}
          variant="warning" loading={statsLoading} suffix="T" prefix="~"
        />
        <StatCard
          icon={BarChart3} title="Taux formalisation"
          value={stats?.formalizationRate ?? 0} delta={stats?.formalizationChange}
          variant="info" loading={statsLoading} suffix="%"
        />
      </motion.div>

      {/* ===== ZONE 2 : Graphiques + Jauge IA + Donut ===== */}
      <motion.div variants={item} className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* LineChart 12 mois */}
        <div className="xl:col-span-2 glass-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Evolution annuelle
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Nouveaux sites vs sites demanteles — 12 derniers mois
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded-full bg-red-500" />
                <span style={{ color: 'var(--text-muted)' }}>Nouveaux</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded-full" style={{ background: 'var(--gold-light)' }} />
                <span style={{ color: 'var(--text-muted)' }}>Demanteles</span>
              </span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="nouveaux" name="Nouveaux sites" stroke="#ef4444" strokeWidth={2.5}
                  dot={{ fill: '#ef4444', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#ef4444', stroke: 'rgba(239,68,68,0.3)', strokeWidth: 8 }}
                />
                <Line type="monotone" dataKey="demanteles" name="Sites demanteles" stroke="#fbbf24" strokeWidth={2.5}
                  dot={{ fill: '#fbbf24', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#fbbf24', stroke: 'rgba(251,191,36,0.3)', strokeWidth: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Jauge IA */}
        <AIConfidenceGauge score={87} />
      </motion.div>

      {/* ===== ZONE 3 : BarChart regions + Donut statut ===== */}
      <motion.div variants={item} className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* BarChart Top 8 regions */}
        <div className="glass-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Top 8 regions
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Par nombre de sites actifs — cliquer pour filtrer
              </p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionsData} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRegionBar" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false} />
                <YAxis type="category" dataKey="region" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} stroke="transparent" axisLine={false} width={90} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Sites actifs" fill="url(#gradRegionBar)" radius={[0, 6, 6, 0]} cursor="pointer" onClick={handleRegionClick} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut statut */}
        <SiteStatusDonut />
      </motion.div>

      {/* ===== ZONE 4 : Alertes + Feed activite ===== */}
      <motion.div variants={item} className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Tableau alertes */}
        <div className="xl:col-span-3 glass-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Dernieres alertes
              </h3>
              {recentAlerts.filter(a => !a.is_read).length > 0 && (
                <span className="flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold">
                  {recentAlerts.filter(a => !a.is_read).length}
                </span>
              )}
            </div>
            <Link href="/alerts" className="text-sm font-medium flex items-center gap-1 transition-colors" style={{ color: 'var(--gold)' }}>
              Voir tout <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th className="text-left py-3 px-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Severite</th>
                  <th className="text-left py-3 px-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Site</th>
                  <th className="text-left py-3 px-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Message</th>
                  <th className="text-left py-3 px-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Date</th>
                  <th className="text-left py-3 px-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }} />
                </tr>
              </thead>
              <tbody>
                {alertsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="py-3 px-2"><div className="h-5 w-16 shimmer-bg rounded-full" /></td>
                      <td className="py-3 px-2"><div className="h-4 w-20 shimmer-bg rounded" /></td>
                      <td className="py-3 px-2"><div className="h-4 w-48 shimmer-bg rounded" /></td>
                      <td className="py-3 px-2"><div className="h-4 w-16 shimmer-bg rounded" /></td>
                      <td className="py-3 px-2"><div className="h-4 w-4 shimmer-bg rounded" /></td>
                    </tr>
                  ))
                ) : recentAlerts.length > 0 ? (
                  recentAlerts.map((alert: Alert, idx: number) => (
                    <motion.tr
                      key={alert.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="cursor-pointer transition-colors hover:bg-[var(--bg-elevated)]"
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      onClick={() => router.push('/alerts')}
                    >
                      <td className="py-3 px-2"><SeverityBadge severity={alert.severity} /></td>
                      <td className="py-3 px-2">
                        <span className="font-medium text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {alert.site_name || '--'}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          {!alert.is_read && (
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 shadow-glow-gold" style={{ background: 'var(--gold)' }} />
                          )}
                          <span className="text-xs truncate max-w-[280px]" style={{ color: 'var(--text-secondary)' }}>
                            {alert.title}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 whitespace-nowrap mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true, locale: fr })}
                      </td>
                      <td className="py-3 px-2">
                        <Link href="/alerts" className="transition-colors" style={{ color: 'var(--gold)' }} onClick={(e) => e.stopPropagation()}>
                          <ExternalLink size={14} />
                        </Link>
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                      Aucune alerte recente
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Feed activite */}
        <div className="xl:col-span-2">
          <ActivityFeed />
        </div>
      </motion.div>

      {/* ===== ZONE 5 : Mini carte heatmap ===== */}
      <motion.div variants={item}>
        <div className="glass-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Carte de chaleur
            </h3>
            <Link href="/map" className="btn-secondary text-xs flex items-center gap-1.5 !py-1.5 !px-3">
              <MapIcon size={14} /> Ouvrir carte complete
            </Link>
          </div>
          <div
            className="rounded-xl overflow-hidden relative"
            style={{ height: 280, border: '1px solid var(--border-subtle)' }}
          >
            <DashboardMiniMap />
            <div
              className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none"
              style={{ background: 'linear-gradient(transparent, var(--bg-deep))' }}
            />
            <div
              className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px]"
              style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'blur(8px)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-muted)',
              }}
            >
              <span>Faible</span>
              <div
                className="w-20 h-1.5 rounded-full"
                style={{ background: 'linear-gradient(90deg, rgba(251,191,36,0.3), #f59e0b, #ef4444, #b91c1c)' }}
              />
              <span>Critique</span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
