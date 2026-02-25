'use client';

/* ============================================
   SiteLayer - GeoJSON polygon/point layer for
   mining sites on the MapLibre map
   ============================================ */

import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { SiteStatus, type SiteFeatureCollection } from '@/types';

/* ---------- status colour map ---------- */

const STATUS_FILL: Record<string, string> = {
  [SiteStatus.DETECTED]: '#FCD34D',
  [SiteStatus.CONFIRMED]: '#F97316',
  [SiteStatus.ACTIVE]: '#EF4444',
  [SiteStatus.ESCALATED]: '#991B1B',
  [SiteStatus.UNDER_OPERATION]: '#FB923C',
  [SiteStatus.DISMANTLED]: '#22C55E',
  [SiteStatus.REHABILITATED]: '#86EFAC',
  [SiteStatus.MONITORING]: '#A855F7',
};

const STATUS_BORDER: Record<string, string> = {
  [SiteStatus.DETECTED]: '#CA8A04',
  [SiteStatus.CONFIRMED]: '#C2410C',
  [SiteStatus.ACTIVE]: '#B91C1C',
  [SiteStatus.ESCALATED]: '#450A0A',
  [SiteStatus.UNDER_OPERATION]: '#9A3412',
  [SiteStatus.DISMANTLED]: '#15803D',
  [SiteStatus.REHABILITATED]: '#166534',
  [SiteStatus.MONITORING]: '#7E22CE',
};

/** Build a MapLibre match expression for a given colour map. */
function matchExpr(
  colorMap: Record<string, string>,
  fallback: string,
): maplibregl.ExpressionSpecification {
  const entries: (string | string[])[] = [];
  for (const [key, value] of Object.entries(colorMap)) {
    entries.push(key, value);
  }
  return [
    'match',
    ['get', 'status'],
    ...entries,
    fallback,
  ] as unknown as maplibregl.ExpressionSpecification;
}

/* ---------- props ---------- */

interface SiteLayerProps {
  map: maplibregl.Map | null;
  data: SiteFeatureCollection | null;
  visible?: boolean;
}

/* ---------- component ---------- */

export default function SiteLayer({ map, data, visible = true }: SiteLayerProps) {
  useEffect(() => {
    if (!map) return;

    const emptyCollection: SiteFeatureCollection = { type: 'FeatureCollection', features: [] };

    // Wait for style to finish loading (important after basemap switch)
    const setup = () => {
      // ---- source ----
      if (!map.getSource('sites')) {
        map.addSource('sites', {
          type: 'geojson',
          data: (data ?? emptyCollection) as unknown as GeoJSON.FeatureCollection,
        });
      } else {
        (map.getSource('sites') as maplibregl.GeoJSONSource).setData(
          (data ?? emptyCollection) as unknown as GeoJSON.FeatureCollection,
        );
      }

      // ---- circle layer (sites are Points in the updated schema) ----
      if (!map.getLayer('sites-circle')) {
        map.addLayer({
          id: 'sites-circle',
          type: 'circle',
          source: 'sites',
          paint: {
            'circle-color': matchExpr(STATUS_FILL, '#9CA3AF'),
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['get', 'area_hectares'],
              0, 6,
              50, 14,
              200, 20,
            ],
            'circle-opacity': 0.75,
            'circle-stroke-color': matchExpr(STATUS_BORDER, '#6B7280'),
            'circle-stroke-width': 2,
          },
        });
      }

      // ---- visibility ----
      const vis = visible ? 'visible' : 'none';
      map.setLayoutProperty('sites-circle', 'visibility', vis);
    };

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once('styledata', setup);
    }

    // ---- interactions ----
    const onClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      const props = e.features[0].properties;
      const coords = e.lngLat;

      new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
        .setLngLat(coords)
        .setHTML(
          `<div class="space-y-1">
            <p class="font-semibold text-gray-900">${props.name}</p>
            <p><span class="text-gray-500">Statut:</span> <span class="font-medium">${props.status}</span></p>
            <p><span class="text-gray-500">Confiance IA:</span> ${Math.round(Number(props.ai_confidence_score) * 100)}%</p>
            <p><span class="text-gray-500">Superficie:</span> ${Number(props.area_hectares).toFixed(2)} ha</p>
          </div>`,
        )
        .addTo(map);
    };

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', 'sites-circle', onClick);
    map.on('mouseenter', 'sites-circle', onMouseEnter);
    map.on('mouseleave', 'sites-circle', onMouseLeave);

    return () => {
      map.off('click', 'sites-circle', onClick);
      map.off('mouseenter', 'sites-circle', onMouseEnter);
      map.off('mouseleave', 'sites-circle', onMouseLeave);
    };
  }, [map, data, visible]);

  return null; // purely imperative -- renders nothing to DOM
}
