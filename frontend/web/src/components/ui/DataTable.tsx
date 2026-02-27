'use client';

/* ============================================
   DataTable - Table de données sombre
   avec skeleton shimmer et animations
   ============================================ */

import { useState, useCallback, type ReactNode } from 'react';
import { ChevronUp, ChevronDown, Crosshair } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

/* ---------- types ---------- */

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T, index: number) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
  keyExtractor?: (row: T) => string;
}

/* ---------- helpers ---------- */

type SortDir = 'asc' | 'desc' | null;

/* ---------- skeleton row shimmer ---------- */

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded shimmer-bg w-3/4" />
        </td>
      ))}
    </tr>
  );
}

/* ---------- composant ---------- */

export default function DataTable<T extends object>({
  columns,
  data,
  onRowClick,
  isLoading = false,
  emptyMessage = 'Aucune donnée à afficher.',
  keyExtractor,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc'));
        if (sortDir === 'desc') setSortKey(null);
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey, sortDir]
  );

  const sorted = (() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  })();

  return (
    <div
      className="overflow-x-auto rounded-xl"
      style={{
        background: 'rgba(15, 23, 42, 0.4)',
        border: '1px solid rgba(148, 163, 184, 0.08)',
      }}
    >
      <table className="min-w-full">
        {/* ---- header ---- */}
        <thead>
          <tr className="bg-geo-900/60">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left text-[11px] font-semibold text-geo-500 uppercase tracking-wider',
                  col.sortable && 'cursor-pointer select-none hover:text-geo-400',
                  col.className
                )}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && sortDir === 'asc' && (
                    <ChevronUp size={14} />
                  )}
                  {col.sortable && sortKey === col.key && sortDir === 'desc' && (
                    <ChevronDown size={14} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        {/* ---- body ---- */}
        <tbody className="divide-y divide-white/[0.04]">
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} cols={columns.length} />
            ))}

          {!isLoading && sorted.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center"
              >
                <div className="flex flex-col items-center gap-3">
                  <Crosshair className="w-8 h-8 text-geo-700" />
                  <span className="text-sm text-geo-600">{emptyMessage}</span>
                </div>
              </td>
            </tr>
          )}

          {!isLoading &&
            sorted.map((row, idx) => {
              const key = keyExtractor ? keyExtractor(row) : ((row as Record<string, unknown>).id as string) ?? idx;
              return (
                <motion.tr
                  key={key}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03, duration: 0.2 }}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-white/[0.03]'
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3 text-sm text-geo-400', col.className)}>
                      {col.render ? col.render(row, idx) : ((row as Record<string, unknown>)[col.key] as ReactNode)}
                    </td>
                  ))}
                </motion.tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
