'use client';

/* ============================================
   SiteCard - Carte site glassmorphic
   avec hover 3D et confidence bar gradient
   ============================================ */

import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { SiteStatus, type MiningSite } from '@/types';

/* ---------- badges statut sombres ---------- */

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
  [SiteStatus.DETECTED]: 'Détecté',
  [SiteStatus.CONFIRMED]: 'Confirmé',
  [SiteStatus.ACTIVE]: 'Actif',
  [SiteStatus.ESCALATED]: 'Escaladé',
  [SiteStatus.UNDER_OPERATION]: 'En opération',
  [SiteStatus.DISMANTLED]: 'Démantelé',
  [SiteStatus.REHABILITATED]: 'Réhabilité',
  [SiteStatus.MONITORING]: 'Surveillance',
};

/* ---------- props ---------- */

interface SiteCardProps {
  site: MiningSite;
  className?: string;
}

/* ---------- composant ---------- */

export default function SiteCard({ site, className }: SiteCardProps) {
  const confidencePct = Math.round(site.ai_confidence_score * 100);
  const fillClass =
    confidencePct >= 80
      ? 'ai-score-fill-high'
      : confidencePct >= 50
        ? 'ai-score-fill-medium'
        : 'ai-score-fill-low';

  return (
    <Link href={`/sites/${site.id}`}>
      <motion.div
        whileHover={{ scale: 1.02, rotateX: 2, rotateY: -2 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className={cn('glass-card-hover group', className)}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-semibold text-geo-400 group-hover:text-gold-400 transition-colors">
              {site.name}
            </p>
            <div className="flex items-center gap-1 text-xs text-geo-600 mt-0.5">
              <MapPin size={12} />
              {site.region}, {site.department}
            </div>
          </div>
          <span className={STATUS_STYLES[site.status]}>
            {STATUS_LABEL[site.status]}
          </span>
        </div>

        {/* Barre de confiance gradient */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-geo-600">Confiance IA</span>
            <span className="font-medium text-geo-400 mono">{confidencePct}%</span>
          </div>
          <div className="confidence-bar">
            <div
              className={fillClass}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>

        {/* Détails */}
        <div className="flex items-center justify-between text-xs text-geo-600">
          <span>{site.area_hectares.toFixed(2)} ha</span>
          <span className="mono">{new Date(site.detection_date).toLocaleDateString('fr-FR')}</span>
        </div>
      </motion.div>
    </Link>
  );
}
