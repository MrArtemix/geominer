'use client';

/* ============================================
   Operations - Gestion des operations minieres
   Zone 1 : 4 StatCards
   Zone 2 : DataTable operations
   Zone 3 : BarChart planifiees vs terminees
   Zone 4 : Kanban visuel par statut
   ============================================ */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Pickaxe,
  Users,
  ShieldCheck,
  TrendingUp,
  Calendar,
  Clock,
  Target,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '@/lib/api';
import StatCard from '@/components/ui/StatCard';
import DataTable, { type ColumnDef } from '@/components/ui/DataTable';
import type { Operation, OperationStatus } from '@/types';

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

/* ---------- Statut badges ---------- */

const STATUS_LABEL: Record<string, string> = {
  PLANNED: 'Planifiee',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminee',
  CANCELLED: 'Annulee',
  SUSPENDED: 'Suspendue',
};

const STATUS_CLASS: Record<string, string> = {
  PLANNED: 'badge-info',
  IN_PROGRESS: 'badge-warning',
  COMPLETED: 'badge-success',
  CANCELLED: 'badge-danger',
  SUSPENDED: 'badge-medium',
};

const STATUS_KANBAN_COLOR: Record<string, string> = {
  PLANNED: 'border-cyan-500/40 bg-cyan-500/5',
  IN_PROGRESS: 'border-amber-500/40 bg-amber-500/5',
  COMPLETED: 'border-emerald-500/40 bg-emerald-500/5',
  CANCELLED: 'border-red-500/40 bg-red-500/5',
  SUSPENDED: 'border-gray-500/40 bg-gray-500/5',
};

const STATUS_DOT_COLOR: Record<string, string> = {
  PLANNED: '#06b6d4',
  IN_PROGRESS: '#f59e0b',
  COMPLETED: '#22c55e',
  CANCELLED: '#ef4444',
  SUSPENDED: '#64748b',
};

/* ---------- Mock data ---------- */

const MOCK_OPERATIONS: Operation[] = [
  {
    id: 'op-001', name: 'Operation Bagoue-Nord', status: 'IN_PROGRESS' as OperationStatus,
    type: 'Demantelement', site_ids: ['s1', 's2', 's3'], description: 'Demantelement sites illegaux zone Bagoue-Nord',
    start_date: '2025-11-15', commander: 'Col. Kouame', team_size: 24,
    authority: 'DRMG Bagoue', objectives: ['Demanteler 3 sites', 'Saisir equipements'],
    created_at: '2025-11-10T08:00:00Z', updated_at: '2026-01-20T10:00:00Z',
  },
  {
    id: 'op-002', name: 'Operation Tonkpi-Sud', status: 'COMPLETED' as OperationStatus,
    type: 'Rehabilitation', site_ids: ['s4', 's5'], description: 'Rehabilitation sites demanteles Tonkpi',
    start_date: '2025-09-01', end_date: '2025-12-20', commander: 'Cdt. Traore', team_size: 18,
    authority: 'Prefet Tonkpi', objectives: ['Rehabiliter 2 sites', 'Replanter couverture'],
    results: '2 sites rehabilites', created_at: '2025-08-25T08:00:00Z', updated_at: '2025-12-20T16:00:00Z',
  },
  {
    id: 'op-003', name: 'Operation Folon-Est', status: 'PLANNED' as OperationStatus,
    type: 'Surveillance', site_ids: ['s6', 's7', 's8'], description: 'Surveillance renforcee zone Folon',
    start_date: '2026-03-01', commander: 'Lt. Bamba', team_size: 12,
    authority: 'DRMG Folon', objectives: ['Cartographier sites suspects', 'Deployer capteurs'],
    created_at: '2026-02-01T08:00:00Z', updated_at: '2026-02-15T08:00:00Z',
  },
  {
    id: 'op-004', name: 'Operation Kabadougou', status: 'IN_PROGRESS' as OperationStatus,
    type: 'Demantelement', site_ids: ['s9', 's10'], description: 'Demanteler sites proches cours eau',
    start_date: '2026-01-10', commander: 'Col. Diallo', team_size: 30,
    authority: 'Gendarmerie Nationale', objectives: ['Securiser berges', 'Arreter operateurs'],
    created_at: '2026-01-05T08:00:00Z', updated_at: '2026-02-18T08:00:00Z',
  },
  {
    id: 'op-005', name: 'Operation Bounkani-Ouest', status: 'SUSPENDED' as OperationStatus,
    type: 'Demantelement', site_ids: ['s11'], description: 'Intervention suspendue pour raison meteo',
    start_date: '2026-01-20', commander: 'Cdt. Yao', team_size: 15,
    authority: 'DRMG Bounkani', objectives: ['Demanteler site actif'],
    created_at: '2026-01-15T08:00:00Z', updated_at: '2026-02-01T08:00:00Z',
  },
  {
    id: 'op-006', name: 'Operation Tchologo-Centre', status: 'CANCELLED' as OperationStatus,
    type: 'Surveillance', site_ids: ['s12', 's13'], description: 'Annulee suite reclassement zone',
    start_date: '2025-12-01', commander: 'Lt. Kone', team_size: 8,
    authority: 'Prefet Tchologo', objectives: ['Surveillance aerienne'],
    created_at: '2025-11-25T08:00:00Z', updated_at: '2025-12-05T08:00:00Z',
  },
];

