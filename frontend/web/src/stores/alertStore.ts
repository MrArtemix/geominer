import { create } from 'zustand';
import type { Alert } from '@/types';

/* -------------------------------------------------------------------------- */
/*  Alert Store                                                                */
/* -------------------------------------------------------------------------- */

interface AlertStore {
  // State
  alerts: Alert[];
  unreadCount: number;

  // Actions
  setAlerts: (alerts: Alert[]) => void;
  addAlert: (alert: Alert) => void;
  markRead: (alertId: string) => void;
  markAllRead: () => void;
  removeAlert: (alertId: string) => void;
  clearAlerts: () => void;
}

export const useAlertStore = create<AlertStore>((set) => ({
  // Initial state
  alerts: [],
  unreadCount: 0,

  // Actions
  setAlerts: (alerts) =>
    set({
      alerts,
      unreadCount: alerts.filter((a) => !a.is_read).length,
    }),

  addAlert: (alert) =>
    set((state) => {
      // Avoid duplicates
      const exists = state.alerts.some((a) => a.id === alert.id);
      if (exists) return state;

      const newAlerts = [alert, ...state.alerts];
      return {
        alerts: newAlerts,
        unreadCount: newAlerts.filter((a) => !a.is_read).length,
      };
    }),

  markRead: (alertId) =>
    set((state) => {
      const newAlerts = state.alerts.map((a) =>
        a.id === alertId ? { ...a, is_read: true } : a
      );
      return {
        alerts: newAlerts,
        unreadCount: newAlerts.filter((a) => !a.is_read).length,
      };
    }),

  markAllRead: () =>
    set((state) => ({
      alerts: state.alerts.map((a) => ({ ...a, is_read: true })),
      unreadCount: 0,
    })),

  removeAlert: (alertId) =>
    set((state) => {
      const newAlerts = state.alerts.filter((a) => a.id !== alertId);
      return {
        alerts: newAlerts,
        unreadCount: newAlerts.filter((a) => !a.is_read).length,
      };
    }),

  clearAlerts: () =>
    set({ alerts: [], unreadCount: 0 }),
}));
