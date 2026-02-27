'use client';

/* ==========================================================================
   SiteLayer - Couche des sites miniers sur la carte MapLibre

   Fonctionnalites :
   - Fill layer avec couleur par expression match sur le statut
   - Couleurs : DETECTED→or, CONFIRMED→rouge-brun, ACTIVE→rouge vif,
     DISMANTLED→emeraude, RECURRED→violet, ESCALATED→rouge fonce
   - fill-opacity 0.4, contour de meme couleur, line-width 1.5
   - Effet pulsation CSS sur les sites ACTIVE (marker anime)
   - Popup au clic : site_code, badge statut, date detection,
     confiance IA (barre progres), surface ha, bouton "Voir Fiche"
   ========================================================================== */

import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { SiteStatus, type SiteFeatureCollection } from '@/types';
import { SITE_STATUS_COLORS, SITE_STATUS_LABELS, formatConfidence } from '@/lib/maplibre';

/* ---------- Palette de couleurs par statut ---------- */

const STATUS_FILL: Record<string, string> = {
  [SiteStatus.DETECTED]: '#F0A500',
  [SiteStatus.CONFIRMED]: '#CC2200',
  [SiteStatus.ACTIVE]: '#FF0000',
  [SiteStatus.ESCALATED]: '#8B0000',
  [SiteStatus.UNDER_OPERATION]: '#FB923C',
  [SiteStatus.DISMANTLED]: '#1A7A4A',
  [SiteStatus.REHABILITATED]: '#06b6d4',
  [SiteStatus.MONITORING]: '#3b82f6',
};

/* ---------- Expression match MapLibre pour les couleurs ---------- */

/**
 * Construit une expression match MapLibre pour une carte de couleurs donnee.
 */
