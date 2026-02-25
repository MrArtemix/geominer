'use client';

/* ============================================
   AlertLayer - Pulsing circle markers for alerts
   ============================================ */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { AlertSeverity, type Alert } from '@/types';

/* ---------- severity colours ---------- */

const SEVERITY_COLOR: Record<string, string> = {
  [AlertSeverity.LOW]: '#3B82F6',
  [AlertSeverity.MEDIUM]: '#F59E0B',
  [AlertSeverity.HIGH]: '#EF4444',
  [AlertSeverity.CRITICAL]: '#7F1D1D',
};

/* ---------- helpers ---------- */

/** Create a pulsing dot element for a given colour. */
function createPulsingDot(color: string, critical: boolean): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '18px';
  el.style.height = '18px';
  el.style.borderRadius = '50%';
  el.style.backgroundColor = color;
  el.style.border = '2px solid white';
  el.style.boxShadow = `0 0 0 0 ${color}80`;
  el.style.cursor = 'pointer';

  if (critical) {
    el.style.animation = 'pulse-critical 1.2s ease-in-out infinite';
  } else {
    el.style.animation = 'pulse-alert 2s ease-in-out infinite';
  }

  return el;
}

/* ---------- inject keyframes once ---------- */

let styleInjected = false;
function injectKeyframes() {
  if (styleInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse-alert {
      0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
      70%  { box-shadow: 0 0 0 12px rgba(239,68,68,0); }
      100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
    }
    @keyframes pulse-critical {
      0%   { box-shadow: 0 0 0 0 rgba(127,29,29,0.7); transform: scale(1); }
      50%  { box-shadow: 0 0 0 16px rgba(127,29,29,0); transform: scale(1.15); }
      100% { box-shadow: 0 0 0 0 rgba(127,29,29,0); transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
  styleInjected = true;
}

/* ---------- props ---------- */

interface AlertLayerProps {
  map: maplibregl.Map | null;
  alerts: Alert[];
  visible?: boolean;
}

/* ---------- component ---------- */

export default function AlertLayer({ map, alerts, visible = true }: AlertLayerProps) {
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!map) return;
    injectKeyframes();

    // Remove previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!visible) return;

    alerts.forEach((alert) => {
      if (alert.latitude == null || alert.longitude == null) return;

      const color = SEVERITY_COLOR[alert.severity] ?? '#6B7280';
      const el = createPulsingDot(color, alert.severity === AlertSeverity.CRITICAL);

      const popup = new maplibregl.Popup({ offset: 12, maxWidth: '260px' }).setHTML(
        `<div class="space-y-1">
          <p class="font-semibold text-gray-900">${alert.title}</p>
          <p class="text-gray-600 text-xs">${alert.description}</p>
          <span
            class="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium"
            style="background:${color}22;color:${color}"
          >
            ${alert.severity}
          </span>
        </div>`,
      );

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

  return null;
}
