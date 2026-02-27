'use client';

/* ============================================
   /alerts - Centre d'alertes temps reel
   Barre filtres + liste alertes + drawer detail
   + live WebSocket prepend + PATCH acknowledge
   ============================================ */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as Select from '@radix-ui/react-select';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Filter,
  AlertTriangle,
  AlertCircle,
  Info,
  ShieldAlert,
  ChevronDown,
  Check,
  Search,
  X,
  Eye,
  EyeOff,
  RotateCcw,
  Clock,
  MapPin,
  Calendar,
  Layers,
  Play,
  ArrowRight,
  Bell,
  ExternalLink,
} from 'lucide-react';
import { formatDistanceToNow, format, isAfter, isBefore, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import { AlertSeverity, type Alert } from '@/types';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAlertStore } from '@/stores/alertStore';
import { useAuth } from '@/hooks/useAuth';

/* ---------- severite config ---------- */

const SEVERITY_STYLE: Record<string, { cls: string; icon: typeof Info; label: string; color: string }> = {
  [AlertSeverity.LOW]: { cls: 'badge-low', icon: Info, label: 'Faible', color: '#94a3b8' },
  [AlertSeverity.MEDIUM]: { cls: 'badge-medium', icon: AlertTriangle, label: 'Modere', color: '#22d3ee' },
  [AlertSeverity.HIGH]: { cls: 'badge-high', icon: AlertCircle, label: 'Eleve', color: '#fbbf24' },
  [AlertSeverity.CRITICAL]: { cls: 'badge-critical', icon: ShieldAlert, label: 'Critique', color: '#f87171' },
};

const ALL_SEVERITIES = Object.values(AlertSeverity);

const TYPE_LABEL: Record<string, string> = {
  SITE_DETECTED: 'Detection site',
  STATUS_CHANGE: 'Changement statut',
  WATER_QUALITY: 'Qualite eau',
  ESCALATION: 'Escalade',
  SYSTEM: 'Systeme',
};

const TYPE_ICON: Record<string, typeof Info> = {
  SITE_DETECTED: MapPin,
  STATUS_CHANGE: Layers,
  WATER_QUALITY: AlertTriangle,
  ESCALATION: ShieldAlert,
  SYSTEM: Info,
};

/* ---------- composant Select Radix custom ---------- */

