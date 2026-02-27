'use client';

/* ============================================
   StatCard - Carte de metrique glassmorphic
   avec compteur anime, skeleton shimmer,
   bordure color-coded par variant
   ============================================ */

import { useEffect, useRef, useState } from 'react';
import CountUp from 'react-countup';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

/* ---------- types ---------- */

export type StatVariant = 'success' | 'warning' | 'danger' | 'info';

interface StatCardProps {
  /** Icone Lucide a afficher */
  icon: LucideIcon;
  /** Intitule de la metrique */
  title: string;
  /** Valeur numerique ou textuelle */
  value: number | string;
  /** Variation en pourcentage (ex: +12.5) */
  delta?: number;
  /** Variante couleur pour la bordure et l'accent */
  variant?: StatVariant;
  /** Etat de chargement (affiche skeleton) */
  loading?: boolean;
  /** Suffixe apres la valeur (ex: '%', 'T', 'ha') */
  suffix?: string;
  /** Prefixe avant la valeur (ex: '~') */
  prefix?: string;
  /** Classe CSS supplementaire */
  className?: string;
  /** Ancienne prop accentColor - retrocompatibilite */
  accentColor?: string;
  /** Ancienne prop change - retrocompatibilite */
  change?: number;
  /** Ancienne prop trend - retrocompatibilite */
  trend?: 'up' | 'down';
}

/* ---------- configuration variantes ---------- */

const VARIANT_CONFIG: Record<StatVariant, {
  borderColor: string;
  iconBg: string;
  iconColor: string;
  glowShadow: string;
  deltaPositiveColor: string;
  deltaNegativeColor: string;
}> = {
  success: {
    borderColor: 'from-gold-400 via-gold-500 to-gold-600',
    iconBg: 'bg-gold-500/10 border-gold-500/20',
    iconColor: 'text-gold-400',
    glowShadow: 'group-hover:shadow-[0_0_20px_rgba(52,211,153,0.15)]',
    deltaPositiveColor: 'text-gold-400',
    deltaNegativeColor: 'text-danger-400',
  },
  warning: {
    borderColor: 'from-amber-400 via-gold-500 to-amber-600',
    iconBg: 'bg-gold-500/10 border-gold-500/20',
    iconColor: 'text-gold-400',
    glowShadow: 'group-hover:shadow-[0_0_20px_rgba(251,191,36,0.15)]',
    deltaPositiveColor: 'text-gold-400',
    deltaNegativeColor: 'text-danger-400',
  },
  danger: {
    borderColor: 'from-red-400 via-red-500 to-red-600',
    iconBg: 'bg-danger-500/10 border-danger-500/20',
    iconColor: 'text-danger-400',
    glowShadow: 'group-hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]',
    deltaPositiveColor: 'text-danger-400',
    deltaNegativeColor: 'text-gold-400',
  },
  info: {
    borderColor: 'from-cyan-400 via-cyan-500 to-cyan-600',
    iconBg: 'bg-cyan-500/10 border-cyan-500/20',
    iconColor: 'text-cyan-400',
    glowShadow: 'group-hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]',
    deltaPositiveColor: 'text-cyan-400',
    deltaNegativeColor: 'text-danger-400',
  },
};

/* ---------- mapping retrocompatibilite accentColor → variant ---------- */

function resolveVariant(variant?: StatVariant, accentColor?: string): StatVariant {
  if (variant) return variant;
  if (accentColor === 'danger') return 'danger';
  if (accentColor === 'cyan') return 'info';
  if (accentColor === 'violet') return 'info';
  return 'warning';
}

/* ---------- skeleton shimmer ---------- */

function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('glass-card relative overflow-hidden', className)}>
      {/* Bordure gauche skeleton */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] shimmer-bg rounded-l-xl" />

      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-24 shimmer-bg rounded" />
        <div className="h-10 w-10 shimmer-bg rounded-xl" />
      </div>

      <div className="h-8 w-20 shimmer-bg rounded mb-3" />
      <div className="h-3 w-32 shimmer-bg rounded" />
    </div>
  );
}

/* ---------- composant principal ---------- */

export default function StatCard({
  icon: Icon,
  title,
  value,
  delta,
  variant: variantProp,
  loading = false,
  suffix = '',
  prefix = '',
  className,
  accentColor,
  change,
  trend,
}: StatCardProps) {
  /* Retrocompatibilite avec les anciennes props */
  const effectiveDelta = delta ?? change;
  const variant = resolveVariant(variantProp, accentColor);
  const config = VARIANT_CONFIG[variant];

  /* Determiner la direction du delta */
  const deltaDirection = effectiveDelta != null
    ? effectiveDelta > 0 ? 'up' : effectiveDelta < 0 ? 'down' : 'neutral'
    : trend || null;

  /* Extraction valeur numerique pour react-countup */
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value));
  const isNumeric = !isNaN(numericValue);
  const hasDecimals = isNumeric && numericValue % 1 !== 0;

  /* Animation d'entree observee */
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* Skeleton loading */
  if (loading) return <StatCardSkeleton className={className} />;

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={isVisible ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'glass-card-hover relative overflow-hidden group',
        config.glowShadow,
        className,
      )}
    >
      {/* Bordure gauche color-coded avec gradient */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-gradient-to-b',
          config.borderColor,
        )}
      />

      {/* Ligne superieure : titre + icone */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-geo-500 tracking-wide">
          {title}
        </span>
        <div
          className={cn(
            'p-2.5 rounded-xl border transition-all duration-300',
            config.iconBg,
          )}
        >
          <Icon size={20} className={cn(config.iconColor, 'transition-transform duration-300 group-hover:scale-110')} />
        </div>
      </div>

      {/* Valeur avec react-countup */}
      <div className="stat-value text-geo-300 mb-1">
        {prefix && <span className="text-geo-500 text-lg mr-0.5">{prefix}</span>}
        {isNumeric && isVisible ? (
          <CountUp
            start={0}
            end={numericValue}
            duration={1.2}
            decimals={hasDecimals ? 1 : 0}
            separator=" "
            useEasing
          />
        ) : (
          <span>{value}</span>
        )}
        {suffix && <span className="text-geo-500 text-lg ml-0.5">{suffix}</span>}
      </div>

      {/* Delta / variation */}
      {effectiveDelta != null && (
        <div className="flex items-center gap-1.5 text-sm mt-1">
          {deltaDirection === 'up' && (
            <TrendingUp
              size={14}
              className={config.deltaPositiveColor}
            />
          )}
          {deltaDirection === 'down' && (
            <TrendingDown
              size={14}
              className={config.deltaNegativeColor}
            />
          )}
          {deltaDirection === 'neutral' && (
            <Minus size={14} className="text-geo-600" />
          )}
          <span
            className={cn(
              'font-semibold text-xs',
              deltaDirection === 'up' && config.deltaPositiveColor,
              deltaDirection === 'down' && config.deltaNegativeColor,
              deltaDirection === 'neutral' && 'text-geo-600',
            )}
          >
            {effectiveDelta > 0 ? '+' : ''}
            {typeof effectiveDelta === 'number' ? effectiveDelta.toFixed(1) : effectiveDelta}%
          </span>
          <span className="text-geo-600 text-xs">vs mois dernier</span>
        </div>
      )}

      {/* Motif decoratif subtil en bas a droite */}
      <div className="absolute -bottom-3 -right-3 opacity-[0.03] pointer-events-none">
        <Icon size={80} />
      </div>
    </motion.div>
  );
}
