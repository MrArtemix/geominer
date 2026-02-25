'use client';

/* ============================================
   StatCard - Key metric display card
   ============================================ */

import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/cn';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number; // percentage
  icon: LucideIcon;
  trend?: 'up' | 'down';
  className?: string;
}

export default function StatCard({
  title,
  value,
  change,
  icon: Icon,
  trend,
  className,
}: StatCardProps) {
  const isPositive = trend === 'up';
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <div className={cn('stat-card', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <div className="p-2 bg-primary-50 rounded-lg">
          <Icon size={20} className="text-primary-600" />
        </div>
      </div>

      <p className="text-2xl font-bold text-gray-900">{value}</p>

      {change != null && trend && (
        <div className="flex items-center gap-1 text-sm">
          <TrendIcon
            size={14}
            className={isPositive ? 'text-primary-600' : 'text-danger-500'}
          />
          <span
            className={cn(
              'font-medium',
              isPositive ? 'text-primary-600' : 'text-danger-500'
            )}
          >
            {change > 0 ? '+' : ''}
            {change.toFixed(1)}%
          </span>
          <span className="text-gray-400 ml-1">vs mois dernier</span>
        </div>
      )}
    </div>
  );
}
