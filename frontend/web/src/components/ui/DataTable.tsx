'use client';

/* ============================================
   DataTable - Generic sortable data table
   ============================================ */

import { useState, useCallback, type ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ---------- types ---------- */

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortable?: boolean;
  /** Custom cell renderer. Falls back to row[key]. */
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

/* ---------- skeleton row ---------- */

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
        </td>
      ))}
    </tr>
  );
}

/* ---------- component ---------- */

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  isLoading = false,
  emptyMessage = 'Aucune donnee a afficher.',
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

  // Sort data
  const sorted = (() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
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
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        {/* ---- header ---- */}
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider',
                  col.sortable && 'cursor-pointer select-none hover:text-gray-700',
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
        <tbody className="divide-y divide-gray-100">
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} cols={columns.length} />
            ))}

          {!isLoading && sorted.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          )}

          {!isLoading &&
            sorted.map((row, idx) => {
              const key = keyExtractor ? keyExtractor(row) : (row.id as string) ?? idx;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-gray-50'
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3 text-sm text-gray-700', col.className)}>
                      {col.render ? col.render(row, idx) : (row[col.key] as ReactNode)}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
