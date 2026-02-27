'use client';

/* ============================================
   SiteTimeline - Timeline verticale enrichie
   Icone par statut, date + acteur + notes,
   etape actuelle highlighted, bandeau RECIDIVE
   ============================================ */

import { motion } from 'framer-motion';
import {
  Eye,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Pickaxe,
  XCircle,
  Leaf,
  Radar,
  RotateCcw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/cn';
import { SiteStatus } from '@/types';

/* ---------- configuration par statut : icone, couleur, label ---------- */

interface StatusConfig {
  icon: LucideIcon;
  color: string;
  glowColor: string;
  bgColor: string;
  borderColor: string;
  label: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  [SiteStatus.DETECTED]: {
    icon: Eye,
    color: '#facc15',
    glowColor: 'rgba(250,204,21,0.5)',
    bgColor: 'rgba(250,204,21,0.1)',
    borderColor: 'rgba(250,204,21,0.25)',
    label: 'Detecte',
  },
  [SiteStatus.CONFIRMED]: {
    icon: CheckCircle2,
    color: '#fb923c',
    glowColor: 'rgba(251,146,60,0.5)',
    bgColor: 'rgba(251,146,60,0.1)',
    borderColor: 'rgba(251,146,60,0.25)',
    label: 'Confirme',
  },
  [SiteStatus.ACTIVE]: {
    icon: AlertTriangle,
    color: '#ef4444',
    glowColor: 'rgba(239,68,68,0.5)',
    bgColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.25)',
    label: 'Actif',
  },
  [SiteStatus.ESCALATED]: {
    icon: ShieldAlert,
    color: '#dc2626',
    glowColor: 'rgba(220,38,38,0.5)',
    bgColor: 'rgba(220,38,38,0.1)',
    borderColor: 'rgba(220,38,38,0.25)',
    label: 'Escalade',
  },
  [SiteStatus.UNDER_OPERATION]: {
    icon: Pickaxe,
    color: '#f59e0b',
    glowColor: 'rgba(245,158,11,0.5)',
    bgColor: 'rgba(245,158,11,0.1)',
    borderColor: 'rgba(245,158,11,0.25)',
    label: 'En operation',
  },
  [SiteStatus.DISMANTLED]: {
    icon: XCircle,
    color: '#fbbf24',
    glowColor: 'rgba(251,191,36,0.5)',
    bgColor: 'rgba(251,191,36,0.1)',
    borderColor: 'rgba(251,191,36,0.25)',
    label: 'Demantele',
  },
  [SiteStatus.REHABILITATED]: {
    icon: Leaf,
    color: '#06b6d4',
    glowColor: 'rgba(6,182,212,0.5)',
    bgColor: 'rgba(6,182,212,0.1)',
    borderColor: 'rgba(6,182,212,0.25)',
    label: 'Rehabilite',
  },
  [SiteStatus.MONITORING]: {
    icon: Radar,
    color: '#8b5cf6',
    glowColor: 'rgba(139,92,246,0.5)',
    bgColor: 'rgba(139,92,246,0.1)',
    borderColor: 'rgba(139,92,246,0.25)',
    label: 'Surveillance',
  },
};

/* ---------- configuration par defaut ---------- */

