'use client';

/* ============================================
   Risque Operationnel - Analyse des risques
   Zone 1 : 3 jauges SVG circulaires
   Zone 2 : ScatterChart matrice risque
   Zone 3 : BarChart horizontal score par region
   Zone 4 : DataTable Top 10 sites a risque
   Zone 5 : LineChart evolution risque 6 mois
   ============================================ */

import { motion } from 'framer-motion';
import {
  Shield,
  TreePine,
  AlertTriangle,
  MapPin,
  TrendingUp,
} from 'lucide-react';
import {
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Cell,
} from 'recharts';
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

/* ---------- Scatter tooltip ---------- */

function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
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
      <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{d.label}</p>
      <div className="text-xs space-y-0.5">
        <p style={{ color: 'var(--text-muted)' }}>Probabilite : <span className="text-geo-300 font-semibold">{d.probabilite}%</span></p>
        <p style={{ color: 'var(--text-muted)' }}>Impact : <span className="text-geo-300 font-semibold">{d.impact}</span></p>
        <p style={{ color: 'var(--text-muted)' }}>Occurrences : <span className="text-geo-300 font-semibold">{d.count}</span></p>
      </div>
    </div>
  );
}

/* ---------- Jauge SVG circulaire ---------- */

function RiskGauge({ label, score, icon: Icon, color }: {
  label: string;
  score: number;
  icon: typeof Shield;
  color: string;
}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="glass-card flex flex-col items-center py-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4" style={{ color }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</h3>
      </div>
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--bg-elevated)" strokeWidth="7" />
          <motion.circle
            cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="7"
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
            {score}
          </motion.span>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            /100
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Mock data ---------- */

const SCATTER_DATA = [
  { probabilite: 85, impact: 90, count: 5, label: 'Contamination mercure', color: '#ef4444' },
  { probabilite: 70, impact: 75, count: 8, label: 'Deforestation massive', color: '#f59e0b' },
  { probabilite: 60, impact: 85, count: 3, label: 'Effondrement galerie', color: '#ef4444' },
  { probabilite: 45, impact: 60, count: 12, label: 'Conflit foncier', color: '#f59e0b' },
  { probabilite: 80, impact: 50, count: 7, label: 'Pollution cours eau', color: '#06b6d4' },
  { probabilite: 30, impact: 40, count: 15, label: 'Travail mineurs', color: '#8b5cf6' },
  { probabilite: 55, impact: 70, count: 4, label: 'Expansion non autorisee', color: '#f59e0b' },
  { probabilite: 90, impact: 30, count: 10, label: 'Non-conformite permis', color: '#06b6d4' },
];

const REGION_RISK_DATA = [
  { region: 'Bagoue', score: 82 },
  { region: 'Tonkpi', score: 76 },
  { region: 'Kabadougou', score: 71 },
  { region: 'Bounkani', score: 68 },
  { region: 'Folon', score: 65 },
  { region: 'Tchologo', score: 58 },
  { region: 'Hambol', score: 52 },
  { region: 'Worodougou', score: 45 },
];

interface RiskSite {
  id: string;
  name: string;
  region: string;
  score: number;
  status: string;
  surface: number;
  confidence: number;
}

const TOP_RISK_SITES: RiskSite[] = [
  { id: '1', name: 'Site BG-042', region: 'Bagoue', score: 94, status: 'ACTIVE', surface: 12.5, confidence: 96 },
  { id: '2', name: 'Site TK-018', region: 'Tonkpi', score: 89, status: 'ESCALATED', surface: 8.3, confidence: 91 },
  { id: '3', name: 'Site KB-007', region: 'Kabadougou', score: 86, status: 'ACTIVE', surface: 15.1, confidence: 88 },
  { id: '4', name: 'Site BK-033', region: 'Bounkani', score: 83, status: 'CONFIRMED', surface: 6.7, confidence: 85 },
  { id: '5', name: 'Site FL-012', region: 'Folon', score: 79, status: 'ACTIVE', surface: 9.4, confidence: 92 },
  { id: '6', name: 'Site TC-025', region: 'Tchologo', score: 76, status: 'DETECTED', surface: 4.2, confidence: 78 },
  { id: '7', name: 'Site BG-051', region: 'Bagoue', score: 74, status: 'ESCALATED', surface: 11.0, confidence: 89 },
  { id: '8', name: 'Site TK-029', region: 'Tonkpi', score: 71, status: 'ACTIVE', surface: 7.8, confidence: 84 },
  { id: '9', name: 'Site HB-006', region: 'Hambol', score: 68, status: 'CONFIRMED', surface: 5.5, confidence: 81 },
  { id: '10', name: 'Site WR-014', region: 'Worodougou', score: 65, status: 'DETECTED', surface: 3.9, confidence: 76 },
];

const TREND_DATA = [
  { month: 'Sep', global: 58, environnemental: 62, securitaire: 54 },
  { month: 'Oct', global: 61, environnemental: 65, securitaire: 57 },
  { month: 'Nov', global: 63, environnemental: 68, securitaire: 59 },
  { month: 'Dec', global: 65, environnemental: 70, securitaire: 61 },
  { month: 'Jan', global: 66, environnemental: 71, securitaire: 62 },
  { month: 'Fev', global: 68, environnemental: 72, securitaire: 64 },
];

/* ---------- Score bar colorée ---------- */

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? '#ef4444' : score >= 60 ? '#f59e0b' : '#22c55e';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-geo-800 overflow-hidden" style={{ minWidth: 60 }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      <span className="text-xs font-bold font-mono" style={{ color }}>{score}</span>
    </div>
  );
}

/* ---------- Status labels ---------- */

const SITE_STATUS_LABEL: Record<string, string> = {
  DETECTED: 'Detecte',
  CONFIRMED: 'Confirme',
  ACTIVE: 'Actif',
  ESCALATED: 'Escalade',
};