const CHART_DATA = [
  { month: 'Sep', planifiees: 3, terminees: 1 },
  { month: 'Oct', planifiees: 5, terminees: 2 },
  { month: 'Nov', planifiees: 4, terminees: 3 },
  { month: 'Dec', planifiees: 6, terminees: 4 },
  { month: 'Jan', planifiees: 7, terminees: 5 },
  { month: 'Fev', planifiees: 8, terminees: 6 },
];

/* ---------- Progress bar component ---------- */

function ProgressBar({ value }: { value: number }) {
  const color = value >= 80 ? '#22c55e' : value >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-geo-800 overflow-hidden" style={{ minWidth: 60 }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[11px] font-mono" style={{ color }}>{value}%</span>
    </div>
  );
}

/* ---------- Columns DataTable ---------- */

const columns: ColumnDef<Operation & { progress: number }>[] = [
  {
    key: 'name', header: 'Operation', sortable: true,
    render: (row) => (
      <div>
        <p className="font-semibold text-geo-300">{row.name}</p>
        <p className="text-[11px] text-geo-600">{row.type}</p>
      </div>
    ),
  },
  {
    key: 'authority', header: 'Autorite', sortable: true,
    render: (row) => <span className="text-geo-400">{row.authority}</span>,
  },
  {
    key: 'status', header: 'Statut',
    render: (row) => (
      <span className={STATUS_CLASS[row.status] || 'badge-low'}>
        {STATUS_LABEL[row.status] || row.status}
      </span>
    ),
  },
  {
    key: 'start_date', header: 'Debut', sortable: true,
    render: (row) => (
      <span className="text-geo-500 font-mono text-xs">
        {format(new Date(row.start_date), 'dd MMM yyyy', { locale: fr })}
      </span>
    ),
  },
  {
    key: 'team_size', header: 'Agents', sortable: true,
    render: (row) => (
      <div className="flex items-center gap-1.5">
        <Users size={13} className="text-geo-600" />
        <span className="text-geo-400 font-semibold">{row.team_size}</span>
      </div>
    ),
  },
  {
    key: 'progress', header: 'Progression',
    render: (row) => <ProgressBar value={row.progress} />,
  },
];

/* ---------- Kanban mini-card ---------- */

function KanbanCard({ op }: { op: Operation & { progress: number } }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card !p-3 space-y-2"
    >
      <p className="text-xs font-semibold text-geo-300 leading-snug">{op.name}</p>
      <div className="flex items-center gap-1.5 text-[10px] text-geo-600">
        <Calendar size={10} />
        {format(new Date(op.start_date), 'dd/MM/yy')}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-geo-600">
        <Users size={10} />
        {op.team_size} agents
      </div>
      <ProgressBar value={op.progress} />
    </motion.div>
  );
}

