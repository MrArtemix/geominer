'use client';

/* ==========================================================================
   HeatmapLayer - Couche Heatmap H3 de risque

   Fonctionnalites :
   - Fill layer hexagones H3 avec couleur interpolee sur risk_score
   - Palette : vert(0) → jaune(0.5) → rouge(1), fill-opacity 0.55
   - Tooltip au survol : h3_index, risk_score %, top 3 facteurs de risque
   - Toggle on/off via prop visible
   ========================================================================== */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

/* ---------- Types ---------- */

/** Cellule H3 avec score de risque et facteurs */
export interface H3RiskCell {
  /** Index hexagonal H3 */
  h3_index: string;
  /** Score de risque normalise 0→1 */
  risk_score: number;
  /** Nombre de sites dans la cellule */
  count: number;
  /** Latitude du centroide */
  latitude: number;
  /** Longitude du centroide */
  longitude: number;
  /** Top facteurs de risque */
  risk_factors?: string[];
}

/** Compatibilite arriere avec l'ancien type H3Cell */
export interface H3Cell {
  h3_index: string;
  count: number;
  latitude: number;
  longitude: number;
  risk_score?: number;
  risk_factors?: string[];
}

/* ---------- Injection CSS pour le tooltip ---------- */

let heatmapStyleInjected = false;
function injectHeatmapStyles() {
  if (heatmapStyleInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    .h3-tooltip {
      pointer-events: none;
      position: absolute;
      z-index: 50;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 12px;
      line-height: 1.5;
      color: #f1f5f9;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(148, 163, 184, 0.15);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      transform: translate(-50%, -120%);
      white-space: nowrap;
      transition: opacity 0.15s ease;
    }
    .h3-tooltip .tooltip-index {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .h3-tooltip .tooltip-score {
      font-size: 16px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .h3-tooltip .tooltip-label {
      font-size: 10px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .h3-tooltip .tooltip-factors {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(148, 163, 184, 0.12);
    }
    .h3-tooltip .tooltip-factor-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #cbd5e1;
      padding: 1px 0;
    }
    .h3-tooltip .tooltip-factor-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #fbbf24;
      flex-shrink: 0;
    }
  `;
  document.head.appendChild(style);
  heatmapStyleInjected = true;
}

/* ---------- Utilitaires ---------- */

/** Convertit un tableau de H3Cell/H3RiskCell en GeoJSON FeatureCollection de points */
function cellsToGeoJSON(cells: (H3Cell | H3RiskCell)[]): GeoJSON.FeatureCollection {
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
        risk_score: cell.risk_score ?? (cell.count / 10), // Normalisation si pas de risk_score
        count: cell.count,
        risk_factors: cell.risk_factors ?? [],
      },
    })),
  };
}

/** Retourne la couleur interpolee pour un risk_score */
function getRiskColor(score: number): string {
  if (score <= 0.2) return '#fbbf24';
  if (score <= 0.4) return '#84cc16';
  if (score <= 0.5) return '#eab308';
  if (score <= 0.6) return '#f97316';
  if (score <= 0.8) return '#ef4444';
  return '#991b1b';
}

/* ---------- Constantes des layers ---------- */

const SOURCE_ID = 'h3-risk-source';
const HEATMAP_LAYER_ID = 'h3-risk-heatmap';
const CIRCLE_LAYER_ID = 'h3-risk-circles';

/* ---------- Props ---------- */

interface HeatmapLayerProps {
  /** Instance de la carte MapLibre */
  map: maplibregl.Map | null;
  /** Donnees des cellules H3 */
  data: (H3Cell | H3RiskCell)[];
  /** Couche visible ou non */
  visible?: boolean;
}

/* ---------- Composant ---------- */

export default function HeatmapLayer({ map, data, visible = true }: HeatmapLayerProps) {
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!map) return;
    injectHeatmapStyles();

    const setup = () => {
      const geojson = cellsToGeoJSON(data);

      /* --- Source GeoJSON --- */
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: 'geojson',
          data: geojson,
        });
      } else {
        (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(geojson);
      }

      /* --- Couche Heatmap classique (basse resolution) --- */
      if (!map.getLayer(HEATMAP_LAYER_ID)) {
        map.addLayer({
          id: HEATMAP_LAYER_ID,
          type: 'heatmap',
          source: SOURCE_ID,
          maxzoom: 10,
          paint: {
            // Poids base sur risk_score
            'heatmap-weight': [
              'interpolate',
              ['linear'],
              ['get', 'risk_score'],
              0, 0,
              0.5, 0.5,
              1, 1,
            ],
            // Intensite augmente avec le zoom
            'heatmap-intensity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3, 0.5,
              10, 2,
            ],
            // Palette vert → jaune → rouge
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(0, 0, 0, 0)',
              0.1, 'rgba(251, 191, 36, 0.3)',
              0.3, 'rgba(132, 204, 22, 0.5)',
              0.5, 'rgba(234, 179, 8, 0.6)',
              0.7, 'rgba(249, 115, 22, 0.75)',
              0.9, 'rgba(239, 68, 68, 0.85)',
              1.0, 'rgba(153, 27, 27, 0.95)',
            ],
            // Rayon en pixels
            'heatmap-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3, 20,
              10, 40,
            ],
            // Opacite generale
            'heatmap-opacity': 0.55,
          },
        });
      }

      /* --- Couche cercles H3 (haute resolution, visible a partir du zoom 8) --- */
      if (!map.getLayer(CIRCLE_LAYER_ID)) {
        map.addLayer({
          id: CIRCLE_LAYER_ID,
          type: 'circle',
          source: SOURCE_ID,
          minzoom: 8,
          paint: {
            // Couleur interpolee sur risk_score : vert → jaune → rouge
            'circle-color': [
              'interpolate',
              ['linear'],
              ['get', 'risk_score'],
              0, '#fbbf24',
              0.25, '#84cc16',
              0.5, '#eab308',
              0.75, '#f97316',
              1.0, '#ef4444',
            ] as unknown as maplibregl.ExpressionSpecification,
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              8, 8,
              14, 24,
            ],
            'circle-opacity': 0.55,
            'circle-stroke-color': [
              'interpolate',
              ['linear'],
              ['get', 'risk_score'],
              0, '#b45309',
              0.5, '#b45309',
              1.0, '#991b1b',
            ] as unknown as maplibregl.ExpressionSpecification,
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0.7,
          },
        });
      }

      /* --- Visibilite --- */
      const vis = visible ? 'visible' : 'none';
      if (map.getLayer(HEATMAP_LAYER_ID)) {
        map.setLayoutProperty(HEATMAP_LAYER_ID, 'visibility', vis);
      }
      if (map.getLayer(CIRCLE_LAYER_ID)) {
        map.setLayoutProperty(CIRCLE_LAYER_ID, 'visibility', vis);
      }
    };

    if (map.isStyleLoaded()) {
      setup();
    } else {
      map.once('styledata', setup);
    }

    /* --- Tooltip au survol des cercles H3 --- */
    let tooltipEl: HTMLDivElement | null = null;

    const createTooltip = () => {
      if (tooltipRef.current) return tooltipRef.current;
      const el = document.createElement('div');
      el.className = 'h3-tooltip';
      el.style.opacity = '0';
      el.style.position = 'fixed';
      document.body.appendChild(el);
      tooltipRef.current = el;
      tooltipEl = el;
      return el;
    };

    const onMouseMove = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = 'crosshair';

      const props = e.features[0].properties;
      const riskScore = Number(props?.risk_score ?? 0);
      const h3Index = props?.h3_index ?? '';
      const count = Number(props?.count ?? 0);
      const color = getRiskColor(riskScore);

      // Facteurs de risque (JSON parse si necessaire)
      let factors: string[] = [];
      try {
        const rawFactors = props?.risk_factors;
        if (typeof rawFactors === 'string') {
          factors = JSON.parse(rawFactors);
        } else if (Array.isArray(rawFactors)) {
          factors = rawFactors;
        }
      } catch {
        factors = [];
      }
      const topFactors = factors.slice(0, 3);

      const tooltip = createTooltip();
      tooltip.innerHTML = `
        <div class="tooltip-index">${h3Index}</div>
        <div style="display:flex;align-items:baseline;gap:6px;">
          <span class="tooltip-score" style="color:${color}">${Math.round(riskScore * 100)}%</span>
          <span class="tooltip-label">score de risque</span>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${count} site${count > 1 ? 's' : ''} detecte${count > 1 ? 's' : ''}</div>
        ${topFactors.length > 0 ? `
          <div class="tooltip-factors">
            <div class="tooltip-label" style="margin-bottom:3px;">Facteurs de risque</div>
            ${topFactors.map((f) => `
              <div class="tooltip-factor-item">
                <span class="tooltip-factor-dot"></span>
                ${f}
              </div>
            `).join('')}
          </div>
        ` : ''}
      `;

      // Positionner le tooltip
      const point = e.point;
      tooltip.style.left = `${point.x}px`;
      tooltip.style.top = `${point.y - 10}px`;
      tooltip.style.opacity = '1';
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
      if (tooltipRef.current) {
        tooltipRef.current.style.opacity = '0';
      }
    };

    map.on('mousemove', CIRCLE_LAYER_ID, onMouseMove);
    map.on('mouseleave', CIRCLE_LAYER_ID, onMouseLeave);

    return () => {
      map.off('mousemove', CIRCLE_LAYER_ID, onMouseMove);
      map.off('mouseleave', CIRCLE_LAYER_ID, onMouseLeave);
      if (tooltipEl) {
        tooltipEl.remove();
        tooltipRef.current = null;
      }
    };
  }, [map, data, visible]);

  // Composant purement imperatif
  return null;
}
