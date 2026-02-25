'use client';

/* ============================================
   MapControls - Floating control panel
   ============================================ */

import { Map, Satellite, Mountain, Layers, Radio, Flame, Droplets } from 'lucide-react';
import { useMapStore } from '@/stores/mapStore';
import { cn } from '@/lib/cn';
import type { Basemap } from '@/components/map/OpsMap';

/* ---------- basemap options ---------- */

const BASEMAPS: { id: Basemap; label: string; icon: typeof Map }[] = [
  { id: 'streets', label: 'Rues', icon: Map },
  { id: 'satellite', label: 'Satellite', icon: Satellite },
  { id: 'terrain', label: 'Terrain', icon: Mountain },
];

/* ---------- layer options ---------- */

const LAYER_OPTIONS: {
  key: string;
  label: string;
  icon: typeof Layers;
}[] = [
  { key: 'mining-sites', label: 'Sites', icon: Layers },
  { key: 'alerts', label: 'Alertes', icon: Radio },
  { key: 'heatmap', label: 'Heatmap', icon: Flame },
  { key: 'aquaguard', label: 'Capteurs AquaGuard', icon: Droplets },
];

/* ---------- props ---------- */

interface MapControlsProps {
  basemap: Basemap;
  onBasemapChange: (basemap: Basemap) => void;
}

/* ---------- component ---------- */

export default function MapControls({ basemap, onBasemapChange }: MapControlsProps) {
  const activeLayers = useMapStore((s) => s.activeLayers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);

  return (
    <div className="absolute top-4 right-4 z-10 w-56 bg-white/95 backdrop-blur rounded-xl shadow-lg border border-gray-200 p-4 space-y-4">
      {/* ---- Basemap ---- */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Fond de carte
        </p>
        <div className="flex gap-1">
          {BASEMAPS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onBasemapChange(id)}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
                basemap === id
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-500 hover:bg-gray-100',
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Layers ---- */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Couches
        </p>
        <div className="space-y-1.5">
          {LAYER_OPTIONS.map(({ key, label, icon: Icon }) => (
            <label
              key={key}
              className="flex items-center gap-2.5 cursor-pointer select-none text-sm text-gray-700 hover:text-gray-900"
            >
              <input
                type="checkbox"
                checked={activeLayers.has(key)}
                onChange={() => toggleLayer(key)}
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <Icon size={15} className="text-gray-400" />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
