'use client';

/* ==========================================================================
   MapControls - Panel de controles flottant glassmorphism

   Fonctionnalites :
   - Panel flottant haut-droite : toggles couches
     (Sites | H3 Risque | AquaGuard | Operations)
   - Boutons : Zoom CI | Toggle basemap OSM ↔ Satellite | Toggle terrain 3D
   - Legende couleurs statuts sites (expandable/collapsible)
   - SearchInput : chercher un site par code → zoom + highlight
   - Filtres rapides par statut (checkboxes)
   ========================================================================== */

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Map,
  Satellite,
  Mountain,
  Layers,
  Radio,
  Flame,
  Droplets,
  Shield,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  MapPin,
  Focus,
  Eye,
  EyeOff,
  Palette,
} from 'lucide-react';
import { useMapStore } from '@/stores/mapStore';
import { SITE_STATUS_COLORS, SITE_STATUS_LABELS } from '@/lib/maplibre';
import { cn } from '@/lib/cn';
import type { Basemap } from '@/components/map/OpsMap';
import type { MiningSite } from '@/types';

/* ---------- Configuration des basemaps ---------- */

const BASEMAPS: { id: Basemap; label: string; icon: typeof Map; desc: string }[] = [
  { id: 'osm', label: 'OSM', icon: Map, desc: 'OpenStreetMap' },
  { id: 'satellite', label: 'Satellite', icon: Satellite, desc: 'Imagerie satellite' },
  { id: 'terrain', label: 'Terrain', icon: Mountain, desc: 'Topographique' },
];

/* ---------- Configuration des couches ---------- */

const LAYER_OPTIONS: {
  key: string;
  label: string;
  icon: typeof Layers;
  color: string;
}[] = [
  { key: 'mining-sites', label: 'Sites miniers', icon: MapPin, color: '#fbbf24' },
  { key: 'alerts', label: 'Alertes', icon: Radio, color: '#ef4444' },
  { key: 'heatmap', label: 'Risque H3', icon: Flame, color: '#f97316' },
  { key: 'aquaguard', label: 'AquaGuard', icon: Droplets, color: '#06b6d4' },
  { key: 'operations', label: 'Operations', icon: Shield, color: '#8b5cf6' },
];

/* ---------- Statuts pour les filtres ---------- */

const STATUS_ENTRIES = Object.entries(SITE_STATUS_COLORS).map(([status, color]) => ({
  status,
  color,
  label: SITE_STATUS_LABELS[status] ?? status,
}));

/* ---------- Props ---------- */

interface MapControlsProps {
  /** Basemap actuellement selectionne */
  basemap: Basemap;
  /** Callback de changement de basemap */
  onBasemapChange: (basemap: Basemap) => void;
  /** Terrain 3D active */
  terrain3D: boolean;
  /** Callback toggle terrain 3D */
  onTerrain3DToggle: () => void;
  /** Callback pour recentrer sur la Cote d'Ivoire */
  onResetView: () => void;
  /** Callback de recherche de site */
  onSearchSite?: (query: string) => void;
  /** Resultats de recherche */
  searchResults?: MiningSite[];
  /** Callback de selection d'un resultat de recherche */
  onSelectSearchResult?: (site: MiningSite) => void;
}

/* ---------- Composant ---------- */

