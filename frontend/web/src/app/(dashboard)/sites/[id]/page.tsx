'use client';

/* ============================================
   /sites/[id] - Fiche site detaillee 3 colonnes
   Gauche : carte mini zoom 12 + polygone + buffer + H3
   Centre : header + meta + timeline + evidence
   Droite : blockchain + alertes liees + operations + actions role
   ============================================ */

import { useRef, useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// @ts-ignore - @turf/turf types not resolved with package.json exports
import * as turf from '@turf/turf';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  MapPin,
  Satellite,
  Calendar,
  Layers,
  ShieldCheck,
  Upload,
  Play,
  ChevronDown,
  X,
  Copy,
  Check,
  ExternalLink,
  Bell,
  Fingerprint,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Info,
  FileBarChart,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Gem,
  Users,
  Hexagon,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import SiteTimeline from '@/components/sites/SiteTimeline';
import SiteEvidence from '@/components/sites/SiteEvidence';
import { useAuth } from '@/hooks/useAuth';
import {
  SiteStatus,
  type MiningSite,
  type Alert,
  type Operation,
} from '@/types';

/* ---------- config affichage statut ---------- */

const STATUS_STYLES: Record<string, string> = {
  [SiteStatus.DETECTED]: 'badge-high',
  [SiteStatus.CONFIRMED]: 'badge-warning',
  [SiteStatus.ACTIVE]: 'badge-critical',
  [SiteStatus.ESCALATED]: 'badge-danger',
  [SiteStatus.UNDER_OPERATION]: 'badge-medium',
  [SiteStatus.DISMANTLED]: 'badge-success',
  [SiteStatus.REHABILITATED]: 'badge-info',
  [SiteStatus.MONITORING]: 'badge-info',
};

const STATUS_LABEL: Record<string, string> = {
  [SiteStatus.DETECTED]: 'Detecte',
  [SiteStatus.CONFIRMED]: 'Confirme',
  [SiteStatus.ACTIVE]: 'Actif',
  [SiteStatus.ESCALATED]: 'Escalade',
  [SiteStatus.UNDER_OPERATION]: 'En operation',
  [SiteStatus.DISMANTLED]: 'Demantele',
  [SiteStatus.REHABILITATED]: 'Rehabilite',
  [SiteStatus.MONITORING]: 'Surveillance',
};

const SEVERITY_STYLE: Record<string, { cls: string; icon: typeof Info; label: string }> = {
  LOW: { cls: 'badge-low', icon: Info, label: 'Faible' },
  MEDIUM: { cls: 'badge-medium', icon: AlertTriangle, label: 'Modere' },
  HIGH: { cls: 'badge-high', icon: AlertCircle, label: 'Eleve' },
  CRITICAL: { cls: 'badge-critical', icon: ShieldAlert, label: 'Critique' },
};

/* ---------- types locaux ---------- */

interface StatusChangeEntry {
  id: string;
  site_id: string;
  from_status: SiteStatus | null;
  to_status: SiteStatus;
  changed_by: string;
  changed_at: string;
  note?: string;
}

interface EvidenceEntry {
  id: string;
  site_id: string;
  filename: string;
  file_type: string;
  file_url: string;
  thumbnail_url?: string;
  sha256_hash: string;
  cid_ipfs?: string;
  ipfs_gateway_url?: string;
  blockchain_tx_id?: string;
  uploaded_at: string;
  uploaded_by: string;
  verification_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
}

interface BlockchainRecord {
  tx_id: string;
  timestamp: string;
  sha256_hash: string;
  channel: string;
  block_number: number;
}

/* ---------- CopyButton ---------- */

function CopyButton({ text, className: cls }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silencieux */ }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={cn('p-1 rounded text-geo-600 hover:text-gold-400 transition-colors', cls)}
      title="Copier"
    >
      {copied ? <Check size={12} className="text-gold-400" /> : <Copy size={12} />}
    </button>
  );
}

/* ---------- Mini carte site avec polygone + buffer + H3 ---------- */

