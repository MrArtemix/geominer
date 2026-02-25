'use client';

/* ============================================
   AquaGuardLayer - IoT sensor markers
   ============================================ */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { SensorReading } from '@/types';

/* ---------- status helpers ---------- */

type WaterQualityStatus = 'normal' | 'warning' | 'critical';

const STATUS_COLOR: Record<WaterQualityStatus, string> = {
  normal: '#22C55E',
  warning: '#F59E0B',
  critical: '#EF4444',
};

const STATUS_BORDER: Record<WaterQualityStatus, string> = {
  normal: '#15803D',
  warning: '#B45309',
  critical: '#B91C1C',
};

/** Derive a water quality status from a sensor reading. */
function deriveStatus(reading: SensorReading): WaterQualityStatus {
  if (reading.is_anomaly) return 'critical';
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

/* ---------- helpers ---------- */

function createSensorDot(status: WaterQualityStatus): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '14px';
  el.style.height = '14px';
  el.style.borderRadius = '50%';
  el.style.backgroundColor = STATUS_COLOR[status];
  el.style.border = `2.5px solid ${STATUS_BORDER[status]}`;
  el.style.cursor = 'pointer';
  el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.25)';
  return el;
}

/* ---------- props ---------- */

interface AquaGuardLayerProps {
  map: maplibregl.Map | null;
  sensors: SensorReading[];
  visible?: boolean;
}

/* ---------- component ---------- */

export default function AquaGuardLayer({ map, sensors, visible = true }: AquaGuardLayerProps) {
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!map) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!visible) return;

    sensors.forEach((sensor) => {
      const status = deriveStatus(sensor);
      const el = createSensorDot(status);

      const popup = new maplibregl.Popup({ offset: 10, maxWidth: '260px' }).setHTML(
        `<div class="space-y-1">
          <p class="font-semibold text-gray-900">${sensor.station_name}</p>
          <p class="text-xs text-gray-400">${sensor.station_id}</p>
          <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs mt-1">
            <span class="text-gray-500">pH</span>
            <span class="font-medium">${sensor.ph.toFixed(1)}</span>
            <span class="text-gray-500">Turbidite</span>
            <span class="font-medium">${sensor.turbidity.toFixed(1)} NTU</span>
            ${sensor.mercury_level != null ? `<span class="text-gray-500">Mercure</span><span class="font-medium">${sensor.mercury_level.toFixed(3)} mg/L</span>` : ''}
            <span class="text-gray-500">O2 dissous</span>
            <span class="font-medium">${sensor.dissolved_oxygen.toFixed(1)} mg/L</span>
            <span class="text-gray-500">Temp.</span>
            <span class="font-medium">${sensor.temperature.toFixed(1)} C</span>
          </div>
          <span
            class="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize"
            style="background:${STATUS_COLOR[status]}22;color:${STATUS_COLOR[status]}"
          >
            ${status}
          </span>
        </div>`,
      );

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

  return null;
}