const SITE_STATUS_CLASS: Record<string, string> = {
  DETECTED: 'badge-warning',
  CONFIRMED: 'badge-medium',
  ACTIVE: 'badge-critical',
  ESCALATED: 'badge-danger',
};

/* ---------- Columns DataTable ---------- */

const riskColumns: ColumnDef<RiskSite>[] = [
  {
    key: 'name', header: 'Site', sortable: true,
    render: (row) => (
      <div className="flex items-center gap-2">
        <MapPin size={13} className="text-geo-600" />
        <span className="font-semibold text-geo-300">{row.name}</span>
      </div>
    ),
  },
  { key: 'region', header: 'Region', sortable: true },
  {
    key: 'score', header: 'Score risque', sortable: true,
    render: (row) => <ScoreBar score={row.score} />,
  },
  {
    key: 'status', header: 'Statut',
    render: (row) => (
      <span className={SITE_STATUS_CLASS[row.status] || 'badge-low'}>
        {SITE_STATUS_LABEL[row.status] || row.status}
      </span>
    ),
  },
  {
    key: 'surface', header: 'Surface (ha)', sortable: true,
    render: (row) => <span className="font-mono text-xs text-geo-400">{row.surface} ha</span>,
  },
  {
    key: 'confidence', header: 'Confiance IA', sortable: true,
    render: (row) => {
      const c = row.confidence >= 90 ? '#22c55e' : row.confidence >= 75 ? '#f59e0b' : '#ef4444';
      return <span className="font-mono text-xs font-bold" style={{ color: c }}>{row.confidence}%</span>;
    },
  },
];

/* ---------- Region bar color ---------- */

function getRegionBarColor(score: number) {
  if (score >= 75) return '#ef4444';
  if (score >= 60) return '#f59e0b';
  return '#22c55e';
}

/* ---------- Page principale ---------- */

export default function OperationalRiskPage() {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Titre */}
      <motion.div variants={item}>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Risque Operationnel</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Analyse et surveillance des niveaux de risque par region et categorie
        </p>
      </motion.div>

      {/* Zone 1 : 3 jauges SVG */}
      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <RiskGauge label="Risque global" score={68} icon={Shield} color="#f59e0b" />
        <RiskGauge label="Environnemental" score={72} icon={TreePine} color="#ef4444" />
        <RiskGauge label="Securitaire" score={64} icon={AlertTriangle} color="#06b6d4" />
      </motion.div>

      {/* Zone 2 : ScatterChart matrice risque */}
      <motion.div variants={item}>
        <div className="glass-card">
          <div className="mb-5">
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Matrice de risque
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Probabilite x Impact — taille des bulles = nombre d&apos;occurrences
            </p>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis
                  type="number" dataKey="probabilite" name="Probabilite"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false}
                  label={{ value: 'Probabilite (%)', position: 'bottom', fill: 'var(--text-muted)', fontSize: 11 }}
                />
                <YAxis
                  type="number" dataKey="impact" name="Impact"
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false}
                  label={{ value: 'Impact', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11 }}
                />
                <ZAxis type="number" dataKey="count" range={[100, 600]} />
                <Tooltip content={<ScatterTooltip />} />
                <Scatter data={SCATTER_DATA}>
                  {SCATTER_DATA.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.7} stroke={entry.color} strokeWidth={1} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Zone 3 : BarChart horizontal score par region */}
      <motion.div variants={item}>
        <div className="glass-card">
          <div className="mb-5">
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Score de risque par region
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Indice composite multi-facteurs (0-100)
            </p>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={REGION_RISK_DATA} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false} />
                <YAxis type="category" dataKey="region" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} stroke="transparent" axisLine={false} width={90} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="score" name="Score risque" radius={[0, 6, 6, 0]} barSize={22}>
                  {REGION_RISK_DATA.map((entry, i) => (
                    <Cell key={i} fill={getRegionBarColor(entry.score)} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Zone 4 : DataTable Top 10 sites a risque */}
      <motion.div variants={item}>
        <div className="glass-card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--danger)' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Top 10 sites a risque
            </h3>
          </div>
          <DataTable columns={riskColumns} data={TOP_RISK_SITES} />
        </div>
      </motion.div>

      {/* Zone 5 : LineChart evolution 6 mois */}
      <motion.div variants={item}>
        <div className="glass-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Evolution des risques
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Tendance sur 6 mois — indices global, environnemental et securitaire
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded-full" style={{ background: '#f59e0b' }} />
                <span style={{ color: 'var(--text-muted)' }}>Global</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded-full" style={{ background: '#ef4444' }} />
                <span style={{ color: 'var(--text-muted)' }}>Environnemental</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 rounded-full" style={{ background: '#06b6d4' }} />
                <span style={{ color: 'var(--text-muted)' }}>Securitaire</span>
              </span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={TREND_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false} />
                <YAxis domain={[40, 80]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="global" name="Global" stroke="#f59e0b" strokeWidth={2.5}
                  dot={{ fill: '#f59e0b', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#f59e0b', stroke: 'rgba(245,158,11,0.3)', strokeWidth: 8 }}
                />
                <Line type="monotone" dataKey="environnemental" name="Environnemental" stroke="#ef4444" strokeWidth={2.5}
                  dot={{ fill: '#ef4444', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#ef4444', stroke: 'rgba(239,68,68,0.3)', strokeWidth: 8 }}
                />
                <Line type="monotone" dataKey="securitaire" name="Securitaire" stroke="#06b6d4" strokeWidth={2.5}
                  dot={{ fill: '#06b6d4', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#06b6d4', stroke: 'rgba(6,182,212,0.3)', strokeWidth: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