function GeoSelect({
  value,
  onValueChange,
  placeholder,
  items,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  items: { value: string; label: string }[];
}) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger
        className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg outline-none
          text-geo-400 transition-all duration-200 hover:border-gold-500/30"
        style={{
          background: 'rgba(30, 41, 59, 0.8)',
          border: '1px solid rgba(148, 163, 184, 0.15)',
        }}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown size={14} className="text-geo-600" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="z-50 rounded-xl p-1 overflow-hidden"
          style={{
            background: 'rgba(30, 41, 59, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(148, 163, 184, 0.12)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport>
            <Select.Item
              value="__all__"
              className="flex items-center gap-2 px-3 py-2 text-sm text-geo-500 rounded-lg outline-none cursor-pointer hover:bg-white/[0.04] data-[highlighted]:bg-white/[0.04]"
            >
              <Select.ItemText>{placeholder}</Select.ItemText>
            </Select.Item>
            {items.map((item) => (
              <Select.Item
                key={item.value}
                value={item.value}
                className="flex items-center gap-2 px-3 py-2 text-sm text-geo-400 rounded-lg outline-none cursor-pointer hover:bg-white/[0.04] data-[highlighted]:bg-white/[0.04]"
              >
                <Select.ItemIndicator>
                  <Check size={14} className="text-gold-400" />
                </Select.ItemIndicator>
                <Select.ItemText>{item.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

/* ---------- composant SearchInput ---------- */

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-geo-600" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none text-geo-400 placeholder:text-geo-700 transition-all duration-200 focus:border-gold-500/30"
        style={{
          background: 'rgba(30, 41, 59, 0.8)',
          border: '1px solid rgba(148, 163, 184, 0.15)',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-geo-600 hover:text-geo-400"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/* ---------- composant DateRangePicker simplifie ---------- */

function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
}: {
  startDate: string;
  endDate: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Calendar size={14} className="text-geo-600 flex-shrink-0" />
      <input
        type="date"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        className="px-2 py-1.5 text-xs rounded-lg outline-none text-geo-400 transition-all"
        style={{
          background: 'rgba(30, 41, 59, 0.8)',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          colorScheme: 'dark',
        }}
      />
      <span className="text-geo-700 text-xs">-</span>
      <input
        type="date"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        className="px-2 py-1.5 text-xs rounded-lg outline-none text-geo-400 transition-all"
        style={{
          background: 'rgba(30, 41, 59, 0.8)',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          colorScheme: 'dark',
        }}
      />
    </div>
  );
}

/* ---------- Mini carte pour le drawer ---------- */

function AlertMiniMap({ latitude, longitude }: { latitude?: number; longitude?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || !latitude || !longitude) return;

    const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`,
      center: [longitude, latitude],
      zoom: 12,
      attributionControl: false,
      interactive: false,
    });

    new maplibregl.Marker({
      color: '#fbbf24',
    })
      .setLngLat([longitude, latitude])
      .addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude]);

  if (!latitude || !longitude) {
    return (
      <div className="h-40 rounded-xl flex items-center justify-center bg-geo-900/40 border border-white/[0.06]">
        <span className="text-xs text-geo-600">Coordonnees non disponibles</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-40 rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(148,163,184,0.1)' }}
    />
  );
}

/* ---------- composant AlertRow ---------- */

function AlertRow({
  alert,
  onClick,
  onAcknowledge,
  isAcking,
}: {
  alert: Alert;
  onClick: () => void;
  onAcknowledge: (id: string, e: React.MouseEvent) => void;
  isAcking: boolean;
}) {
  const severity = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE[AlertSeverity.LOW];
  const SeverityIcon = severity.icon;
  const TypeIcon = TYPE_ICON[alert.type] || Info;
  const isCritical = alert.severity === 'CRITICAL';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20, height: 0 }}
      animate={{ opacity: 1, x: 0, height: 'auto' }}
      exit={{ opacity: 0, x: 20, height: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-4 px-4 py-3.5 rounded-xl cursor-pointer',
        'transition-all duration-200 hover:bg-white/[0.03]',
        !alert.is_read && 'bg-gold-500/[0.02]',
        isCritical && 'border-l-[3px] border-l-danger-500',
        !isCritical && 'border-l-[3px] border-l-transparent',
      )}
      style={{
        borderBottom: '1px solid rgba(148,163,184,0.04)',
      }}
    >
      {/* Pulse rouge pour CRITICAL */}
      {isCritical && !alert.is_read && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px]">
          <div className="absolute inset-0 bg-danger-500 animate-pulse" />
        </div>
      )}

      {/* Icone type */}
      <div
        className={cn(
          'flex-shrink-0 p-2 rounded-lg',
          'transition-colors duration-200',
        )}
        style={{
          background: `${severity.color}10`,
          border: `1px solid ${severity.color}20`,
        }}
      >
        <TypeIcon size={16} style={{ color: severity.color }} />
      </div>

      {/* Contenu principal */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn('inline-flex items-center gap-1', severity.cls)}>
            <SeverityIcon size={10} />
            {severity.label}
          </span>
          {alert.site_name && (
            <span className="text-[11px] text-geo-600 mono">
              {alert.site_name}
            </span>
          )}
          {!alert.is_read && (
            <span className="w-1.5 h-1.5 bg-gold-500 rounded-full shadow-glow-gold" />
          )}
        </div>

        <p className="text-sm font-medium text-geo-400 truncate">
          {alert.title}
        </p>
        <p className="text-xs text-geo-600 truncate mt-0.5" style={{ maxWidth: '600px' }}>
          {alert.description?.slice(0, 100) || ''}
          {(alert.description?.length ?? 0) > 100 ? '...' : ''}
        </p>
      </div>

      {/* Date relative */}
      <div className="flex-shrink-0 text-right">
        <span className="text-[11px] text-geo-600 mono whitespace-nowrap">
          {formatDistanceToNow(new Date(alert.created_at), {
            addSuffix: true,
            locale: fr,
          })}
        </span>
      </div>

      {/* Action acknowledge */}
      {!alert.is_resolved && (
        <button
          onClick={(e) => onAcknowledge(alert.id, e)}
          disabled={isAcking}
          className={cn(
            'flex-shrink-0 p-1.5 rounded-lg transition-all duration-200',
            'text-geo-600 hover:text-gold-400 hover:bg-gold-500/10',
            'opacity-0 group-hover:opacity-100',
            isAcking && 'opacity-50',
          )}
          title="Marquer comme lu"
        >
          <CheckCircle2 size={16} />
        </button>
      )}
    </motion.div>
  );
}

/* ---------- Drawer lateral de detail ---------- */

function AlertDrawer({
  alert,
  open,
  onClose,
}: {
  alert: Alert | null;
  open: boolean;
  onClose: () => void;
}) {
  const { hasRole } = useAuth();
  const isOfficier = hasRole('OFFICIER_GSLOI') || hasRole('ADMIN');

  if (!alert) return null;

  const severity = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE[AlertSeverity.LOW];
  const SeverityIcon = severity.icon;
  const TypeIcon = TYPE_ICON[alert.type] || Info;

  /* Donnees de timeline d'actions mockees */
  const mockTimeline = [
    { action: 'Alerte creee', actor: 'Systeme IA', date: alert.created_at },
    ...(alert.is_read
      ? [{ action: 'Marquee comme lue', actor: 'Analyste', date: alert.updated_at }]
      : []),
    ...(alert.is_resolved && alert.resolved_at
      ? [{ action: 'Resolue', actor: alert.resolved_by || 'Inconnu', date: alert.resolved_at }]
      : []),
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg overflow-y-auto"
            style={{
              background: 'rgba(15, 23, 42, 0.97)',
              backdropFilter: 'blur(24px)',
              borderLeft: '1px solid rgba(148, 163, 184, 0.1)',
            }}
          >
            {/* Header drawer */}
            <div
              className="sticky top-0 z-10 flex items-center justify-between p-4 border-b"
              style={{
                background: 'rgba(15, 23, 42, 0.9)',
                backdropFilter: 'blur(12px)',
                borderColor: 'rgba(148,163,184,0.08)',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded-lg"
                  style={{
                    background: `${severity.color}15`,
                    border: `1px solid ${severity.color}25`,
                  }}
                >
                  <SeverityIcon size={18} style={{ color: severity.color }} />
                </div>
                <div>
                  <span className={cn(severity.cls, 'text-xs')}>
                    {severity.label}
                  </span>
                  <p className="text-xs text-geo-600 mono mt-0.5">
                    ID: {alert.id.slice(0, 8)}...
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-geo-500 hover:text-geo-400 hover:bg-white/[0.04] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corps du drawer */}
            <div className="p-5 space-y-6">
              {/* Titre et description */}
              <div>
                <h2 className="text-lg font-bold text-geo-300 mb-2">
                  {alert.title}
                </h2>
                <p className="text-sm text-geo-500 leading-relaxed">
                  {alert.description || 'Aucune description detaillee disponible.'}
                </p>
              </div>

              {/* Metadonnees */}
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-card !p-3">
                  <p className="text-[10px] text-geo-600 uppercase tracking-wider mb-1">Type</p>
                  <div className="flex items-center gap-1.5">
                    <TypeIcon size={14} className="text-geo-500" />
                    <span className="text-sm text-geo-400 font-medium">
                      {TYPE_LABEL[alert.type] || alert.type}
                    </span>
                  </div>
                </div>
                <div className="glass-card !p-3">
                  <p className="text-[10px] text-geo-600 uppercase tracking-wider mb-1">Site</p>
                  {alert.site_id ? (
                    <Link
                      href={`/sites/${alert.site_id}`}
                      className="text-sm text-gold-400 hover:text-gold-300 font-medium flex items-center gap-1"
                    >
                      {alert.site_name || alert.site_id}
                      <ExternalLink size={11} />
                    </Link>
                  ) : (
                    <span className="text-sm text-geo-500">--</span>
                  )}
                </div>
                <div className="glass-card !p-3">
                  <p className="text-[10px] text-geo-600 uppercase tracking-wider mb-1">Cree le</p>
                  <span className="text-sm text-geo-400 mono">
                    {format(new Date(alert.created_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                  </span>
                </div>
                <div className="glass-card !p-3">
                  <p className="text-[10px] text-geo-600 uppercase tracking-wider mb-1">Statut</p>
                  <span className={cn(
                    alert.is_resolved ? 'text-gold-400' : alert.is_read ? 'text-gold-400' : 'text-danger-400',
                    'text-sm font-medium',
                  )}>
                    {alert.is_resolved ? 'Resolu' : alert.is_read ? 'Lu' : 'Non lu'}
                  </span>
                </div>
              </div>

              {/* Mini carte centree */}
              <div>
                <h3 className="text-sm font-semibold text-geo-400 mb-2">Localisation</h3>
                <AlertMiniMap latitude={alert.latitude} longitude={alert.longitude} />
              </div>

              {/* Timeline des actions */}
              <div>
                <h3 className="text-sm font-semibold text-geo-400 mb-3">Historique</h3>
                <div className="relative">
                  <div
                    className="absolute left-2.5 top-2 bottom-2 w-px"
                    style={{
                      background: 'linear-gradient(180deg, rgba(251,191,36,0.3), rgba(148,163,184,0.1))',
                    }}
                  />
                  <div className="space-y-4">
                    {mockTimeline.map((entry, idx) => (
                      <div key={idx} className="relative pl-8">
                        <div
                          className={cn(
                            'absolute left-1 top-1 w-3 h-3 rounded-full border-2',
                            idx === 0 ? 'bg-gold-500 border-gold-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]' : 'bg-geo-700 border-geo-600',
                          )}
                        />
                        <p className="text-sm text-geo-400 font-medium">{entry.action}</p>
                        <div className="flex items-center gap-2 text-xs text-geo-600 mt-0.5">
                          <span>{entry.actor}</span>
                          <span>-</span>
                          <span className="mono">
                            {format(new Date(entry.date), 'dd MMM HH:mm', { locale: fr })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions selon role */}
              {isOfficier && (
                <div className="pt-2 border-t border-white/[0.06]">
                  <Link
                    href={alert.site_id ? `/sites/${alert.site_id}` : '#'}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <Play size={16} />
                    Creer Operation
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ---------- composant page principale ---------- */

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();

  /* WebSocket live */
  useWebSocket();
  const alertStoreAlerts = useAlertStore((s) => s.alerts);

  /* Filtres */
  const [severityFilter, setSeverityFilter] = useState<string>('__all__');
  const [searchText, setSearchText] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  /* Drawer */
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* Donnees */
  const { data: apiAlerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ['alerts'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/v1/alerts');
        return res.data.results || res.data;
      } catch {
        /* Donnees de demonstration */
        return [
          {
            id: 'a1', title: 'Nouveau site detecte - Zone Bagoue Nord',
            description: 'Un nouveau site minier illegal a ete detecte par satellite Sentinel-2 dans la zone nord de la region Bagoue. Surface estimee : 3.2 hectares.',
            severity: 'CRITICAL', type: 'SITE_DETECTED',
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            is_read: false, is_resolved: false,
            site_name: 'Site BG-042', site_id: 'bg-042',
            latitude: 9.75, longitude: -6.42,
          },
          {
            id: 'a2', title: 'Contamination eau detectee - Riviere Bagoe',
            description: 'Niveaux de mercure 5x au-dessus du seuil critique detectes par la station AquaGuard 7. Intervention immediate recommandee.',
            severity: 'CRITICAL', type: 'WATER_QUALITY',
            created_at: new Date(Date.now() - 1_800_000).toISOString(), updated_at: new Date(Date.now() - 1_800_000).toISOString(),
            is_read: false, is_resolved: false,
            site_name: 'AquaGuard Station 7', site_id: 'aq-007',
            latitude: 9.80, longitude: -6.35,
          },
          {
            id: 'a3', title: 'Expansion rapide site BG-038',
            description: 'Le site BG-038 a augmente de 2.3 hectares sur les 30 derniers jours. Taux de croissance anormalement eleve.',
            severity: 'HIGH', type: 'STATUS_CHANGE',
            created_at: new Date(Date.now() - 3_600_000).toISOString(), updated_at: new Date(Date.now() - 3_600_000).toISOString(),
            is_read: false, is_resolved: false,
            site_name: 'Site BG-038', site_id: 'bg-038',
            latitude: 9.65, longitude: -6.50,
          },
          {
            id: 'a4', title: 'Transaction or suspecte - Volume anormal',
            description: 'Volume de transaction 3 fois superieur a la moyenne au point GoldTrack 12. Verification necessaire.',
            severity: 'HIGH', type: 'ESCALATION',
            created_at: new Date(Date.now() - 7_200_000).toISOString(), updated_at: new Date(Date.now() - 3_600_000).toISOString(),
            is_read: true, is_resolved: false,
            site_name: 'GoldTrack Point 12', site_id: 'gt-012',
            latitude: 7.40, longitude: -7.10,
          },
          {
            id: 'a5', title: 'Mouvement vehicules suspects zone forestiere',
            description: 'Detection de mouvements vehiculaires inhabituels a proximite de la zone protegee de Korhogo.',
            severity: 'MEDIUM', type: 'SITE_DETECTED',
            created_at: new Date(Date.now() - 14_400_000).toISOString(), updated_at: new Date(Date.now() - 14_400_000).toISOString(),
            is_read: true, is_resolved: false,
            site_name: 'Zone Korhogo', site_id: 'kr-001',
            latitude: 9.45, longitude: -5.62,
          },
          {
            id: 'a6', title: 'Score IA mis a jour - Confiance elevee',
            description: 'Le modele SegFormer-B4 a mis a jour le score de confiance pour 12 sites dans la region Tonkpi.',
            severity: 'LOW', type: 'SYSTEM',
            created_at: new Date(Date.now() - 28_800_000).toISOString(), updated_at: new Date(Date.now() - 28_800_000).toISOString(),
            is_read: true, is_resolved: true,
            site_name: 'Systeme IA',
            resolved_at: new Date(Date.now() - 20_000_000).toISOString(),
            resolved_by: 'Auto',
          },
          {
            id: 'a7', title: 'Capteur hors ligne - Station AquaGuard 3',
            description: 'La station AquaGuard 3 ne repond plus depuis 6 heures. Verification terrain requise.',
            severity: 'MEDIUM', type: 'SYSTEM',
            created_at: new Date(Date.now() - 43_200_000).toISOString(), updated_at: new Date(Date.now() - 43_200_000).toISOString(),
            is_read: true, is_resolved: false,
            site_name: 'Station AQ-003',
          },
          {
            id: 'a8', title: 'Changement statut site BG-015 vers Demantele',
            description: 'Le site BG-015 a ete marque comme demantele suite a l\'operation terrain du 18 fevrier.',
            severity: 'LOW', type: 'STATUS_CHANGE',
            created_at: new Date(Date.now() - 86_400_000).toISOString(), updated_at: new Date(Date.now() - 86_400_000).toISOString(),
            is_read: true, is_resolved: true,
            site_name: 'Site BG-015', site_id: 'bg-015',
            resolved_at: new Date(Date.now() - 80_000_000).toISOString(),
            resolved_by: 'Agent Kouadio',
          },
        ] as Alert[];
      }
    },
    refetchInterval: 30_000,
  });

  /* Fusionner alertes WebSocket + API (deduplication) */
  const allAlerts = useMemo(() => {
    const map = new Map<string, Alert>();
    apiAlerts.forEach((a) => map.set(a.id, a));
    alertStoreAlerts.forEach((a) => {
      if (!map.has(a.id)) map.set(a.id, a);
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [apiAlerts, alertStoreAlerts]);

  /* Compteur non lus */
  const unreadCount = useMemo(
    () => allAlerts.filter((a) => !a.is_read).length,
    [allAlerts],
  );

  /* Filtrage */
  const filtered = useMemo(() => {
    let list = allAlerts;

    if (severityFilter && severityFilter !== '__all__') {
      list = list.filter((a) => a.severity === severityFilter);
    }

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q) ||
          a.site_name?.toLowerCase().includes(q),
      );
    }

    if (showUnreadOnly) {
      list = list.filter((a) => !a.is_read);
    }

    if (startDate) {
      list = list.filter((a) => isAfter(parseISO(a.created_at), parseISO(startDate)));
    }

    if (endDate) {
      const endPlusDay = new Date(endDate);
      endPlusDay.setDate(endPlusDay.getDate() + 1);
      list = list.filter((a) => isBefore(parseISO(a.created_at), endPlusDay));
    }

    return list;
  }, [allAlerts, severityFilter, searchText, showUnreadOnly, startDate, endDate]);

  /* Mutation PATCH acknowledge (optimistic) */
  const ackMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/alerts/${id}/acknowledge`),
    onMutate: async (id) => {
      /* Optimistic update : marquer lu instantanement */
      await queryClient.cancelQueries({ queryKey: ['alerts'] });
      const prev = queryClient.getQueryData<Alert[]>(['alerts']);
      queryClient.setQueryData<Alert[]>(['alerts'], (old) =>
        old?.map((a) => (a.id === id ? { ...a, is_read: true } : a)) ?? [],
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['alerts'], ctx.prev);
    },
    onSettled: () => {
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

  /* Ouvrir drawer */
  const openDrawer = useCallback((alert: Alert) => {
    setSelectedAlert(alert);
    setDrawerOpen(true);
    /* Marquer lu automatiquement si pas lu */
    if (!alert.is_read) {
      ackMutation.mutate(alert.id);
    }
  }, [ackMutation]);

  /* Reset filtres */
  const resetFilters = useCallback(() => {
    setSeverityFilter('__all__');
    setSearchText('');
    setShowUnreadOnly(false);
    setStartDate('');
    setEndDate('');
  }, []);

  const hasActiveFilters = severityFilter !== '__all__' || searchText || showUnreadOnly || startDate || endDate;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* ===== EN-TETE ===== */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-danger-500/10 border border-danger-500/20">
            <Bell size={22} className="text-danger-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-geo-300">Centre d&apos;alertes</h1>
            <p className="text-xs text-geo-600 mt-0.5">
              {filtered.length} alerte{filtered.length > 1 ? 's' : ''} affichee{filtered.length > 1 ? 's' : ''}
            </p>
          </div>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex items-center justify-center h-7 min-w-[1.75rem] px-2 rounded-full bg-danger-500/20 text-danger-400 border border-danger-500/30 text-xs font-bold"
            >
              {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
            </motion.span>
          )}
        </div>
      </div>

      {/* ===== BARRE DE FILTRES ===== */}
      <div
        className="flex flex-wrap items-center gap-3 p-3 rounded-xl"
        style={{
          background: 'rgba(15, 23, 42, 0.5)',
          border: '1px solid rgba(148, 163, 184, 0.06)',
        }}
      >
        <Filter size={16} className="text-geo-600 flex-shrink-0" />

        {/* Select severite */}
        <GeoSelect
          value={severityFilter}
          onValueChange={setSeverityFilter}
          placeholder="Toutes severites"
          items={ALL_SEVERITIES.map((s) => ({
            value: s,
            label: SEVERITY_STYLE[s]?.label ?? s,
          }))}
        />

        {/* Date range */}
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
        />

        {/* Recherche texte */}
        <div className="w-56">
          <SearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder="Rechercher..."
          />
        </div>

        {/* Toggle non lues */}
        <button
          onClick={() => setShowUnreadOnly(!showUnreadOnly)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg transition-all duration-200',
            showUnreadOnly
              ? 'bg-gold-500/15 text-gold-400 border border-gold-500/30'
              : 'text-geo-500 hover:text-geo-400',
          )}
          style={
            !showUnreadOnly
              ? { background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(148,163,184,0.15)' }
              : undefined
          }
        >
          {showUnreadOnly ? <EyeOff size={13} /> : <Eye size={13} />}
          Non lues
        </button>

        {/* Reset */}
        {hasActiveFilters && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={resetFilters}
            className="flex items-center gap-1 px-2.5 py-2 text-xs text-danger-400 hover:text-danger-300 rounded-lg hover:bg-danger-500/10 transition-all"
          >
            <RotateCcw size={12} />
            Reinitialiser
          </motion.button>
        )}
      </div>

      {/* ===== LISTE DES ALERTES ===== */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(15, 23, 42, 0.4)',
          border: '1px solid rgba(148, 163, 184, 0.06)',
        }}
      >
        {isLoading ? (
          /* Skeleton loading */
          <div className="space-y-1 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-4">
                <div className="h-9 w-9 shimmer-bg rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 shimmer-bg rounded" />
                  <div className="h-4 w-64 shimmer-bg rounded" />
                  <div className="h-3 w-96 shimmer-bg rounded" />
                </div>
                <div className="h-3 w-20 shimmer-bg rounded flex-shrink-0" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Bell size={40} className="text-geo-700" />
            <p className="text-sm text-geo-600">
              Aucune alerte correspondant aux filtres.
            </p>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="text-xs text-gold-400 hover:text-gold-300 flex items-center gap-1"
              >
                <RotateCcw size={12} />
                Reinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onClick={() => openDrawer(alert)}
                onAcknowledge={handleAck}
                isAcking={ackMutation.isPending}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ===== DRAWER DETAIL ===== */}
      <AlertDrawer
        alert={selectedAlert}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
