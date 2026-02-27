import { create } from 'zustand';
import type { Alert, AlertSeverity } from '@/types';

/* ============================================================================
   Ge O'Miner - Store Zustand pour les alertes
   Gestion centralisee des alertes avec filtres, compteur non-lus,
   acquittement et chargement depuis l'API
   ============================================================================ */

/* ---------- Types de filtres ---------- */

interface AlertFilters {
  /** Filtrer par severite */
  severity: AlertSeverity | null;
  /** Filtrer par type d'alerte */
  type: string | null;
  /** Filtrer par site */
  siteId: string | null;
  /** Afficher uniquement les non-lues */
  unreadOnly: boolean;
  /** Afficher uniquement les non-resolues */
  unresolvedOnly: boolean;
  /** Recherche textuelle */
  search: string;
  /** Plage de dates [debut, fin] */
  dateRange: [string | null, string | null];
}

/* ---------- Interface du store ---------- */

interface AlertStore {
  /* --- Etat --- */
  alerts: Alert[];
  unreadCount: number;
  filters: AlertFilters;
  isLoading: boolean;
  error: string | null;

  /* --- Actions de base --- */
  setAlerts: (alerts: Alert[]) => void;
  addAlert: (alert: Alert) => void;
  removeAlert: (alertId: string) => void;
  clearAlerts: () => void;

  /* --- Lecture / Acquittement --- */
  markRead: (alertId: string) => void;
  markAllRead: () => void;
  acknowledgeAlert: (alertId: string, resolvedBy?: string) => void;

  /* --- Filtrage --- */
  setFilters: (filters: Partial<AlertFilters>) => void;
  resetFilters: () => void;

  /* --- Chargement --- */
  loadAlerts: (alerts: Alert[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  /* --- Selecteurs derives --- */
  getFilteredAlerts: () => Alert[];
  getAlertsBysite: (siteId: string) => Alert[];
  getCriticalCount: () => number;
}

/* ---------- Filtres par defaut ---------- */

const DEFAULT_FILTERS: AlertFilters = {
  severity: null,
  type: null,
  siteId: null,
  unreadOnly: false,
  unresolvedOnly: false,
  search: '',
  dateRange: [null, null],
};

/* ---------- Utilitaire : calculer le nombre de non-lues ---------- */

function countUnread(alerts: Alert[]): number {
  return alerts.filter((a) => !a.is_read).length;
}

/* ---------- Creation du store ---------- */

export const useAlertStore = create<AlertStore>((set, get) => ({
  /* --- Etat initial --- */
  alerts: [],
  unreadCount: 0,
  filters: { ...DEFAULT_FILTERS },
  isLoading: false,
  error: null,

  /* --- Actions de base --- */

  setAlerts: (alerts) =>
    set({
      alerts,
      unreadCount: countUnread(alerts),
    }),

  addAlert: (alert) =>
    set((state) => {
      /* Eviter les doublons */
      const exists = state.alerts.some((a) => a.id === alert.id);
      if (exists) return state;

      const newAlerts = [alert, ...state.alerts];
      return {
        alerts: newAlerts,
        unreadCount: countUnread(newAlerts),
      };
    }),

  removeAlert: (alertId) =>
    set((state) => {
      const newAlerts = state.alerts.filter((a) => a.id !== alertId);
      return {
        alerts: newAlerts,
        unreadCount: countUnread(newAlerts),
      };
    }),

  clearAlerts: () =>
    set({ alerts: [], unreadCount: 0 }),

  /* --- Lecture / Acquittement --- */

  markRead: (alertId) =>
    set((state) => {
      const newAlerts = state.alerts.map((a) =>
        a.id === alertId ? { ...a, is_read: true } : a
      );
      return {
        alerts: newAlerts,
        unreadCount: countUnread(newAlerts),
      };
    }),

  markAllRead: () =>
    set((state) => ({
      alerts: state.alerts.map((a) => ({ ...a, is_read: true })),
      unreadCount: 0,
    })),

  acknowledgeAlert: (alertId, resolvedBy) =>
    set((state) => {
      const now = new Date().toISOString();
      const newAlerts = state.alerts.map((a) =>
        a.id === alertId
          ? {
              ...a,
              is_read: true,
              is_resolved: true,
              resolved_at: now,
              resolved_by: resolvedBy,
            }
          : a
      );
      return {
        alerts: newAlerts,
        unreadCount: countUnread(newAlerts),
      };
    }),

  /* --- Filtrage --- */

  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
    })),

  resetFilters: () =>
    set({ filters: { ...DEFAULT_FILTERS } }),

  /* --- Chargement --- */

  loadAlerts: (alerts) =>
    set({
      alerts,
      unreadCount: countUnread(alerts),
      isLoading: false,
      error: null,
    }),

  setLoading: (loading) =>
    set({ isLoading: loading }),

  setError: (error) =>
    set({ error, isLoading: false }),

  /* --- Selecteurs derives --- */

  getFilteredAlerts: () => {
    const { alerts, filters } = get();
    let result = [...alerts];

    /* Filtre par severite */
    if (filters.severity) {
      result = result.filter((a) => a.severity === filters.severity);
    }

    /* Filtre par type */
    if (filters.type) {
      result = result.filter((a) => a.type === filters.type);
    }

    /* Filtre par site */
    if (filters.siteId) {
      result = result.filter((a) => a.site_id === filters.siteId);
    }

    /* Non-lues uniquement */
    if (filters.unreadOnly) {
      result = result.filter((a) => !a.is_read);
    }

    /* Non-resolues uniquement */
    if (filters.unresolvedOnly) {
      result = result.filter((a) => !a.is_resolved);
    }

    /* Recherche textuelle */
    if (filters.search.trim()) {
      const query = filters.search.toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.description.toLowerCase().includes(query) ||
          (a.site_name && a.site_name.toLowerCase().includes(query))
      );
    }

    /* Plage de dates */
    const [start, end] = filters.dateRange;
    if (start) {
      result = result.filter((a) => a.created_at >= start);
    }
    if (end) {
      result = result.filter((a) => a.created_at <= end);
    }

    return result;
  },

  getAlertsBysite: (siteId) => {
    return get().alerts.filter((a) => a.site_id === siteId);
  },

  getCriticalCount: () => {
    return get().alerts.filter(
      (a) => a.severity === 'CRITICAL' && !a.is_resolved
    ).length;
  },
}));