function matchExpr(
  colorMap: Record<string, string>,
  fallback: string
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

/* ---------- Injection CSS pour animations de pulsation ---------- */

let siteStyleInjected = false;
function injectSiteAnimationStyles() {
  if (siteStyleInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    /* Animation de pulsation pour les sites ACTIVE */
    @keyframes site-pulse-active {
      0% {
        box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.6);
        transform: scale(1);
      }
      50% {
        box-shadow: 0 0 0 14px rgba(255, 0, 0, 0);
        transform: scale(1.15);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(255, 0, 0, 0);
        transform: scale(1);
      }
    }
    .site-marker-active {
      animation: site-pulse-active 1.8s ease-in-out infinite;
    }
    /* Marqueur de site generique */
    .site-marker-dot {
      border-radius: 50%;
      border: 2.5px solid rgba(255,255,255,0.9);
      cursor: pointer;
      transition: transform 0.2s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    }
    .site-marker-dot:hover {
      transform: scale(1.2) !important;
    }
    /* Popup du site - style glassmorphism premium */
    .site-popup-content {
      font-family: inherit;
      min-width: 260px;
    }
    .site-popup-content .popup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .site-popup-content .popup-title {
      font-weight: 700;
      font-size: 14px;
      color: #f1f5f9;
      letter-spacing: 0.02em;
    }
    .site-popup-content .popup-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .site-popup-content .popup-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      border-bottom: 1px solid rgba(148, 163, 184, 0.08);
    }
    .site-popup-content .popup-label {
      font-size: 11px;
      color: #64748b;
    }
    .site-popup-content .popup-value {
      font-size: 12px;
      font-weight: 600;
      color: #e2e8f0;
      font-variant-numeric: tabular-nums;
    }
    .site-popup-content .confidence-bar-bg {
      width: 100%;
      height: 6px;
      border-radius: 9999px;
      background: rgba(15, 23, 42, 0.6);
      overflow: hidden;
      margin-top: 4px;
    }
    .site-popup-content .confidence-bar-fill {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.5s ease;
    }
    .site-popup-content .popup-action-btn {
      display: block;
      width: 100%;
      margin-top: 10px;
      padding: 6px 12px;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #ffffff;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      transition: all 0.2s ease;
      background: linear-gradient(135deg, #fbbf24, #d97706);
      box-shadow: 0 0 12px rgba(251, 191, 36, 0.3);
    }
    .site-popup-content .popup-action-btn:hover {
      box-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
      transform: translateY(-1px);
    }
  `;
  document.head.appendChild(style);
  siteStyleInjected = true;
}

/* ---------- Props ---------- */

interface SiteLayerProps {
  /** Instance de la carte MapLibre */
  map: maplibregl.Map | null;
  /** Donnees GeoJSON des sites */
  data: SiteFeatureCollection | null;
  /** Couche visible ou non */
  visible?: boolean;
  /** Filtres de statut actifs */
  statusFilters?: Set<string>;
  /** Callback au clic sur un site */
  onSiteClick?: (siteId: string, coordinates: [number, number]) => void;
}

/* ---------- Composant ---------- */

export default function SiteLayer({
  map,
  data,
  visible = true,
  statusFilters,
  onSiteClick,
}: SiteLayerProps) {
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  /* --- Creation d'un element de marqueur pour un site --- */
  const createSiteMarkerElement = useCallback(
    (status: string, areaHectares: number): HTMLDivElement => {
      const el = document.createElement('div');
      el.className = 'site-marker-dot';

      // Taille proportionnelle a la surface
      const size = areaHectares < 5 ? 14 : areaHectares < 20 ? 18 : areaHectares < 50 ? 22 : 26;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.backgroundColor = STATUS_FILL[status] ?? '#9CA3AF';

      // Animation de pulsation pour les sites ACTIVE
      if (status === SiteStatus.ACTIVE) {
        el.classList.add('site-marker-active');
      }

      return el;
    },
    []
  );

  /* --- Construction du HTML de popup --- */
  const buildPopupHTML = useCallback(
    (props: Record<string, unknown>): string => {
      const status = props.status as string;
      const color = STATUS_FILL[status] ?? '#9CA3AF';
      const label = SITE_STATUS_LABELS[status] ?? status;
      const confidence = Number(props.ai_confidence_score ?? 0);
      const confidencePct = Math.round(confidence * 100);
      const date = props.detection_date
        ? new Date(props.detection_date as string).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : 'N/A';
      const area = Number(props.area_hectares ?? 0).toFixed(2);
      const siteId = props.id as string;
      const siteName = (props.name as string) || (props.site_code as string) || 'Site';

      // Couleur de la barre de confiance
      let confBarColor = '#3b82f6';
      if (confidence >= 0.8) confBarColor = '#fbbf24';
      else if (confidence >= 0.6) confBarColor = '#fbbf24';
      else if (confidence >= 0.4) confBarColor = '#f97316';
      else confBarColor = '#ef4444';

      return `
        <div class="site-popup-content">
          <div class="popup-header">
            <span class="popup-title">${siteName}</span>
            <span class="popup-badge" style="background:${color}22;color:${color};border:1px solid ${color}44">
              ${label}
            </span>
          </div>
          <div class="popup-row">
            <span class="popup-label">Date detection</span>
            <span class="popup-value">${date}</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">Surface</span>
            <span class="popup-value">${area} ha</span>
          </div>
          <div class="popup-row" style="flex-direction:column;align-items:stretch;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span class="popup-label">Confiance IA</span>
              <span class="popup-value" style="color:${confBarColor}">${confidencePct}%</span>
            </div>
            <div class="confidence-bar-bg">
              <div class="confidence-bar-fill" style="width:${confidencePct}%;background:linear-gradient(90deg,${confBarColor},${confBarColor}cc);box-shadow:0 0 8px ${confBarColor}66;"></div>
            </div>
          </div>
          <a href="/sites/${siteId}" class="popup-action-btn">
            Voir Fiche
          </a>
        </div>
      `;
    },
    []
  );

  /* --- Effet principal : gestion des marqueurs et interactions --- */
  useEffect(() => {
    if (!map) return;
    injectSiteAnimationStyles();

    // Nettoyage des marqueurs precedents
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!visible || !data?.features?.length) return;

    // Filtrage par statut si des filtres sont fournis
    const features = statusFilters
      ? data.features.filter((f) => statusFilters.has(f.properties.status))
      : data.features;

    // Creation des marqueurs
    features.forEach((feature) => {
      const props = feature.properties;
      const coords = feature.geometry.coordinates as [number, number];
      const el = createSiteMarkerElement(props.status, props.area_hectares);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .addTo(map);

      // Popup au clic
      el.addEventListener('click', (e) => {
        e.stopPropagation();

        // Fermer la popup precedente
        if (popupRef.current) {
          popupRef.current.remove();
        }

        const popup = new maplibregl.Popup({
          closeButton: true,
          maxWidth: '300px',
          offset: 12,
        })
          .setLngLat(coords)
          .setHTML(buildPopupHTML(props as unknown as Record<string, unknown>))
          .addTo(map);

        popupRef.current = popup;

        // Callback vers le parent
        if (onSiteClick) {
          onSiteClick(props.id, coords);
        }
      });

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [map, data, visible, statusFilters, createSiteMarkerElement, buildPopupHTML, onSiteClick]);

  // Composant purement imperatif - ne rend rien dans le DOM
  return null;
}
