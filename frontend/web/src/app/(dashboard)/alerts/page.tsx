'use client';

/* ============================================
   /alerts - Alerts centre
   ============================================ */

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  CheckCircle2,
  Filter,
  AlertTriangle,
  AlertCircle,
  Info,
  ShieldAlert,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import DataTable, { type ColumnDef } from '@/components/ui/DataTable';
import { AlertSeverity, type Alert } from '@/types';

/* ---------- severity config ---------- */

const SEVERITY_STYLE: Record<string, { bg: string; text: string; icon: typeof Info }> = {
  [AlertSeverity.LOW]: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Info },
  [AlertSeverity.MEDIUM]: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: AlertTriangle },
  [AlertSeverity.HIGH]: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle },
  [AlertSeverity.CRITICAL]: { bg: 'bg-red-200', text: 'text-red-900', icon: ShieldAlert },
};

const ALL_SEVERITIES = Object.values(AlertSeverity);

const TYPE_LABEL: Record<string, string> = {
  SITE_DETECTED: 'Detection site',
  STATUS_CHANGE: 'Changement statut',
  WATER_QUALITY: 'Qualite eau',
  ESCALATION: 'Escalade',
  SYSTEM: 'Systeme',
};

const ALL_TYPES = Object.keys(TYPE_LABEL);

/* ---------- component ---------- */

export default function AlertsPage() {
  const queryClient = useQueryClient();

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  /* ---------- data ---------- */

  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ['alerts'],
    queryFn: () => api.get('/api/alerts').then((r) => r.data),
    refetchInterval: 30_000,
  });

  const unreadCount = useMemo(
    () => alerts.filter((a) => !a.is_read).length,
    [alerts],
  );

  const filtered = useMemo(() => {
    let list = alerts;
    if (severityFilter) list = list.filter((a) => a.severity === severityFilter);
    if (typeFilter) list = list.filter((a) => a.type === typeFilter);
    return list;
  }, [alerts, severityFilter, typeFilter]);

  /* ---------- acknowledge mutation ---------- */

  const ackMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/alerts/${id}/resolve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const handleAck = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      ackMutation.mutate(id);
    },
    [ackMutation],
  );

  /* ---------- columns ---------- */

  const columns: ColumnDef<Alert>[] = [
    {
      key: 'severity',
      header: 'Severite',
      render: (row) => {
        const s = SEVERITY_STYLE[row.severity] ?? SEVERITY_STYLE[AlertSeverity.LOW];
        const Icon = s.icon;
        return (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
              s.bg,
              s.text,
            )}
          >
            <Icon size={12} />
            {row.severity}
          </span>
        );
      },
    },
    {
      key: 'title',
      header: 'Titre',
      sortable: true,
      render: (row) => (
        <span className="font-medium text-gray-900">{row.title}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (row) => (
        <span className="text-gray-600">{TYPE_LABEL[row.type] ?? row.type}</span>
      ),
    },
    {
      key: 'site_name',
      header: 'Site',
      render: (row) =>
        row.site_name ? (
          <Link
            href={`/sites/${row.site_id}`}
            className="text-primary-600 hover:underline font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {row.site_name}
          </Link>
        ) : (
          <span className="text-gray-400">--</span>
        ),
    },
    {
      key: 'created_at',
      header: 'Envoye',
      sortable: true,
      render: (row) => (
        <span className="text-gray-500 text-xs">
          {new Date(row.created_at).toLocaleString('fr-FR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'is_read',
      header: 'Statut',
      render: (row) => (
        <span
          className={cn(
            'badge',
            !row.is_read && 'bg-red-100 text-red-700',
            row.is_read && !row.is_resolved && 'bg-gray-100 text-gray-600',
            row.is_resolved && 'bg-green-100 text-green-700',
          )}
        >
          {!row.is_read ? 'Non lu' : row.is_resolved ? 'Resolu' : 'Lu'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        !row.is_resolved ? (
          <button
            onClick={(e) => handleAck(row.id, e)}
            disabled={ackMutation.isPending}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50"
          >
            <CheckCircle2 size={14} />
            Resoudre
          </button>
        ) : null,
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ---- header ---- */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Centre d&apos;alertes</h1>
          {unreadCount > 0 && (
            <span className="flex items-center justify-center h-6 min-w-[1.5rem] px-1.5 rounded-full bg-danger-500 text-white text-xs font-bold">
              {unreadCount}
            </span>
          )}
        </div>

        {/* filters */}
        <div className="flex items-center gap-3">
          <Filter size={16} className="text-gray-400" />

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Toutes severites</option>
            {ALL_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">Tous types</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ---- table ---- */}
      <DataTable<Alert>
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="Aucune alerte correspondant aux filtres."
        keyExtractor={(row) => row.id}
      />
    </div>
  );
}