/* ---------- Page principale ---------- */

export default function OperationsPage() {
  const { data: operations = [], isLoading } = useQuery({
    queryKey: ['operations'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/v1/operations');
        return res.data.results;
      } catch {
        return MOCK_OPERATIONS;
      }
    },
  });

  /* Ajout progression mock */
  const opsWithProgress = operations.map((op: Operation) => ({
    ...op,
    progress:
      op.status === 'COMPLETED' ? 100
        : op.status === 'CANCELLED' ? 0
        : op.status === 'SUSPENDED' ? 35
        : op.status === 'PLANNED' ? 0
        : Math.floor(30 + Math.random() * 50),
  }));

  const enCours = opsWithProgress.filter((o: Operation) => o.status === 'IN_PROGRESS').length;
  const totalAgents = opsWithProgress.reduce((s: number, o: Operation & { team_size: number }) => s + o.team_size, 0);
  const demanteles = opsWithProgress.filter((o: Operation) => o.status === 'COMPLETED').length;
  const taux = opsWithProgress.length > 0 ? Math.round((demanteles / opsWithProgress.length) * 100) : 0;

  const KANBAN_STATUSES: OperationStatus[] = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SUSPENDED', 'CANCELLED'] as OperationStatus[];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Titre */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Operations</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Suivi des interventions et operations de terrain
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Clock size={14} />
          Mis a jour en temps reel
        </div>
      </motion.div>

      {/* Zone 1 : StatCards */}
      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Pickaxe} title="Operations en cours" value={enCours} delta={15.2} variant="warning" loading={isLoading} />
        <StatCard icon={Users} title="Agents deployes" value={totalAgents} delta={8.5} variant="info" loading={isLoading} />
        <StatCard icon={ShieldCheck} title="Sites demanteles" value={demanteles} delta={12.0} variant="success" loading={isLoading} />
        <StatCard icon={TrendingUp} title="Taux reussite" value={taux} suffix="%" delta={3.7} variant="info" loading={isLoading} />
      </motion.div>

      {/* Zone 2 : DataTable */}
      <motion.div variants={item}>
        <div className="glass-card">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Liste des operations
            </h3>
          </div>
          <DataTable columns={columns} data={opsWithProgress} isLoading={isLoading} />
        </div>
      </motion.div>

      {/* Zone 3 : BarChart groupe */}
      <motion.div variants={item}>
        <div className="glass-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Operations planifiees vs terminees
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                6 derniers mois
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded" style={{ background: '#06b6d4' }} />
                <span style={{ color: 'var(--text-muted)' }}>Planifiees</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded" style={{ background: '#22c55e' }} />
                <span style={{ color: 'var(--text-muted)' }}>Terminees</span>
              </span>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={CHART_DATA} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} stroke="transparent" axisLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="planifiees" name="Planifiees" fill="#06b6d4" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="terminees" name="Terminees" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Zone 4 : Kanban visuel */}
      <motion.div variants={item}>
        <div className="glass-card">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4" style={{ color: 'var(--gold)' }} />
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Vue Kanban
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {KANBAN_STATUSES.map((status) => {
              const statusOps = opsWithProgress.filter((o: Operation) => o.status === status);
              return (
                <div key={status} className={`rounded-xl border p-3 ${STATUS_KANBAN_COLOR[status]}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full" style={{ background: STATUS_DOT_COLOR[status] }} />
                    <span className="text-xs font-semibold text-geo-400">
                      {STATUS_LABEL[status]} ({statusOps.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {statusOps.map((op: Operation & { progress: number }) => (
                      <KanbanCard key={op.id} op={op} />
                    ))}
                    {statusOps.length === 0 && (
                      <p className="text-[11px] text-geo-700 text-center py-4">Aucune</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
