'use client';

/* ============================================
   SiteEvidence - Evidence files list/grid
   ============================================ */

import {
  FileImage,
  FileText,
  FileVideo,
  File,
  Download,
  ShieldCheck,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/cn';

/* ---------- types ---------- */

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface Evidence {
  id: string;
  site_id: string;
  filename: string;
  file_type: string;
  file_url: string;
  sha256_hash: string;
  uploaded_at: string;
  uploaded_by: string;
  verification_status: VerificationStatus;
}

/* ---------- helpers ---------- */

function fileIcon(type: string) {
  if (type.startsWith('image')) return FileImage;
  if (type.startsWith('video')) return FileVideo;
  if (type.includes('pdf') || type.startsWith('text')) return FileText;
  return File;
}

const VERIFICATION_BADGE: Record<
  VerificationStatus,
  { label: string; className: string; icon: typeof ShieldCheck }
> = {
  VERIFIED: {
    label: 'Verifie',
    className: 'bg-green-100 text-green-700',
    icon: ShieldCheck,
  },
  PENDING: {
    label: 'En attente',
    className: 'bg-yellow-100 text-yellow-700',
    icon: Clock,
  },
  REJECTED: {
    label: 'Rejete',
    className: 'bg-red-100 text-red-700',
    icon: ShieldAlert,
  },
};

/* ---------- props ---------- */

interface SiteEvidenceProps {
  evidence: Evidence[];
  className?: string;
}

/* ---------- component ---------- */

export default function SiteEvidence({ evidence, className }: SiteEvidenceProps) {
  if (evidence.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        Aucune preuve enregistree pour ce site.
      </p>
    );
  }

  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
      {evidence.map((ev) => {
        const Icon = fileIcon(ev.file_type);
        const badge = VERIFICATION_BADGE[ev.verification_status];
        const BadgeIcon = badge.icon;

        return (
          <div key={ev.id} className="card-hover flex flex-col gap-3">
            {/* top row */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gray-100 rounded-lg shrink-0">
                <Icon size={20} className="text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {ev.filename}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(ev.uploaded_at).toLocaleDateString('fr-FR')} &middot;{' '}
                  {ev.uploaded_by}
                </p>
              </div>
            </div>

            {/* SHA-256 */}
            <div className="text-xs font-mono text-gray-400 truncate" title={ev.sha256_hash}>
              SHA-256: {ev.sha256_hash.slice(0, 16)}&hellip;
            </div>

            {/* bottom row */}
            <div className="flex items-center justify-between mt-auto">
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                  badge.className,
                )}
              >
                <BadgeIcon size={12} />
                {badge.label}
              </span>

              <a
                href={ev.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 transition-colors"
                title="Telecharger"
              >
                <Download size={16} />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
