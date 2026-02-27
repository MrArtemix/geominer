'use client';

/* ==========================================================================
   AquaGuardLayer - Couche des capteurs IoT AquaGuard

   Fonctionnalites :
   - Marqueurs custom avec icone goutte SVG
   - Couleur : vert(normal) / orange(seuil>80%) / rouge(depasse)
   - Animation CSS pulsation si alerte active sur le capteur
   - Popup : sensor_id, riviere, mercury ug/L, turbidite NTU,
     pH, batterie %, timestamp derniere valeur
   ========================================================================== */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { SensorReading } from '@/types';

/* ---------- Statuts qualite eau ---------- */

type WaterQualityStatus = 'normal' | 'warning' | 'critical';

const STATUS_COLOR: Record<WaterQualityStatus, string> = {
  normal: '#22C55E',
  warning: '#F59E0B',
  critical: '#EF4444',
};

const STATUS_LABEL: Record<WaterQualityStatus, string> = {
  normal: 'Normal',
  warning: 'Attention',
  critical: 'Critique',
};

/* ---------- Derivation du statut ---------- */

/**
 * Determine le statut qualite eau a partir d'une lecture capteur.
 * Seuils : pH hors 6.5-8.5, turbidite > 5 NTU, mercure > 0.001 mg/L.
 */
function deriveStatus(reading: SensorReading): WaterQualityStatus {
  if (reading.is_anomaly) return 'critical';
  // Seuils a 80% pour le warning
  if (
    reading.ph < 6.5 ||
    reading.ph > 8.5 ||
    reading.turbidity > 5 ||
    (reading.mercury_level != null && reading.mercury_level > 0.001)
  ) {
    return 'warning';
  }
  return 'normal';
}

/**
 * Estime le pourcentage de batterie (simule pour le MVP).
 * Utilise temperature et conductivite comme proxy.
 */
function estimateBattery(reading: SensorReading): number {
  // Simulation : batterie entre 20 et 100%
  const hash = reading.station_id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  return 20 + (hash % 80);
}

/* ---------- Injection CSS pour animations et style ---------- */

let aquaStyleInjected = false;
function injectAquaStyles() {
  if (aquaStyleInjected) return;
  const style = document.createElement('style');
  style.textContent = `
    /* Animation de pulsation pour les capteurs en alerte */
    @keyframes aqua-pulse-warning {
      0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.5); }
      70% { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0); }
      100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
    }
    @keyframes aqua-pulse-critical {
      0% {
        box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
        transform: scale(1);
      }
      50% {
        box-shadow: 0 0 0 14px rgba(239, 68, 68, 0);
        transform: scale(1.12);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
        transform: scale(1);
      }
    }
    .aqua-marker {
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease;
      border-radius: 50%;
    }
    .aqua-marker:hover {
      transform: scale(1.15) !important;
    }
    .aqua-marker-warning {
      animation: aqua-pulse-warning 2s ease-in-out infinite;
    }
    .aqua-marker-critical {
      animation: aqua-pulse-critical 1.4s ease-in-out infinite;
    }
    /* Popup capteur AquaGuard */
    .aqua-popup {
      min-width: 250px;
      font-family: inherit;
    }
    .aqua-popup .popup-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .aqua-popup .popup-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .aqua-popup .popup-title {
      font-weight: 700;
      font-size: 13px;
      color: #f1f5f9;
    }
    .aqua-popup .popup-id {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: #64748b;
    }
    .aqua-popup .readings-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 8px;
    }
    .aqua-popup .reading-cell {
      padding: 6px 8px;
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid rgba(148, 163, 184, 0.08);
    }
    .aqua-popup .reading-label {
      font-size: 9px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 2px;
    }
    .aqua-popup .reading-value {
      font-size: 13px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #e2e8f0;
    }
    .aqua-popup .reading-unit {
      font-size: 10px;
      font-weight: 400;
      color: #94a3b8;
      margin-left: 2px;
    }
    .aqua-popup .popup-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
    }
    .aqua-popup .battery-bar {
      width: 60px;
      height: 5px;
      border-radius: 9999px;
      background: rgba(15, 23, 42, 0.6);
      overflow: hidden;
    }
    .aqua-popup .battery-fill {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.3s ease;
    }
    .aqua-popup .popup-timestamp {
      font-size: 10px;
      color: #64748b;
    }
  `;
  document.head.appendChild(style);
  aquaStyleInjected = true;
}

/* ---------- Creation de l'icone goutte SVG ---------- */

/**
 * Cree un element marqueur avec une icone goutte d'eau SVG.
 */