const DEFAULT_CONFIG: StatusConfig = {
  icon: Eye,
  color: '#94a3b8',
  glowColor: 'rgba(148,163,184,0.3)',
  bgColor: 'rgba(148,163,184,0.1)',
  borderColor: 'rgba(148,163,184,0.2)',
  label: 'Inconnu',
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

interface SiteTimelineProps {
  changes: StatusChange[];
  /** Statut actuel du site pour highlighting */
  currentStatus?: SiteStatus;
  className?: string;
}

/* ---------- detection RECIDIVE ---------- */

function detectRecurrence(changes: StatusChange[]): boolean {
  /* Un site est recidiviste s'il a ete demantele au moins une fois
     et est revenu a un statut actif/confirme/detecte apres */
  const statusSequence = changes.map((c) => c.to_status);
  let wasDismantled = false;
  for (const status of statusSequence) {
    if (status === SiteStatus.DISMANTLED || status === SiteStatus.REHABILITATED) {
      wasDismantled = true;
    }
    if (
      wasDismantled &&
      (status === SiteStatus.DETECTED ||
        status === SiteStatus.CONFIRMED ||
        status === SiteStatus.ACTIVE)
    ) {
      return true;
    }
  }
  return false;
}

/* ---------- composant ---------- */

export default function SiteTimeline({
  changes,
  currentStatus,
  className,
}: SiteTimelineProps) {
  const isRecurrence = detectRecurrence(changes);

  if (changes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <Radar size={28} className="text-geo-700" />
        <p className="text-sm text-geo-600 text-center">
          Aucun changement de statut enregistre.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {/* Bandeau RECIDIVE */}
      {isRecurrence && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            boxShadow: '0 0 20px rgba(239, 68, 68, 0.1)',
          }}
        >
          <RotateCcw size={16} className="text-danger-400 animate-spin" style={{ animationDuration: '3s' }} />
          <span className="text-sm font-bold text-danger-400">
            RECIDIVE DETECTEE
          </span>
          <span className="text-xs text-danger-400/70 ml-1">
            Ce site a ete demantele puis reactive
          </span>
        </motion.div>
      )}

      {/* Ligne verticale degrade */}
      <div
        className="absolute left-5 top-0 bottom-0 w-px"
        style={{
          background: 'linear-gradient(180deg, rgba(251,191,36,0.4) 0%, rgba(6,182,212,0.3) 50%, rgba(139,92,246,0.2) 100%)',
        }}
      />

      <ol className="space-y-1">
        {changes.map((change, idx) => {
          const config = STATUS_CONFIG[change.to_status] ?? DEFAULT_CONFIG;
          const fromConfig = change.from_status
            ? STATUS_CONFIG[change.from_status] ?? DEFAULT_CONFIG
            : null;
          const Icon = config.icon;
          const isCurrentStep = currentStatus === change.to_status && idx === changes.length - 1;
          const isLast = idx === changes.length - 1;

          return (
            <motion.li
              key={change.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.08, duration: 0.35, ease: 'easeOut' }}
              className={cn(
                'relative pl-14 py-3 rounded-xl transition-all duration-200',
                isCurrentStep && 'bg-white/[0.02]',
              )}
            >
              {/* Dot/icone avec glow */}
              <div
                className={cn(
                  'absolute left-2 top-3.5 w-7 h-7 rounded-lg flex items-center justify-center',
                  'transition-all duration-300',
                  isCurrentStep && 'ring-2 ring-offset-1 ring-offset-transparent',
                )}
                style={{
                  background: config.bgColor,
                  border: `1px solid ${config.borderColor}`,
                  boxShadow: isCurrentStep ? `0 0 12px ${config.glowColor}` : 'none',
                  ...(isCurrentStep ? { ringColor: config.color } : {}),
                }}
              >
                <Icon size={14} style={{ color: config.color }} />
              </div>

              {/* Contenu */}
              <div>
                {/* Transition statuts */}
                <div className="flex items-center gap-2 flex-wrap">
                  {fromConfig && (
                    <>
                      <span className="text-xs text-geo-600">
                        {fromConfig.label}
                      </span>
                      <span className="text-geo-700 text-xs">&rarr;</span>
                    </>
                  )}
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      isCurrentStep ? 'text-geo-300' : 'text-geo-400',
                    )}
                    style={isCurrentStep ? { color: config.color } : undefined}
                  >
                    {config.label}
                  </span>
                  {isCurrentStep && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold-500/15 text-gold-400 border border-gold-500/20 font-semibold">
                      ACTUEL
                    </span>
                  )}
                </div>

                {/* Meta : date + acteur */}
                <div className="flex items-center gap-3 mt-1 text-xs text-geo-600">
                  <time dateTime={change.changed_at} className="mono">
                    {format(new Date(change.changed_at), 'dd MMM yyyy HH:mm', { locale: fr })}
                  </time>
                  <span className="text-geo-700">|</span>
                  <span>par {change.changed_by}</span>
                  <span className="text-geo-700 ml-auto mono">
                    {formatDistanceToNow(new Date(change.changed_at), {
                      addSuffix: true,
                      locale: fr,
                    })}
                  </span>
                </div>

                {/* Note */}
                {change.note && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="mt-2 text-xs text-geo-500 italic px-3 py-2 rounded-lg"
                    style={{
                      background: 'rgba(30, 41, 59, 0.4)',
                      border: '1px solid rgba(148, 163, 184, 0.06)',
                    }}
                  >
                    &ldquo;{change.note}&rdquo;
                  </motion.p>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
