'use client';

/* ============================================
   SiteCard - Site summary card
   ============================================ */

import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SiteStatus, type MiningSite } from '@/types';

/* ---------- status badge colours ---------- */

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

/* ---------- props ---------- */

interface SiteCardProps {
  site: MiningSite;
  className?: string;
}

/* ---------- component ---------- */

export default function SiteCard({ site, className }: SiteCardProps) {
  const confidencePct = Math.round(site.ai_confidence_score * 100);

  return (
    <Link href={`/sites/${site.id}`}>
      <div className={cn('card-hover group', className)}>
        {/* header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-semibold text-gray-900 group-hover:text-primary-700 transition-colors">
              {site.name}
            </p>
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
              <MapPin size={12} />
              {site.region}, {site.department}
            </div>
          </div>
          <span className={cn('badge', STATUS_STYLES[site.status])}>
            {STATUS_LABEL[site.status]}
          </span>
        </div>

        {/* confidence bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500">Confiance IA</span>
            <span className="font-medium text-gray-700">{confidencePct}%</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
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
        </div>

        {/* details */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{site.area_hectares.toFixed(2)} ha</span>
          <span>{new Date(site.detection_date).toLocaleDateString('fr-FR')}</span>
        </div>
      </div>
    </Link>
  );
}