function SiteMiniMap({
  latitude,
  longitude,
  areaHectares,
}: {
  latitude: number;
  longitude: number;
  areaHectares: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '';

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
      center: [longitude, latitude],
      zoom: 12,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    map.on('load', () => {
      /* Marqueur site */
      new maplibregl.Marker({ color: '#fbbf24' })
        .setLngLat([longitude, latitude])
        .addTo(map);

      /* Polygone site (cercle approxime selon surface) */
      const radiusKm = Math.sqrt((areaHectares * 0.01) / Math.PI);
      const siteCircle = turf.circle(
        [longitude, latitude],
        radiusKm,
        { steps: 64, units: 'kilometers' }
      );

      map.addSource('site-polygon', {
        type: 'geojson',
        data: siteCircle,
      });

      map.addLayer({
        id: 'site-polygon-fill',
        type: 'fill',
        source: 'site-polygon',
        paint: {
          'fill-color': '#ef4444',
          'fill-opacity': 0.15,
        },
      });

      map.addLayer({
        id: 'site-polygon-outline',
        type: 'line',
        source: 'site-polygon',
        paint: {
          'line-color': '#ef4444',
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      });

      /* Buffer 1km */
      const bufferCircle = turf.circle(
        [longitude, latitude],
        1,
        { steps: 64, units: 'kilometers' }
      );

      map.addSource('buffer-1km', {
        type: 'geojson',
        data: bufferCircle,
      });

      map.addLayer({
        id: 'buffer-1km-fill',
        type: 'fill',
        source: 'buffer-1km',
        paint: {
          'fill-color': '#fbbf24',
          'fill-opacity': 0.06,
        },
      });

      map.addLayer({
        id: 'buffer-1km-outline',
        type: 'line',
        source: 'buffer-1km',
        paint: {
          'line-color': '#fbbf24',
          'line-width': 1.5,
          'line-opacity': 0.4,
          'line-dasharray': [4, 4],
        },
      });

      /* Hexagone H3 fictif (secteur) - dessin geometrique */
      const hexRadius = 1.5; // km
      const hexPoints: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const dx = (hexRadius / 111.32) * Math.cos(angle);
        const dy = (hexRadius / (111.32 * Math.cos((latitude * Math.PI) / 180))) * Math.sin(angle);
        hexPoints.push([longitude + dy, latitude + dx]);
      }
      hexPoints.push(hexPoints[0]); // Fermer le polygone

      map.addSource('h3-hex', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [hexPoints],
          },
          properties: {},
        },
      });

      map.addLayer({
        id: 'h3-hex-fill',
        type: 'fill',
        source: 'h3-hex',
        paint: {
          'fill-color': '#8b5cf6',
          'fill-opacity': 0.06,
        },
      });

      map.addLayer({
        id: 'h3-hex-outline',
        type: 'line',
        source: 'h3-hex',
        paint: {
          'line-color': '#8b5cf6',
          'line-width': 1.5,
          'line-opacity': 0.4,
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude, areaHectares]);

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Legende carte */}
      <div
        className="absolute bottom-2 left-2 right-2 flex items-center gap-3 px-3 py-2 rounded-lg text-[10px]"
        style={{
          background: 'rgba(15,23,42,0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(148,163,184,0.08)',
        }}
      >
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-red-500/30 border border-red-500/50" />
          <span className="text-geo-500">Site</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-gold-500/20 border border-gold-500/40" />
          <span className="text-geo-500">Buffer 1km</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-violet-500/20 border border-violet-500/40" />
          <span className="text-geo-500">H3 Secteur</span>
        </span>
      </div>
    </div>
  );
}

/* ---------- composant page ---------- */

