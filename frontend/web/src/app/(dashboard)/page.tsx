'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Mountain,
  Bell,
  Pickaxe,
  Brain,
  TrendingUp,
  TrendingDown,
  ArrowRight,
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
  Legend,
} from 'recharts';
import Link from 'next/link';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '@/lib/api';
import type { Alert } from '@/types';

/* -------------------------------------------------------------------------- */
/*  Stat Card                                                                  */
/* -------------------------------------------------------------------------- */

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

function StatCard({ title, value, change, icon: Icon, iconColor, iconBg }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {change !== undefined && (
        <div className="flex items-center gap-1 text-sm">
          {change >= 0 ? (
            <TrendingUp className="w-4 h-4 text-primary-500" />
          ) : (
            <TrendingDown className="w-4 h-4 text-danger-500" />
          )}
          <span className={change >= 0 ? 'text-primary-600' : 'text-danger-600'}>
            {change >= 0 ? '+' : ''}
            {change}%
          </span>
          <span className="text-gray-400">vs mois dernier</span>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Severity badge                                                             */
/* -------------------------------------------------------------------------- */

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    CRITICAL: 'badge-danger',
    HIGH: 'bg-orange-100 text-orange-800 badge',
    MEDIUM: 'badge-warning',
    LOW: 'badge-info',
  };
  return <span className={styles[severity] || 'badge-info'}>{severity}</span>;
}

/* -------------------------------------------------------------------------- */
/*  Dashboard Page                                                             */
/* -------------------------------------------------------------------------- */

// Placeholder data for charts
const detectionData = [
  { month: 'Jan', detections: 12 },
  { month: 'Fev', detections: 19 },
  { month: 'Mar', detections: 15 },
  { month: 'Avr', detections: 22 },
  { month: 'Mai', detections: 28 },
  { month: 'Jun', detections: 34 },
];

const sitesByStatusData = [
  { status: 'Detecte', count: 45, fill: '#facc15' },
  { status: 'Confirme', count: 32, fill: '#fb923c' },
  { status: 'Actif', count: 18, fill: '#ef4444' },
  { status: 'Escalade', count: 8, fill: '#991b1b' },
  { status: 'Demantele', count: 24, fill: '#22c55e' },
];

export default function DashboardPage() {
  // Fetch dashboard stats
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      try {
        const response = await api.get('/api/v1/dashboard/stats');
        return response.data;
      } catch {
        // Return placeholder data when API is not available
        return {
          totalSites: 127,
          activeAlerts: 23,
          ongoingOperations: 5,
          averageAiScore: 0.87,
          sitesChange: 12,
          alertsChange: -8,
          operationsChange: 3,
          aiScoreChange: 5,
        };
      }
    },
  });

  // Fetch recent alerts
  const { data: recentAlerts } = useQuery({
    queryKey: ['recent-alerts'],
    queryFn: async () => {
      try {
        const response = await api.get('/api/v1/alerts', {
          params: { limit: 5, ordering: '-created_at' },
        });
        return response.data.results as Alert[];
      } catch {
        // Placeholder alerts
        return [
          {
            id: '1',
            title: 'Nouveau site detecte - Zone Bagoue Nord',
            severity: 'HIGH',
            created_at: new Date().toISOString(),
            is_read: false,
            site_name: 'Site BG-042',
          },
          {
            id: '2',
            title: 'Contamination eau detectee - Riviere Bagoe',
            severity: 'CRITICAL',
            created_at: new Date(Date.now() - 3600000).toISOString(),
            is_read: false,
            site_name: 'AquaGuard Station 7',
          },
          {
            id: '3',
            title: 'Transaction or suspecte - Volume anormal',
            severity: 'MEDIUM',
            created_at: new Date(Date.now() - 7200000).toISOString(),
            is_read: true,
            site_name: 'GoldTrack Point 12',
          },
          {
            id: '4',
            title: 'Expansion site confirme - Zone forestiere',
            severity: 'HIGH',
            created_at: new Date(Date.now() - 14400000).toISOString(),
            is_read: true,
            site_name: 'Site BG-038',
          },
          {
            id: '5',
            title: 'Capteur hors ligne - Station meteo',
            severity: 'LOW',
            created_at: new Date(Date.now() - 28800000).toISOString(),
            is_read: true,
            site_name: 'Station M-03',
          },
        ] as unknown as Alert[];
      }
    },
  });

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Tableau de bord</h2>
        <p className="text-sm text-gray-500 mt-1">
          Vue d&apos;ensemble de la surveillance miniere - Region de la Bagoue
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Sites detectes"
          value={stats?.totalSites ?? '--'}
          change={stats?.sitesChange}
          icon={Mountain}
          iconColor="text-primary-600"
          iconBg="bg-primary-100"
        />
        <StatCard
          title="Alertes actives"
          value={stats?.activeAlerts ?? '--'}
          change={stats?.alertsChange}
          icon={Bell}
          iconColor="text-danger-600"
          iconBg="bg-danger-100"
        />
        <StatCard
          title="Operations en cours"
          value={stats?.ongoingOperations ?? '--'}
          change={stats?.operationsChange}
          icon={Pickaxe}
          iconColor="text-warning-600"
          iconBg="bg-warning-100"
        />
        <StatCard
          title="Score IA moyen"
          value={stats?.averageAiScore != null ? `${(stats.averageAiScore * 100).toFixed(0)}%` : '--'}
          change={stats?.aiScoreChange}
          icon={Brain}
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Detections Over Time */}
        <div className="card">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Detections au fil du temps
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={detectionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="detections"
                  name="Detections"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={{ fill: '#16a34a', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sites by Status */}
        <div className="card">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Sites par statut
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sitesByStatusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Bar dataKey="count" name="Nombre de sites" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Alerts Table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">
            Alertes recentes
          </h3>
          <Link
            href="/alerts"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            Voir tout
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-3 px-2 font-medium text-gray-500">Alerte</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Site</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Severite</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentAlerts?.map((alert: any) => (
                <tr
                  key={alert.id}
                  className={`hover:bg-gray-50 transition-colors ${
                    !alert.is_read ? 'bg-primary-50/30' : ''
                  }`}
                >
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      {!alert.is_read && (
                        <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0" />
                      )}
                      <span className="font-medium text-gray-900">{alert.title}</span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-gray-600">{alert.site_name}</td>
                  <td className="py-3 px-2">
                    <SeverityBadge severity={alert.severity} />
                  </td>
                  <td className="py-3 px-2 text-gray-500 whitespace-nowrap">
                    {format(new Date(alert.created_at), 'dd MMM HH:mm', {
                      locale: fr,
                    })}
                  </td>
                </tr>
              ))}
              {!recentAlerts?.length && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-400">
                    Aucune alerte recente
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
