'use client';

/* ==========================================================================
   AlertLayer - Marqueurs d'alertes avec pulsation

   Fonctionnalites :
   - Marqueurs cercle colores par severite (LOW/MEDIUM/HIGH/CRITICAL)
   - Animation pulsation CSS (plus intense pour CRITICAL)
   - Popup au clic : titre, description, badge severite, date
   ========================================================================== */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { AlertSeverity, type Alert } from '@/types';

/* ---------- Couleurs et labels par severite ---------- */

const SEVERITY_COLOR: Record<string, string> = {
  [AlertSeverity.LOW]: '#3B82F6',
  [AlertSeverity.MEDIUM]: '#F59E0B',
  [AlertSeverity.HIGH]: '#EF4444',
  [AlertSeverity.CRITICAL]: '#7F1D1D',
};

const SEVERITY_LABEL: Record<string, string> = {
  [AlertSeverity.CRITICAL]: 'Critique',
  [AlertSeverity.HIGH]: 'Eleve',
  [AlertSeverity.MEDIUM]: 'Modere',
  [AlertSeverity.LOW]: 'Faible',
};

/* ---------- Icones SVG par severite ---------- */

const SEVERITY_ICON: Record<string, string> = {
  [AlertSeverity.LOW]: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  [AlertSeverity.MEDIUM]: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  [AlertSeverity.HIGH]: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  [AlertSeverity.CRITICAL]: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
};

/* ---------- Creation du marqueur pulsant ---------- */

/**
 * Cree un element DOM marqueur avec animation de pulsation.
 */
function createPulsingDot(color: string, severity: string): HTMLDivElement {
  const el = document.createElement('div');
  const isCritical = severity === AlertSeverity.CRITICAL;
  const isHigh = severity === AlertSeverity.HIGH;
  const size = isCritical ? 22 : isHigh ? 20 : 18;

  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = '50%';
  el.style.backgroundColor = color;
  el.style.border = '2.5px solid rgba(255,255,255,0.9)';
  el.style.boxShadow = `0 0 0 0 ${color}80, 0 2px 8px rgba(0,0,0,0.3)`;
  el.style.cursor = 'pointer';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.transition = 'transform 0.2s ease';

  // Icone a l'interieur
  el.innerHTML = SEVERITY_ICON[severity] ?? '';

  // Animation selon la severite
  if (isCritical) {
    el.style.animation = 'alert-pulse-critical 1.2s ease-in-out infinite';
  } else if (isHigh) {
    el.style.animation = 'alert-pulse-high 1.6s ease-in-out infinite';
  } else {
    el.style.animation = 'alert-pulse-default 2.5s ease-in-out infinite';
  }

  return el;
}

/* ---------- Injection des keyframes CSS ---------- */

let alertStyleInjected = false;
function injectAlertKeyframes() {
  if (alertStyleInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes alert-pulse-default {
      0%   { box-shadow: 0 0 0 0 rgba(59,130,246,0.4), 0 2px 8px rgba(0,0,0,0.3); }
      70%  { box-shadow: 0 0 0 10px rgba(59,130,246,0), 0 2px 8px rgba(0,0,0,0.3); }
      100% { box-shadow: 0 0 0 0 rgba(59,130,246,0), 0 2px 8px rgba(0,0,0,0.3); }
    }
    @keyframes alert-pulse-high {
      0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.5), 0 2px 8px rgba(0,0,0,0.3); }
      70%  { box-shadow: 0 0 0 12px rgba(239,68,68,0), 0 2px 8px rgba(0,0,0,0.3); }
      100% { box-shadow: 0 0 0 0 rgba(239,68,68,0), 0 2px 8px rgba(0,0,0,0.3); }
    }
    @keyframes alert-pulse-critical {
      0%   { box-shadow: 0 0 0 0 rgba(127,29,29,0.7), 0 2px 8px rgba(0,0,0,0.3); transform: scale(1); }
      50%  { box-shadow: 0 0 0 16px rgba(127,29,29,0), 0 2px 8px rgba(0,0,0,0.3); transform: scale(1.15); }
      100% { box-shadow: 0 0 0 0 rgba(127,29,29,0), 0 2px 8px rgba(0,0,0,0.3); transform: scale(1); }
    }
    /* Popup alerte enrichie */
    .alert-popup {
      min-width: 240px;
      font-family: inherit;
    }
    .alert-popup .alert-popup-header {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
    }
    .alert-popup .alert-popup-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .alert-popup .alert-popup-title {
      font-weight: 700;
      font-size: 13px;
      color: #f1f5f9;
      line-height: 1.3;
    }
    .alert-popup .alert-popup-desc {
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.4;
      margin-top: 4px;
    }
    .alert-popup .alert-popup-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
    }
    .alert-popup .alert-popup-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .alert-popup .alert-popup-date {
      font-size: 10px;
      color: #64748b;
    }
  `;
  document.head.appendChild(style);
  alertStyleInjected = true;
}

/* ---------- Props ---------- */

interface AlertLayerProps {
  /** Instance de la carte MapLibre */
  map: maplibregl.Map | null;
  /** Liste des alertes a afficher */
  alerts: Alert[];
  /** Couche visible ou non */
  visible?: boolean;
}

/* ---------- Composant ---------- */

export default function AlertLayer({ map, alerts, visible = true }: AlertLayerProps) {
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!map) return;
    injectAlertKeyframes();

    // Nettoyage des marqueurs precedents
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!visible) return;

    alerts.forEach((alert) => {
      if (alert.latitude == null || alert.longitude == null) return;

      const color = SEVERITY_COLOR[alert.severity] ?? '#6B7280';
      const label = SEVERITY_LABEL[alert.severity] ?? alert.severity;
      const el = createPulsingDot(color, alert.severity);

      // Formatage de la date
      const date = alert.created_at
        ? new Date(alert.created_at).toLocaleString('fr-FR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'N/A';

      // Lien vers le site associe
      const siteLink = alert.site_id
        ? `<div style="margin-top:6px;font-size:11px;color:#94a3b8;">
            Site : <a href="/sites/${alert.site_id}" style="color:#fbbf24;text-decoration:underline;">${alert.site_name ?? alert.site_id}</a>
           </div>`
        : '';

      const popupHTML = `
        <div class="alert-popup">
          <div class="alert-popup-header">
            <div class="alert-popup-icon" style="background:${color}22;border:1px solid ${color}44;">
              ${SEVERITY_ICON[alert.severity] ?? ''}
            </div>
            <div>
              <div class="alert-popup-title">${alert.title}</div>
              <div class="alert-popup-desc">${alert.description}</div>
            </div>
          </div>
          ${siteLink}
          <div class="alert-popup-meta">
            <span class="alert-popup-badge" style="background:${color}22;color:${color};border:1px solid ${color}44;">
              ${label}
            </span>
            <span class="alert-popup-date">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" style="display:inline;vertical-align:middle;margin-right:2px;">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              ${date}
            </span>
          </div>
        </div>
      `;

      const popup = new maplibregl.Popup({
        offset: 12,
        maxWidth: '280px',
        closeButton: true,
      }).setHTML(popupHTML);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([alert.longitude, alert.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [map, alerts, visible]);

  // Composant purement imperatif
  return null;
}