export default function MapControls({
  basemap,
  onBasemapChange,
  terrain3D,
  onTerrain3DToggle,
  onResetView,
  onSearchSite,
  searchResults = [],
  onSelectSearchResult,
}: MapControlsProps) {
  const activeLayers = useMapStore((s) => s.activeLayers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const statusFilters = useMapStore((s) => s.statusFilters);
  const toggleStatusFilter = useMapStore((s) => s.toggleStatusFilter);

  /* --- Etat local du panel --- */
  const [legendOpen, setLegendOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  /* --- Recherche de site --- */
  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (onSearchSite) {
        onSearchSite(value);
      }
    },
    [onSearchSite]
  );

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    if (onSearchSite) onSearchSite('');
  }, [onSearchSite]);

  /* --- Nombre de couches actives --- */
  const activeCount = useMemo(
    () => LAYER_OPTIONS.filter((l) => activeLayers.has(l.key)).length,
    [activeLayers]
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="absolute top-4 right-4 z-10 w-64 flex flex-col gap-3"
    >
      {/* ================================================================
          Section 1 : Recherche de site
          ================================================================ */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <div className="p-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-geo-600" />
            <input
              type="text"
              placeholder="Rechercher un site..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              className="w-full pl-9 pr-8 py-2 rounded-lg text-xs font-medium
                         text-geo-400 placeholder:text-geo-600
                         outline-none transition-all duration-200
                         focus:ring-1 focus:ring-gold-500/30"
              style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(148, 163, 184, 0.08)',
              }}
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-geo-600 hover:text-geo-400 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Resultats de recherche */}
          <AnimatePresence>
            {searchOpen && searchQuery && searchResults.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-2 max-h-36 overflow-y-auto rounded-lg"
                style={{ background: 'rgba(30, 41, 59, 0.5)' }}
              >
                {searchResults.slice(0, 5).map((site) => (
                  <button
                    key={site.id}
                    onClick={() => {
                      onSelectSearchResult?.(site);
                      setSearchOpen(false);
                      setSearchQuery(site.name);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs
                               hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: SITE_STATUS_COLORS[site.status] ?? '#9CA3AF' }}
                    />
                    <div className="min-w-0">
                      <div className="text-geo-400 font-medium truncate">{site.name}</div>
                      <div className="text-geo-600 text-[10px]">
                        {SITE_STATUS_LABELS[site.status]} · {site.region}
                      </div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
            {searchOpen && searchQuery && searchResults.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-2 px-3 py-2 text-[10px] text-geo-600 text-center"
              >
                Aucun site trouve
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ================================================================
          Section 2 : Fond de carte + Terrain 3D + Zoom CI
          ================================================================ */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <div className="p-3 space-y-3">
          {/* --- Fond de carte --- */}
          <div>
            <p className="text-[9px] font-semibold text-geo-600 uppercase tracking-[0.12em] mb-2">
              Fond de carte
            </p>
            <div className="flex gap-1">
              {BASEMAPS.map(({ id, label, icon: Icon, desc }) => (
                <button
                  key={id}
                  onClick={() => onBasemapChange(id)}
                  title={desc}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-medium transition-all duration-200',
                    basemap === id
                      ? 'bg-gold-500/15 text-gold-400 shadow-glow-gold'
                      : 'text-geo-600 hover:bg-white/[0.04] hover:text-geo-500'
                  )}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* --- Boutons actions rapides --- */}
          <div className="flex gap-1.5">
            {/* Toggle Terrain 3D */}
            <button
              onClick={onTerrain3DToggle}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-semibold transition-all duration-200',
                terrain3D
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-geo-600 hover:bg-white/[0.04] hover:text-geo-500 border border-transparent'
              )}
              style={
                terrain3D
                  ? { boxShadow: '0 0 12px rgba(6,182,212,0.2)' }
                  : {}
              }
            >
              <Mountain size={13} />
              3D
            </button>

            {/* Zoom Cote d'Ivoire */}
            <button
              onClick={onResetView}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg
                         text-[10px] font-semibold text-geo-600 hover:bg-white/[0.04]
                         hover:text-geo-500 transition-all duration-200 border border-transparent"
            >
              <Focus size={13} />
              Cote d&apos;Ivoire
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================
          Section 3 : Couches
          ================================================================ */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-semibold text-geo-600 uppercase tracking-[0.12em]">
              Couches
            </p>
            <span className="text-[9px] font-medium text-gold-500 bg-gold-500/10 px-1.5 py-0.5 rounded-full">
              {activeCount}/{LAYER_OPTIONS.length}
            </span>
          </div>
          <div className="space-y-1">
            {LAYER_OPTIONS.map(({ key, label, icon: Icon, color }) => {
              const active = activeLayers.has(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleLayer(key)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-200',
                    active
                      ? 'bg-white/[0.04]'
                      : 'hover:bg-white/[0.02]'
                  )}
                >
                  {/* Indicateur de couleur */}
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 transition-all duration-200"
                    style={{
                      background: active ? color : 'rgba(100,116,139,0.3)',
                      boxShadow: active ? `0 0 8px ${color}44` : 'none',
                    }}
                  />
                  {/* Icone */}
                  <Icon
                    size={14}
                    className="transition-colors duration-200"
                    style={{ color: active ? color : '#475569' }}
                  />
                  {/* Label */}
                  <span
                    className="flex-1 text-left transition-colors duration-200"
                    style={{ color: active ? '#cbd5e1' : '#64748b' }}
                  >
                    {label}
                  </span>
                  {/* Toggle oeil */}
                  {active ? (
                    <Eye size={13} style={{ color: color }} className="opacity-60" />
                  ) : (
                    <EyeOff size={13} className="text-geo-700 opacity-40" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================================================================
          Section 4 : Legende des statuts (expandable)
          ================================================================ */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <button
          onClick={() => setLegendOpen(!legendOpen)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-[10px]
                     font-semibold text-geo-500 hover:text-geo-400 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Palette size={13} className="text-geo-600" />
            <span className="uppercase tracking-[0.1em] text-[9px]">Legende statuts</span>
          </div>
          {legendOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        <AnimatePresence>
          {legendOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-1">
                {STATUS_ENTRIES.map(({ status, color, label }) => (
                  <div
                    key={status}
                    className="flex items-center gap-2.5 py-1"
                  >
                    <span
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{
                        background: color,
                        opacity: 0.8,
                        boxShadow: `0 0 6px ${color}33`,
                      }}
                    />
                    <span className="text-[11px] text-geo-500">{label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ================================================================
          Section 5 : Filtres rapides par statut (expandable)
          ================================================================ */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(15, 23, 42, 0.88)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-[10px]
                     font-semibold text-geo-500 hover:text-geo-400 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Layers size={13} className="text-geo-600" />
            <span className="uppercase tracking-[0.1em] text-[9px]">Filtres statut</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-medium text-gold-500 bg-gold-500/10 px-1.5 py-0.5 rounded-full">
              {statusFilters.size}/{STATUS_ENTRIES.length}
            </span>
            {filtersOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        </button>

        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 space-y-1">
                {STATUS_ENTRIES.map(({ status, color, label }) => {
                  const checked = statusFilters.has(status);
                  return (
                    <label
                      key={status}
                      className="flex items-center gap-2.5 py-1 cursor-pointer select-none
                                 hover:bg-white/[0.02] rounded px-1 -mx-1 transition-colors"
                    >
                      {/* Checkbox custom */}
                      <span
                        className={cn(
                          'w-3.5 h-3.5 rounded flex items-center justify-center border transition-all duration-200',
                          checked
                            ? 'border-transparent'
                            : 'border-geo-700 bg-transparent'
                        )}
                        style={
                          checked
                            ? { background: color, boxShadow: `0 0 8px ${color}44` }
                            : {}
                        }
                      >
                        {checked && (
                          <svg
                            viewBox="0 0 12 12"
                            className="w-2.5 h-2.5 text-white"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <path d="M2 6l3 3 5-5" />
                          </svg>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStatusFilter(status)}
                        className="sr-only"
                      />
                      <span
                        className="text-[11px] transition-colors duration-200"
                        style={{ color: checked ? '#cbd5e1' : '#64748b' }}
                      >
                        {label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