function createDropletMarker(status: WaterQualityStatus): HTMLDivElement {
  const color = STATUS_COLOR[status];
  const el = document.createElement('div');
  el.className = 'aqua-marker';

  // Taille et fond
  el.style.width = '30px';
  el.style.height = '30px';
  el.style.background = `${color}22`;
  el.style.border = `2px solid ${color}`;
  el.style.boxShadow = `0 2px 8px ${color}44`;

  // SVG goutte d'eau
  el.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z"
        fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M8 14a4 4 0 0 0 4 4" stroke="${color}" stroke-width="1.5"
        stroke-linecap="round" fill="none" opacity="0.6"/>
    </svg>
  `;

  // Animation si en alerte
  if (status === 'warning') {
    el.classList.add('aqua-marker-warning');
  } else if (status === 'critical') {
    el.classList.add('aqua-marker-critical');
  }

  return el;
}

/* ---------- Props ---------- */

interface AquaGuardLayerProps {
  /** Instance de la carte MapLibre */
  map: maplibregl.Map | null;
  /** Lectures des capteurs */
  sensors: SensorReading[];
  /** Couche visible ou non */
  visible?: boolean;
}

/* ---------- Composant ---------- */

export default function AquaGuardLayer({ map, sensors, visible = true }: AquaGuardLayerProps) {
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!map) return;
    injectAquaStyles();

    // Nettoyage des marqueurs precedents
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!visible) return;

    sensors.forEach((sensor) => {
      const status = deriveStatus(sensor);
      const color = STATUS_COLOR[status];
      const label = STATUS_LABEL[status];
      const battery = estimateBattery(sensor);
      const el = createDropletMarker(status);

      // Couleur de la batterie
      let batteryColor = '#fbbf24';
      if (battery < 30) batteryColor = '#ef4444';
      else if (battery < 60) batteryColor = '#f59e0b';

      // Formatage du timestamp
      const timestamp = sensor.timestamp
        ? new Date(sensor.timestamp).toLocaleString('fr-FR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'N/A';

      // Construction du HTML de la popup
      const popupHTML = `
        <div class="aqua-popup">
          <div class="popup-header">
            <div class="popup-icon" style="background:${color}22;border:1px solid ${color}44;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69z"
                  fill="${color}" fill-opacity="0.4" stroke="${color}" stroke-width="2"/>
              </svg>
            </div>
            <div>
              <div class="popup-title">${sensor.station_name}</div>
              <div class="popup-id">${sensor.station_id}</div>
            </div>
            <span style="margin-left:auto;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;background:${color}22;color:${color};border:1px solid ${color}44;">
              ${label}
            </span>
          </div>
          <div class="readings-grid">
            <div class="reading-cell">
              <div class="reading-label">Mercure</div>
              <div class="reading-value">
                ${sensor.mercury_level != null ? (sensor.mercury_level * 1000).toFixed(1) : 'N/A'}
                <span class="reading-unit">ug/L</span>
              </div>
            </div>
            <div class="reading-cell">
              <div class="reading-label">Turbidite</div>
              <div class="reading-value">
                ${sensor.turbidity.toFixed(1)}
                <span class="reading-unit">NTU</span>
              </div>
            </div>
            <div class="reading-cell">
              <div class="reading-label">pH</div>
              <div class="reading-value" style="color:${sensor.ph < 6.5 || sensor.ph > 8.5 ? '#ef4444' : '#e2e8f0'}">
                ${sensor.ph.toFixed(2)}
              </div>
            </div>
            <div class="reading-cell">
              <div class="reading-label">O2 dissous</div>
              <div class="reading-value">
                ${sensor.dissolved_oxygen.toFixed(1)}
                <span class="reading-unit">mg/L</span>
              </div>
            </div>
            <div class="reading-cell">
              <div class="reading-label">Temperature</div>
              <div class="reading-value">
                ${sensor.temperature.toFixed(1)}
                <span class="reading-unit">°C</span>
              </div>
            </div>
            <div class="reading-cell">
              <div class="reading-label">Conductivite</div>
              <div class="reading-value">
                ${sensor.conductivity.toFixed(0)}
                <span class="reading-unit">uS/cm</span>
              </div>
            </div>
          </div>
          <div class="popup-footer">
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${batteryColor}" stroke-width="2">
                  <rect x="1" y="6" width="18" height="12" rx="2"/>
                  <line x1="23" y1="10" x2="23" y2="14"/>
                </svg>
                <span style="font-size:11px;font-weight:600;color:${batteryColor}">${battery}%</span>
              </div>
              <div class="battery-bar" style="margin-top:3px;">
                <div class="battery-fill" style="width:${battery}%;background:${batteryColor};box-shadow:0 0 6px ${batteryColor}44;"></div>
              </div>
            </div>
            <div class="popup-timestamp">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" style="display:inline;vertical-align:middle;margin-right:3px;">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              ${timestamp}
            </div>
          </div>
        </div>
      `;

      const popup = new maplibregl.Popup({
        offset: 16,
        maxWidth: '290px',
        closeButton: true,
      }).setHTML(popupHTML);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([sensor.longitude, sensor.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [map, sensors, visible]);

  // Composant purement imperatif
  return null;
}
