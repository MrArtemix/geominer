'use client';

/* ============================================
   SiteTimeline - Status change timeline
   ============================================ */

import { cn } from '@/lib/cn';
import { SiteStatus } from '@/types';

/* ---------- status dot colours ---------- */

const STATUS_DOT: Record<string, string> = {
  [SiteStatus.DETECTED]: 'bg-yellow-400 ring-yellow-200',
  [SiteStatus.CONFIRMED]: 'bg-orange-500 ring-orange-200',
  [SiteStatus.ACTIVE]: 'bg-red-500 ring-red-200',
  [SiteStatus.ESCALATED]: 'bg-red-800 ring-red-300',
  [SiteStatus.UNDER_OPERATION]: 'bg-orange-400 ring-orange-200',
  [SiteStatus.DISMANTLED]: 'bg-green-500 ring-green-200',
  [SiteStatus.REHABILITATED]: 'bg-emerald-500 ring-emerald-200',
  [SiteStatus.MONITORING]: 'bg-purple-500 ring-purple-200',
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

/* ---------- types ---------- */

export interface StatusChange {
  id: string;
  site_id: string;
  from_status: SiteStatus | null;
  to_status: SiteStatus;
  changed_by: string;
  changed_at: string;
  note?: string;
}

/* ---------- props ---------- */

interface SiteTimelineProps {
  changes: StatusChange[];
  className?: string;
}

/* ---------- component ---------- */

export default function SiteTimeline({ changes, className }: SiteTimelineProps) {
  if (changes.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        Aucun changement de statut enregistre.
      </p>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {/* vertical line */}
      <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />

      <ol className="space-y-6">
        {changes.map((change) => {
          const dotColor = STATUS_DOT[change.to_status] ?? 'bg-gray-400 ring-gray-200';

          return (
            <li key={change.id} className="relative pl-9">
              {/* dot */}
              <div
                className={cn(
                  'absolute left-1.5 top-1 h-3.5 w-3.5 rounded-full ring-4',
                  dotColor,
                )}
              />

              {/* content */}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  {change.from_status && (
                    <>
                      <span className="text-sm text-gray-500">
                        {STATUS_LABEL[change.from_status]}
                      </span>
                      <span className="text-gray-300">&rarr;</span>
                    </>
                  )}
                  <span className="text-sm font-semibold text-gray-900">
                    {STATUS_LABEL[change.to_status]}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                  <time dateTime={change.changed_at}>
                    {new Date(change.changed_at).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  <span>par {change.changed_by}</span>
                </div>

                {change.note && (
                  <p className="mt-1 text-xs text-gray-500 italic">{change.note}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
