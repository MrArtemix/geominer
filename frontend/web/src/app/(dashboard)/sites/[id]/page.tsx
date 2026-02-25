'use client';

/* ============================================
   /sites/[id] - Site detail page
   ============================================ */

import { useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import maplibregl from 'maplibre-gl';
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
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import OpsMap, { type OpsMapHandle } from '@/components/map/OpsMap';
import SiteLayer from '@/components/map/SiteLayer';
import SiteTimeline from '@/components/sites/SiteTimeline';
import SiteEvidence from '@/components/sites/SiteEvidence';
import {
  SiteStatus,
  type MiningSite,
  type SiteFeatureCollection,
} from '@/types';

/* ---------- status display config ---------- */

const STATUS_STYLES: Record<string, string> = {
  [SiteStatus.DETECTED]: 'bg-yellow-100 text-yellow-800',
  [SiteStatus.CONFIRMED]: 'bg-orange-200 text-orange-900',
  [SiteStatus.ACTIVE]: 'bg-red-100 text-red-800',
  [SiteStatus.ESCALATED]: 'bg-red-200 text-red-900',
  [SiteStatus.UNDER_OPERATION]: 'bg-orange-100 text-orange-800',
  [SiteStatus.DISMANTLED]: 'bg-green-100 text-green-800',
  [SiteStatus.REHABILITATED]: 'bg-emerald-100 text-emerald-800',
  [SiteStatus.MONITORING]: 'bg-purple-100 text-purple-800',
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

/* ---------- status change timeline type ---------- */

interface StatusChangeEntry {
  id: string;
  site_id: string;
  from_status: SiteStatus | null;
  to_status: SiteStatus;
  changed_by: string;
  changed_at: string;
  note?: string;
}

/* ---------- evidence type ---------- */

interface Evidence {
  id: string;
  site_id: string;
  filename: string;
  file_type: string;
  file_url: string;
  sha256_hash: string;
  uploaded_at: string;
  uploaded_by: string;
  verification_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
}

/* ---------- component ---------- */

export default function SiteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const siteId = params.id;

  const mapHandleRef = useRef<OpsMapHandle>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  const onMapReady = useCallback((map: maplibregl.Map) => {
    setMapInstance(map);
  }, []);

  /* ---------- data ---------- */

  const { data: site, isLoading: siteLoading } = useQuery<MiningSite>({
    queryKey: ['site', siteId],
    queryFn: () => api.get(`/api/sites/${siteId}`).then((r) => r.data),
    enabled: !!siteId,
  });

  const { data: timeline = [] } = useQuery<StatusChangeEntry[]>({
    queryKey: ['site', siteId, 'timeline'],
    queryFn: () => api.get(`/api/sites/${siteId}/timeline`).then((r) => r.data),
    enabled: !!siteId,
  });

  const { data: evidence = [] } = useQuery<Evidence[]>({
    queryKey: ['site', siteId, 'evidence'],
    queryFn: () => api.get(`/api/sites/${siteId}/evidence`).then((r) => r.data),
    enabled: !!siteId,
  });

  /* ---------- GeoJSON for single-site map ---------- */

  const siteGeoJSON: SiteFeatureCollection | null = site
    ? {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [site.longitude, site.latitude],
            },
            properties: {
              id: site.id,
              name: site.name,
              status: site.status,
              ai_confidence_score: site.ai_confidence_score,
              detection_date: site.detection_date,
              area_hectares: site.area_hectares,
            },
          },
        ],
      }
    : null;

  const confidencePct = site ? Math.round(site.ai_confidence_score * 100) : 0;

  /* ---------- loading state ---------- */

  if (siteLoading || !site) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-64 bg-gray-200 rounded-xl" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-24 bg-gray-200 rounded-xl" />
            <div className="h-24 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* ---- back button ---- */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft size={16} />
        Retour
      </button>

      {/* ================ HEADER ================ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">{site.name}</h1>
          <span className={cn('badge text-sm', STATUS_STYLES[site.status])}>
            {STATUS_LABEL[site.status]}
          </span>
        </div>

        {/* confidence bar */}
        <div className="flex items-center gap-3 min-w-[180px]">
          <span className="text-xs text-gray-500 whitespace-nowrap">Confiance IA</span>
          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                confidencePct >= 80
                  ? 'bg-primary-500'
                  : confidencePct >= 50
                    ? 'bg-warning-400'
                    : 'bg-danger-400',
              )}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-gray-700">{confidencePct}%</span>
        </div>
      </div>

      {/* ================ MAP ================ */}
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm h-80">
        <OpsMap
          ref={mapHandleRef}
          center={[site.longitude, site.latitude]}
          className="w-full h-full"
          zoom={13}
          onMapReady={onMapReady}
        />
        <SiteLayer map={mapInstance} data={siteGeoJSON} visible />
      </div>

      {/* ================ PROPERTIES ================ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="card flex items-center gap-3">
          <Layers size={18} className="text-gray-400 shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Superficie</p>
            <p className="font-semibold text-gray-900">{site.area_hectares.toFixed(2)} ha</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <MapPin size={18} className="text-gray-400 shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Region</p>
            <p className="font-semibold text-gray-900">{site.region}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <MapPin size={18} className="text-gray-400 shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Departement</p>
            <p className="font-semibold text-gray-900">{site.department}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <Calendar size={18} className="text-gray-400 shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Date detection</p>
            <p className="font-semibold text-gray-900">
              {new Date(site.detection_date).toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <Satellite size={18} className="text-gray-400 shrink-0" />
          <div>
            <p className="text-xs text-gray-500">Source detection</p>
            <p className="font-semibold text-gray-900">{site.detection_source}</p>
          </div>
        </div>
      </div>

      {/* ================ ACTION BUTTONS ================ */}
      <div className="flex flex-wrap gap-3">
        {/* Change status dropdown */}
        <div className="relative">
          <button
            onClick={() => setStatusMenuOpen((p) => !p)}
            className="btn-primary flex items-center gap-2"
          >
            <ShieldCheck size={16} />
            Changer le statut
            <ChevronDown size={14} />
          </button>
          {statusMenuOpen && (
            <div className="absolute top-full mt-1 left-0 z-20 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
              {Object.values(SiteStatus).map((s) => (
                <button
                  key={s}
                  className={cn(
                    'w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors',
                    site.status === s && 'font-semibold text-primary-700 bg-primary-50',
                  )}
                  onClick={() => {
                    setStatusMenuOpen(false);
                    api.patch(`/api/sites/${siteId}/status`, { status: s });
                  }}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}
        </div>

        <button className="btn-secondary flex items-center gap-2">
          <Upload size={16} />
          Ajouter une preuve
        </button>

        <button className="btn-danger flex items-center gap-2">
          <Play size={16} />
          Lancer une operation
        </button>
      </div>

      {/* ================ TIMELINE ================ */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Historique des statuts
        </h2>
        <SiteTimeline changes={timeline} />
      </section>

      {/* ================ EVIDENCE ================ */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Preuves &amp; documents
        </h2>
        <SiteEvidence evidence={evidence} />
      </section>
    </div>
  );
}
