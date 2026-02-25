'use client';

/* ============================================
   HeatmapLayer - H3 density heatmap
   ============================================ */

import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';

/* ---------- types ---------- */

export interface H3Cell {
  h3_index: string;
  count: number;
  latitude: number;
  longitude: number;
}

/* ---------- helpers ---------- */

/** Convert H3Cell[] into a GeoJSON FeatureCollection of points. */
function cellsToGeoJSON(cells: H3Cell[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cells.map((cell) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [cell.longitude, cell.latitude],
      },
      properties: {
        h3_index: cell.h3_index,
        count: cell.count,
      },
    })),
  };
}

/* ---------- props ---------- */

interface HeatmapLayerProps {
  map: maplibregl.Map | null;
  data: H3Cell[];
  visible?: boolean;
}

/* ---------- component ---------- */

export default function HeatmapLayer({ map, data, visible = true }: HeatmapLayerProps) {
  useEffect(() => {
    if (!map) return;

    const setup = () => {
      const geojson = cellsToGeoJSON(data);

      // ---- source ----
      if (!map.getSource('h3-heatmap')) {
        map.addSource('h3-heatmap', {
          type: 'geojson',
          data: geojson,
        });
      } else {
        (map.getSource('h3-heatmap') as maplibregl.GeoJSONSource).setData(geojson);
      }

      // ---- heatmap layer ----
      if (!map.getLayer('h3-heatmap-layer')) {
        map.addLayer({
          id: 'h3-heatmap-layer',
          type: 'heatmap',
          source: 'h3-heatmap',
          paint: {
            // Increase weight by count property
            'heatmap-weight': [
              'interpolate',
              ['linear'],
              ['get', 'count'],
              0, 0,
              10, 1,
            ],
            // Increase intensity as zoom level increases
            'heatmap-intensity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, 1,
              12, 3,
            ],
            // Colour ramp: transparent -> yellow -> orange -> red
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(0,0,0,0)',
              0.2, 'rgba(254,240,138,0.6)',
              0.4, 'rgba(253,224,71,0.7)',
              0.6, 'rgba(251,191,36,0.8)',
              0.8, 'rgba(249,115,22,0.85)',
              1.0, 'rgba(220,38,38,0.9)',
            ],
            // Radius in pixels
            'heatmap-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, 15,
              12, 30,
            ],
            // Fade out at high zoom
            'heatmap-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              7, 0.85,
              15, 0.3,
            ],
          },
        });
      }

      // ---- visibility ----
      const vis = visible ? 'visible' : 'none';
      map.setLayoutProperty('h3-heatmap-layer', 'visibility', vis);
    };

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once('styledata', setup);
    }
  }, [map, data, visible]);

  return null;
}
