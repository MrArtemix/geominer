'use client';

/* ============================================
   useWebSocket - Socket.io avec toast sonner
   ============================================ */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAlertStore } from '@/stores/alertStore';
import type { Alert } from '@/types';

/* ---------- types ---------- */

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketReturn {
  status: ConnectionStatus;
  disconnect: () => void;
  reconnect: () => void;
}

/* ---------- config ---------- */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;

/* ---------- sévérité → durée toast ---------- */

const SEVERITY_DURATION: Record<string, number> = {
  CRITICAL: 8000,
  HIGH: 6000,
  MEDIUM: 4000,
  LOW: 3000,
};

const SEVERITY_LABEL_FR: Record<string, string> = {
  CRITICAL: 'Critique',
  HIGH: 'Élevé',
  MEDIUM: 'Modéré',
  LOW: 'Faible',
};

/* ---------- hook ---------- */

export function useWebSocket(): UseWebSocketReturn {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const addAlert = useAlertStore((s) => s.addAlert);

  const socketRef = useRef<Socket | null>(null);
  const retryCount = useRef(0);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  const connect = useCallback(() => {
    const token = (session as { accessToken?: string } | null)?.accessToken;
    if (!token) return;

    setStatus('connecting');

    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });

    socket.on('connect', () => {
      retryCount.current = 0;
      setStatus('connected');
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
      scheduleReconnect();
    });

    socket.on('connect_error', () => {
      setStatus('error');
      scheduleReconnect();
    });

    /* --- événements domaine --- */

    socket.on('alert:new', (alert: Alert) => {
      addAlert(alert);

      /* Rafraichir les requetes liees aux alertes et dashboard */
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['recent-alerts-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });

      /* Toast sonner colore par severite (bas-droite) */
      const severity = alert.severity || 'MEDIUM';
      const label = SEVERITY_LABEL_FR[severity] || severity;
      const duration = SEVERITY_DURATION[severity] || 4000;

      if (severity === 'CRITICAL') {
        toast.error(alert.title, {
          description: `Severite : ${label}`,
          duration,
          action: alert.site_name
            ? { label: 'Voir le site', onClick: () => window.location.assign('/alerts') }
            : undefined,
        });
      } else if (severity === 'HIGH') {
        toast.warning(alert.title, {
          description: `Severite : ${label}`,
          duration,
          action: alert.site_name
            ? { label: 'Voir le site', onClick: () => window.location.assign('/alerts') }
            : undefined,
        });
      } else {
        toast.info(alert.title, {
          description: `Severite : ${label}`,
          duration,
        });
      }
    });

    socket.on('site:updated', (payload: { site_id: string }) => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      queryClient.invalidateQueries({ queryKey: ['site', payload.site_id] });
    });

    socketRef.current = socket;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, addAlert, queryClient]);

  const scheduleReconnect = useCallback(() => {
    if (retryCount.current >= MAX_RETRIES) return;
    const delay = BASE_DELAY_MS * Math.pow(2, retryCount.current);
    retryCount.current += 1;
    setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setStatus('disconnected');
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    retryCount.current = 0;
    connect();
  }, [disconnect, connect]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connect]);

  return { status, disconnect, reconnect };
}