export default function SiteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const siteId = params.id;

  /* Auth et roles */
  const { hasRole } = useAuth();
  const isAnalyste = hasRole('ANALYST') || hasRole('ANALYSTE') || hasRole('ADMIN');
  const isOfficier = hasRole('OFFICIER_GSLOI') || hasRole('AUTHORITY') || hasRole('ADMIN');

  /* ---------- data ---------- */

  const { data: site, isLoading: siteLoading } = useQuery<MiningSite>({
    queryKey: ['site', siteId],
    queryFn: async () => {
      try {
        return (await api.get(`/api/v1/sites/${siteId}`)).data;
      } catch {
        /* Donnees de demonstration */
        return {
          id: siteId,
          name: `Site BG-${siteId?.slice(-3) || '042'}`,
          status: SiteStatus.ACTIVE,
          latitude: 9.75,
          longitude: -6.42,
          area_hectares: 3.2,
          detection_date: '2025-11-15T10:30:00Z',
          last_updated: '2026-02-20T14:00:00Z',
          ai_confidence_score: 0.92,
          detection_source: 'Sentinel-2',
          region: 'Bagoue',
          department: 'Boundiali',
          commune: 'Ganaoni',
          description: 'Site minier illegal detecte par imagerie satellite. Activite confirmee par survol drone.',
          estimated_workers: 45,
          environmental_impact_score: 0.78,
        } as MiningSite;
      }
    },
    enabled: !!siteId,
  });

  const { data: timeline = [] } = useQuery<StatusChangeEntry[]>({
    queryKey: ['site', siteId, 'timeline'],
    queryFn: async () => {
      try {
        return (await api.get(`/api/v1/sites/${siteId}/timeline`)).data;
      } catch {
        return [
          { id: 't1', site_id: siteId!, from_status: null, to_status: SiteStatus.DETECTED, changed_by: 'IA SegFormer', changed_at: '2025-11-15T10:30:00Z', note: 'Detection automatique Sentinel-2' },
          { id: 't2', site_id: siteId!, from_status: SiteStatus.DETECTED, to_status: SiteStatus.CONFIRMED, changed_by: 'Analyste Kone', changed_at: '2025-11-20T09:15:00Z', note: 'Confirme par analyse visuelle haute resolution' },
          { id: 't3', site_id: siteId!, from_status: SiteStatus.CONFIRMED, to_status: SiteStatus.ACTIVE, changed_by: 'Systeme', changed_at: '2025-12-05T16:00:00Z', note: 'Activite miniere continue detectee' },
          { id: 't4', site_id: siteId!, from_status: SiteStatus.ACTIVE, to_status: SiteStatus.ESCALATED, changed_by: 'Officier Traore', changed_at: '2026-01-10T11:30:00Z', note: 'Escalade vers autorites regionales' },
        ] as StatusChangeEntry[];
      }
    },
    enabled: !!siteId,
  });

  const { data: evidence = [], refetch: refetchEvidence } = useQuery<EvidenceEntry[]>({
    queryKey: ['site', siteId, 'evidence'],
    queryFn: async () => {
      try {
        return (await api.get(`/api/v1/sites/${siteId}/evidence`)).data;
      } catch {
        return [
          {
            id: 'e1', site_id: siteId!, filename: 'sentinel2_20251115.tif', file_type: 'image/tiff',
            file_url: '/mock/sentinel2.tif', sha256_hash: 'a3f2b8c1d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678',
            cid_ipfs: 'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
            ipfs_gateway_url: 'https://ipfs.io/ipfs/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
            blockchain_tx_id: '0x8f4e2b1c3d5a6e7f9b0c1d2e3f4a5b6c7d8e9f0a',
            uploaded_at: '2025-11-15T11:00:00Z', uploaded_by: 'IA Pipeline', verification_status: 'VERIFIED',
          },
          {
            id: 'e2', site_id: siteId!, filename: 'drone_photo_001.jpg', file_type: 'image/jpeg',
            file_url: '/mock/drone_001.jpg', sha256_hash: 'b4c3d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3',
            cid_ipfs: 'QmYwAPJzv5CZsnAzt8auVTLmLCy7HRBzRPSoHFQxZMJuNt',
            uploaded_at: '2025-12-01T08:30:00Z', uploaded_by: 'Agent Diabate', verification_status: 'VERIFIED',
          },
          {
            id: 'e3', site_id: siteId!, filename: 'rapport_terrain_dec.pdf', file_type: 'application/pdf',
            file_url: '/mock/rapport.pdf', sha256_hash: 'c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5',
            uploaded_at: '2025-12-10T15:45:00Z', uploaded_by: 'Officier Traore', verification_status: 'PENDING',
          },
        ] as EvidenceEntry[];
      }
    },
    enabled: !!siteId,
  });

  const { data: blockchain } = useQuery<BlockchainRecord>({
    queryKey: ['site', siteId, 'blockchain'],
    queryFn: async () => {
      try {
        return (await api.get(`/api/v1/sites/${siteId}/blockchain`)).data;
      } catch {
        return {
          tx_id: '0x8f4e2b1c3d5a6e7f9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1',
          timestamp: '2025-11-15T10:35:00Z',
          sha256_hash: 'a3f2b8c1d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678',
          channel: 'geominer-evidence',
          block_number: 1847,
        } as BlockchainRecord;
      }
    },
    enabled: !!siteId,
  });

  const { data: siteAlerts = [] } = useQuery<Alert[]>({
    queryKey: ['site', siteId, 'alerts'],
    queryFn: async () => {
      try {
        return (await api.get(`/api/v1/alerts`, { params: { site_id: siteId, limit: 5, ordering: '-created_at' } })).data?.results || [];
      } catch {
        return [
          { id: 'sa1', title: 'Expansion site detectee', severity: 'HIGH', type: 'STATUS_CHANGE', created_at: '2026-02-18T09:00:00Z', updated_at: '2026-02-18T09:00:00Z', is_read: true, is_resolved: false, description: '' },
          { id: 'sa2', title: 'Contamination mercure riviere', severity: 'CRITICAL', type: 'WATER_QUALITY', created_at: '2026-02-15T14:30:00Z', updated_at: '2026-02-15T14:30:00Z', is_read: true, is_resolved: false, description: '' },
          { id: 'sa3', title: 'Mouvement vehicules suspects', severity: 'MEDIUM', type: 'SITE_DETECTED', created_at: '2026-02-10T07:00:00Z', updated_at: '2026-02-10T07:00:00Z', is_read: true, is_resolved: true, description: '' },
        ] as Alert[];
      }
    },
    enabled: !!siteId,
  });

  const { data: siteOperations = [] } = useQuery<Operation[]>({
    queryKey: ['site', siteId, 'operations'],
    queryFn: async () => {
      try {
        return (await api.get(`/api/v1/operations`, { params: { site_id: siteId } })).data?.results || [];
      } catch {
        return [
          {
            id: 'op1', name: 'Operation Bagoe-Nord', status: 'IN_PROGRESS', type: 'DISMANTLEMENT',
            site_ids: [siteId!], description: 'Operation de demantelement', start_date: '2026-02-20T06:00:00Z',
            commander: 'Col. Ouattara', team_size: 15, authority: 'Prefecture Boundiali',
            objectives: ['Demantelement equipements'], created_at: '2026-02-18T10:00:00Z', updated_at: '2026-02-20T06:00:00Z',
          },
        ] as Operation[];
      }
    },
    enabled: !!siteId,
  });

  /* Mutation changement statut */
  const statusMutation = useMutation({
    mutationFn: (newStatus: SiteStatus) =>
      api.patch(`/api/v1/sites/${siteId}/status`, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      queryClient.invalidateQueries({ queryKey: ['site', siteId, 'timeline'] });
    },
  });

  /* Calculs derives */
  const confidencePct = site ? Math.round(site.ai_confidence_score * 100) : 0;
  const fillClass =
    confidencePct >= 80
      ? 'ai-score-fill-high'
      : confidencePct >= 50
        ? 'ai-score-fill-medium'
        : 'ai-score-fill-low';

  const estimatedGold = site ? (site.area_hectares * 0.12).toFixed(2) : '0';

  /* ---------- loading ---------- */

  if (siteLoading || !site) {
    return (
      <div className="max-w-[1400px] mx-auto">
        <div className="space-y-6">
          <div className="h-8 shimmer-bg rounded w-1/3" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="h-[500px] shimmer-bg rounded-xl" />
            <div className="space-y-4">
              <div className="h-20 shimmer-bg rounded-xl" />
              <div className="h-40 shimmer-bg rounded-xl" />
              <div className="h-60 shimmer-bg rounded-xl" />
            </div>
            <div className="space-y-4">
              <div className="h-32 shimmer-bg rounded-xl" />
              <div className="h-48 shimmer-bg rounded-xl" />
              <div className="h-32 shimmer-bg rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Retour */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-geo-500 hover:text-geo-400 transition-colors"
      >
        <ArrowLeft size={16} />
        Retour
      </button>

      {/* ============================================================
          LAYOUT 3 COLONNES
          ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ===== COLONNE GAUCHE 1/3 : Carte ===== */}
        <div className="lg:col-span-1">
          <div
            className="rounded-xl overflow-hidden sticky top-20"
            style={{
              height: 'calc(100vh - 8rem)',
              border: '1px solid rgba(148,163,184,0.1)',
            }}
          >
            <SiteMiniMap
              latitude={site.latitude}
              longitude={site.longitude}
              areaHectares={site.area_hectares}
            />
          </div>
        </div>

        {/* ===== COLONNE CENTRE 1/3 : Infos principales ===== */}
        <div className="lg:col-span-1 space-y-5">

          {/* Header : code + status + confidence */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h1 className="text-xl font-bold text-geo-300">{site.name}</h1>
                <p className="text-xs text-geo-600 mono mt-0.5">
                  {site.latitude.toFixed(4)}°N, {Math.abs(site.longitude).toFixed(4)}°W
                </p>
              </div>
              <span className={cn('text-sm', STATUS_STYLES[site.status])}>
                {STATUS_LABEL[site.status]}
              </span>
            </div>

            {/* Barre de confiance gradient */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-geo-600 whitespace-nowrap">Confiance IA</span>
              <div className="flex-1 confidence-bar">
                <div className={fillClass} style={{ width: `${confidencePct}%` }} />
              </div>
              <span className="text-sm font-bold text-geo-300 mono">{confidencePct}%</span>
            </div>
          </motion.div>

          {/* Meta-donnees */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass-card space-y-3"
          >
            <h3 className="text-sm font-semibold text-geo-400 mb-2">Informations</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-geo-600 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-geo-600">Region</p>
                  <p className="text-sm font-medium text-geo-400">{site.region}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-geo-600 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-geo-600">Departement</p>
                  <p className="text-sm font-medium text-geo-400">{site.department}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-geo-600 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-geo-600">Surface</p>
                  <p className="text-sm font-medium text-geo-400">{site.area_hectares.toFixed(2)} ha</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-geo-600 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-geo-600">Date detection</p>
                  <p className="text-sm font-medium text-geo-400 mono">
                    {format(new Date(site.detection_date), 'dd MMM yyyy', { locale: fr })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Satellite size={14} className="text-geo-600 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-geo-600">Source</p>
                  <p className="text-sm font-medium text-geo-400">{site.detection_source}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Gem size={14} className="text-geo-600 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-geo-600">Or estime</p>
                  <p className="text-sm font-medium text-gold-400">~{estimatedGold} T</p>
                </div>
              </div>
              {site.estimated_workers && (
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-geo-600 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-geo-600">Travailleurs est.</p>
                    <p className="text-sm font-medium text-geo-400">{site.estimated_workers}</p>
                  </div>
                </div>
              )}
              {site.environmental_impact_score && (
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-geo-600 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-geo-600">Impact enviro.</p>
                    <p className={cn(
                      'text-sm font-medium',
                      site.environmental_impact_score > 0.7 ? 'text-danger-400' : 'text-gold-400',
                    )}>
                      {(site.environmental_impact_score * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              )}
            </div>

            {site.description && (
              <p className="text-xs text-geo-500 pt-2 border-t border-white/[0.04]">
                {site.description}
              </p>
            )}
          </motion.div>

          {/* Timeline des statuts */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card"
          >
            <h3 className="text-sm font-semibold text-geo-400 mb-4">
              Historique des statuts
            </h3>
            <SiteTimeline
              changes={timeline}
              currentStatus={site.status}
            />
          </motion.div>

          {/* Preuves & documents */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass-card"
          >
            <h3 className="text-sm font-semibold text-geo-400 mb-4">
              Preuves & documents
            </h3>
            <SiteEvidence
              evidence={evidence}
              siteId={siteId}
              onUploadComplete={() => refetchEvidence()}
            />
          </motion.div>
        </div>

        {/* ===== COLONNE DROITE 1/3 : Blockchain + Alertes + Operations + Actions ===== */}
        <div className="lg:col-span-1 space-y-5">

          {/* Box Blockchain */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass-card"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg bg-gold-500/10 border border-gold-500/20">
                <Fingerprint size={16} className="text-gold-400" />
              </div>
              <h3 className="text-sm font-semibold text-geo-400">Blockchain</h3>
            </div>

            {blockchain ? (
              <div className="space-y-3">
                {/* TxID */}
                <div>
                  <p className="text-[10px] text-geo-600 uppercase tracking-wider mb-1">Transaction ID</p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="flex-1 text-[11px] mono text-geo-500 truncate px-2 py-1.5 rounded-lg"
                      style={{ background: 'rgba(15,23,42,0.5)' }}
                      title={blockchain.tx_id}
                    >
                      {blockchain.tx_id}
                    </span>
                    <CopyButton text={blockchain.tx_id} />
                  </div>
                </div>

                {/* Timestamp */}
                <div>
                  <p className="text-[10px] text-geo-600 uppercase tracking-wider mb-1">Horodatage</p>
                  <span className="text-sm text-geo-400 mono">
                    {format(new Date(blockchain.timestamp), 'dd MMM yyyy HH:mm:ss', { locale: fr })}
                  </span>
                </div>

                {/* SHA-256 */}
                <div>
                  <p className="text-[10px] text-geo-600 uppercase tracking-wider mb-1">SHA-256</p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="flex-1 text-[11px] mono text-geo-500 truncate px-2 py-1.5 rounded-lg"
                      style={{ background: 'rgba(15,23,42,0.5)' }}
                      title={blockchain.sha256_hash}
                    >
                      {blockchain.sha256_hash.slice(0, 32)}...
                    </span>
                    <CopyButton text={blockchain.sha256_hash} />
                  </div>
                </div>

                {/* Infos supplementaires */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.04]">
                  <div>
                    <p className="text-[10px] text-geo-600">Channel</p>
                    <p className="text-xs text-geo-400 mono">{blockchain.channel}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-geo-600">Bloc</p>
                    <p className="text-xs text-geo-400 mono">#{blockchain.block_number}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-geo-600 text-center py-4">
                Aucun enregistrement blockchain
              </p>
            )}
          </motion.div>

          {/* Box Alertes liees */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-danger-500/10 border border-danger-500/20">
                  <Bell size={16} className="text-danger-400" />
                </div>
                <h3 className="text-sm font-semibold text-geo-400">Alertes liees</h3>
              </div>
              <span className="text-[10px] text-geo-600">{siteAlerts.length} alerte{siteAlerts.length > 1 ? 's' : ''}</span>
            </div>

            {siteAlerts.length > 0 ? (
              <div className="space-y-2">
                {siteAlerts.slice(0, 5).map((alert) => {
                  const sev = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.LOW;
                  const SevIcon = sev.icon;
                  return (
                    <div
                      key={alert.id}
                      className="flex items-center gap-2 p-2 rounded-lg transition-colors hover:bg-white/[0.02]"
                    >
                      <SevIcon size={12} style={{ color: sev.cls.includes('critical') ? '#f87171' : sev.cls.includes('high') ? '#fbbf24' : '#94a3b8' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-geo-400 truncate">{alert.title}</p>
                        <span className="text-[10px] text-geo-600 mono">
                          {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true, locale: fr })}
                        </span>
                      </div>
                      <span className={cn('text-[10px]', sev.cls)}>{sev.label}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-geo-600 text-center py-4">Aucune alerte liee</p>
            )}
          </motion.div>

          {/* Box Operations liees */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass-card"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg bg-gold-500/10 border border-gold-500/20">
                <FileBarChart size={16} className="text-gold-400" />
              </div>
              <h3 className="text-sm font-semibold text-geo-400">Operations</h3>
            </div>

            {siteOperations.length > 0 ? (
              <div className="space-y-3">
                {siteOperations.map((op) => (
                  <div
                    key={op.id}
                    className="p-3 rounded-xl transition-colors hover:bg-white/[0.02]"
                    style={{
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid rgba(148, 163, 184, 0.06)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-medium text-geo-400">{op.name}</p>
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full',
                        op.status === 'IN_PROGRESS' ? 'bg-gold-500/15 text-gold-400 border border-gold-500/20' :
                        op.status === 'COMPLETED' ? 'bg-gold-500/15 text-gold-400 border border-gold-500/20' :
                        op.status === 'PLANNED' ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' :
                        'bg-geo-700/30 text-geo-500 border border-geo-600/20',
                      )}>
                        {op.status === 'IN_PROGRESS' ? 'En cours' :
                         op.status === 'COMPLETED' ? 'Terminee' :
                         op.status === 'PLANNED' ? 'Planifiee' :
                         op.status === 'CANCELLED' ? 'Annulee' : 'Suspendue'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-geo-600">
                      <span>{op.commander}</span>
                      <span>|</span>
                      <span>{op.team_size} agents</span>
                      <span>|</span>
                      <span className="mono">
                        {format(new Date(op.start_date), 'dd MMM yyyy', { locale: fr })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-geo-600 text-center py-4">Aucune operation liee</p>
            )}
          </motion.div>

          {/* ===== ACTIONS SELON ROLE ===== */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card"
          >
            <h3 className="text-sm font-semibold text-geo-400 mb-4">Actions</h3>

            <div className="space-y-2">
              {/* Changer statut (dropdown) */}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="btn-secondary w-full flex items-center justify-center gap-2">
                    <ShieldCheck size={16} />
                    Changer le statut
                    <ChevronDown size={14} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-50 w-56 rounded-xl p-1"
                    style={{
                      background: 'rgba(30, 41, 59, 0.95)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(148, 163, 184, 0.12)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                    sideOffset={4}
                  >
                    {Object.values(SiteStatus).map((s) => (
                      <DropdownMenu.Item
                        key={s}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm rounded-lg outline-none cursor-pointer transition-colors',
                          site.status === s
                            ? 'text-gold-400 bg-gold-500/10'
                            : 'text-geo-400 hover:bg-white/[0.04]',
                        )}
                        onSelect={() => statusMutation.mutate(s)}
                      >
                        {STATUS_LABEL[s]}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              {/* Actions ANALYSTE : Valider / Rejeter */}
              {isAnalyste && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => statusMutation.mutate(SiteStatus.CONFIRMED)}
                    className="btn-primary flex items-center justify-center gap-1.5 text-sm"
                  >
                    <CheckCircle2 size={15} />
                    Valider
                  </button>
                  <button
                    onClick={() => statusMutation.mutate(SiteStatus.MONITORING)}
                    className="flex items-center justify-center gap-1.5 text-sm px-4 py-2.5 rounded-lg font-medium transition-all duration-200"
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    <XCircle size={15} />
                    Rejeter
                  </button>
                </div>
              )}

              {/* Actions OFFICIER : Creer Operation / Escalader */}
              {isOfficier && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => router.push(`/operations/new?site=${siteId}`)}
                    className="btn-danger flex items-center justify-center gap-1.5 text-sm"
                  >
                    <Play size={15} />
                    Creer Operation
                  </button>
                  <button
                    onClick={() => statusMutation.mutate(SiteStatus.ESCALATED)}
                    className="flex items-center justify-center gap-1.5 text-sm px-4 py-2.5 rounded-lg font-medium transition-all duration-200"
                    style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: '#fbbf24',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                    }}
                  >
                    <ArrowUpRight size={15} />
                    Escalader
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
