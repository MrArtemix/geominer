'use client';

/* ============================================
   useWebSocket - Socket.io connection hook
   ============================================ */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { useAlertStore } from '@/stores/alertStore';
import type { Alert } from '@/types';

/* ---------- types ---------- */

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketReturn {
  status: ConnectionStatus;
  /** Manually disconnect / reconnect */
  disconnect: () => void;
  reconnect: () => void;
}

/* ---------- config ---------- */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;

/* ---------- hook ---------- */

export function useWebSocket(): UseWebSocketReturn {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const addAlert = useAlertStore((s) => s.addAlert);

  const socketRef = useRef<Socket | null>(null);
  const retryCount = useRef(0);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  const connect = useCallback(() => {
    // Do not connect without a valid token
    const token = (session as { accessToken?: string } | null)?.accessToken;
    if (!token) return;

    setStatus('connecting');

    const socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false, // We handle reconnection ourselves
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

    /* --- domain events --- */

    socket.on('alert:new', (alert: Alert) => {
      addAlert(alert);
    });

    socket.on('site:updated', (payload: { site_id: string }) => {
      // Invalidate React Query cache so lists / detail refetch
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

  /* --- lifecycle --- */
  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connect]);

  return { status, disconnect, reconnect };
}
