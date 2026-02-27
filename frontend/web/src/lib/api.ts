import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { getSession } from 'next-auth/react';
import type {
  MiningSite,
  Alert,
  SensorReading,
  GoldTransaction,
  Operation,
  PaginatedResponse,
  DashboardStats,
} from '@/types';

/* ============================================================================
   Ge O'Miner - Client API centralise
   Instance Axios avec intercepteur JWT NextAuth, gestion automatique
   du token Keycloak et redirection sur 401
   ============================================================================ */

/* ---------- Instance Axios principale ---------- */

const api: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

/* ---------- Intercepteur de requete : injection JWT ---------- */

api.interceptors.request.use(
  async (config) => {
    /* Attacher le token uniquement cote client */
    if (typeof window !== 'undefined') {
      const session = await getSession();
      if (session?.accessToken) {
        config.headers.Authorization = `Bearer ${session.accessToken}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/* ---------- Intercepteur de reponse : gestion 401 ---------- */

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      /* Redirection vers login avec callback pour revenir a la page courante */
      const currentPath = window.location.pathname;
      window.location.href = `/login?callbackUrl=${encodeURIComponent(currentPath)}&error=SessionExpired`;
    }
    return Promise.reject(error);
  }
);

/* ---------- Types parametres communs ---------- */

interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

interface SiteQueryParams extends PaginationParams {
  status?: string;
  region?: string;
  department?: string;
  search?: string;
  min_confidence?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

interface AlertQueryParams extends PaginationParams {
  severity?: string;
  type?: string;
  site_id?: string;
  is_resolved?: boolean;
  is_read?: boolean;
  search?: string;
}

interface SensorQueryParams extends PaginationParams {
  station_id?: string;
  is_anomaly?: boolean;
  start_date?: string;
  end_date?: string;
}

interface ReportParams {
  start_date?: string;
  end_date?: string;
  region?: string;
  format?: 'json' | 'pdf';
}

/* ============================================================================
   Client API structure par domaine
   ============================================================================ */

export const apiClient = {

  /* ========================================================================
     SITES MINIERS
     ======================================================================== */
  sites: {
    /** Recuperer tous les sites avec filtres et pagination */
    getAll: (params?: SiteQueryParams) =>
      api.get<PaginatedResponse<MiningSite>>('/api/v1/sites', { params }).then((r) => r.data),

    /** Recuperer un site par son identifiant */
    getSingle: (id: string) =>
      api.get<MiningSite>(`/api/v1/sites/${id}`).then((r) => r.data),

    /** Creer un nouveau site minier */
    create: (data: Partial<MiningSite>) =>
      api.post<MiningSite>('/api/v1/sites', data).then((r) => r.data),

    /** Mettre a jour le statut d'un site */
    updateStatus: (id: string, status: string, reason?: string) =>
      api.patch<MiningSite>(`/api/v1/sites/${id}/status`, { status, reason }).then((r) => r.data),

    /** Mettre a jour les informations d'un site */
    update: (id: string, data: Partial<MiningSite>) =>
      api.put<MiningSite>(`/api/v1/sites/${id}`, data).then((r) => r.data),

    /** Supprimer un site */
    delete: (id: string) =>
      api.delete(`/api/v1/sites/${id}`).then((r) => r.data),

    /** Recuperer les sites au format GeoJSON */
    getGeoJSON: (params?: SiteQueryParams) =>
      api.get('/api/v1/sites/geojson', { params }).then((r) => r.data),

    /** Recuperer les statistiques des sites */
    getStats: () =>
      api.get<DashboardStats>('/api/v1/sites/stats').then((r) => r.data),
  },

  /* ========================================================================
     ALERTES
     ======================================================================== */
  alerts: {
    /** Recuperer toutes les alertes avec filtres */
    getAll: (params?: AlertQueryParams) =>
      api.get<PaginatedResponse<Alert>>('/api/v1/alerts', { params }).then((r) => r.data),

    /** Recuperer une alerte par son identifiant */
    getSingle: (id: string) =>
      api.get<Alert>(`/api/v1/alerts/${id}`).then((r) => r.data),

    /** Acquitter une alerte (marquer comme resolue) */
    acknowledge: (id: string, resolvedBy?: string) =>
      api.patch<Alert>(`/api/v1/alerts/${id}/acknowledge`, { resolved_by: resolvedBy }).then((r) => r.data),

    /** Marquer une alerte comme lue */
    markRead: (id: string) =>
      api.patch<Alert>(`/api/v1/alerts/${id}/read`).then((r) => r.data),

    /** Marquer toutes les alertes comme lues */
    markAllRead: () =>
      api.post('/api/v1/alerts/read-all').then((r) => r.data),

    /** Declencher une alerte de test (dev/staging uniquement) */
    testFire: (data: { severity: string; type: string; site_id?: string; title: string; description: string }) =>
      api.post<Alert>('/api/v1/alerts/test', data).then((r) => r.data),

    /** Recuperer les statistiques des alertes */
    getStats: () =>
      api.get('/api/v1/alerts/stats').then((r) => r.data),
  },

  /* ========================================================================
     CAPTEURS / AQUAGUARD
     ======================================================================== */
  sensors: {
    /** Recuperer toutes les stations de capteurs */
    getAll: (params?: PaginationParams) =>
      api.get('/api/v1/sensors/stations', { params }).then((r) => r.data),

    /** Recuperer une station specifique */
    getSingle: (stationId: string) =>
      api.get(`/api/v1/sensors/stations/${stationId}`).then((r) => r.data),

    /** Recuperer les lectures d'un capteur avec filtres temporels */
    getReadings: (params?: SensorQueryParams) =>
      api.get<PaginatedResponse<SensorReading>>('/api/v1/sensors/readings', { params }).then((r) => r.data),

    /** Recuperer les dernieres lectures de toutes les stations */
    getLatestReadings: () =>
      api.get<SensorReading[]>('/api/v1/sensors/readings/latest').then((r) => r.data),

    /** Recuperer les anomalies detectees */
    getAnomalies: (params?: SensorQueryParams) =>
      api.get<PaginatedResponse<SensorReading>>('/api/v1/sensors/anomalies', { params }).then((r) => r.data),

    /** Recuperer les statistiques AquaGuard */
    getStats: () =>
      api.get('/api/v1/sensors/stats').then((r) => r.data),
  },

  /* ========================================================================
     BLOCKCHAIN / GOLDTRACK
     ======================================================================== */
  blockchain: {
    /** Recuperer l'enregistrement blockchain d'un site */
    getSite: (siteId: string) =>
      api.get(`/api/v1/blockchain/sites/${siteId}`).then((r) => r.data),

    /** Recuperer l'historique blockchain d'un site */
    getHistory: (siteId: string) =>
      api.get(`/api/v1/blockchain/sites/${siteId}/history`).then((r) => r.data),

    /** Recuperer toutes les transactions or */
    getTransactions: (params?: PaginationParams) =>
      api.get<PaginatedResponse<GoldTransaction>>('/api/v1/blockchain/transactions', { params }).then((r) => r.data),

    /** Verifier l'authenticite d'un hash blockchain */
    verifyHash: (hash: string) =>
      api.get(`/api/v1/blockchain/verify/${hash}`).then((r) => r.data),

    /** Recuperer les statistiques blockchain */
    getStats: () =>
      api.get('/api/v1/blockchain/stats').then((r) => r.data),
  },

  /* ========================================================================
     GOLDPATH - Formalisation des orpailleurs
     ======================================================================== */
  goldpath: {
    /** Enregistrer un nouveau mineur artisanal */
    registerMiner: (data: {
      first_name: string;
      last_name: string;
      phone: string;
      region: string;
      commune: string;
      id_number?: string;
      photo_url?: string;
    }) =>
      api.post('/api/v1/goldpath/miners', data).then((r) => r.data),

    /** Recuperer la liste des mineurs enregistres */
    getMiners: (params?: PaginationParams & { search?: string; region?: string }) =>
      api.get('/api/v1/goldpath/miners', { params }).then((r) => r.data),

    /** Recuperer un mineur par identifiant */
    getMiner: (id: string) =>
      api.get(`/api/v1/goldpath/miners/${id}`).then((r) => r.data),

    /** Emettre un permis d'exploitation artisanale */
    issuePermit: (data: {
      miner_id: string;
      zone_id: string;
      start_date: string;
      end_date: string;
      max_area_hectares: number;
    }) =>
      api.post('/api/v1/goldpath/permits', data).then((r) => r.data),

    /** Recuperer les permis */
    getPermits: (params?: PaginationParams & { miner_id?: string; status?: string }) =>
      api.get('/api/v1/goldpath/permits', { params }).then((r) => r.data),

    /** Verifier la validite d'un permis via QR code */
    verifyPermit: (permitId: string) =>
      api.get(`/api/v1/goldpath/permits/${permitId}/verify`).then((r) => r.data),

    /** Recuperer les statistiques GoldPath */
    getStats: () =>
      api.get('/api/v1/goldpath/stats').then((r) => r.data),
  },

  /* ========================================================================
     OPERATIONS
     ======================================================================== */
  operations: {
    /** Recuperer toutes les operations */
    getAll: (params?: PaginationParams & { status?: string; type?: string }) =>
      api.get<PaginatedResponse<Operation>>('/api/v1/operations', { params }).then((r) => r.data),

    /** Recuperer une operation par identifiant */
    getSingle: (id: string) =>
      api.get<Operation>(`/api/v1/operations/${id}`).then((r) => r.data),

    /** Creer une nouvelle operation */
    create: (data: Partial<Operation>) =>
      api.post<Operation>('/api/v1/operations', data).then((r) => r.data),

    /** Mettre a jour une operation */
    update: (id: string, data: Partial<Operation>) =>
      api.put<Operation>(`/api/v1/operations/${id}`, data).then((r) => r.data),

    /** Mettre a jour le statut d'une operation */
    updateStatus: (id: string, status: string) =>
      api.patch(`/api/v1/operations/${id}/status`, { status }).then((r) => r.data),
  },

  /* ========================================================================
     RAPPORTS
     ======================================================================== */
  reports: {
    /** Recuperer le resume du tableau de bord */
    getSummary: (params?: ReportParams) =>
      api.get<DashboardStats>('/api/v1/reports/summary', { params }).then((r) => r.data),

    /** Generer un rapport PDF */
    generatePDF: (params: ReportParams & { type: string }) =>
      api.post('/api/v1/reports/generate', params, {
        responseType: 'blob',
      }).then((r) => {
        /* Creer un lien de telechargement pour le blob PDF */
        const blob = new Blob([r.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `rapport-geominer-${new Date().toISOString().split('T')[0]}.pdf`;
        link.click();
        window.URL.revokeObjectURL(url);
        return { success: true };
      }),

    /** Recuperer les rapports generes precedemment */
    getHistory: (params?: PaginationParams) =>
      api.get('/api/v1/reports/history', { params }).then((r) => r.data),

    /** Recuperer les donnees analytiques */
    getAnalytics: (params?: { period?: string; metrics?: string[] }) =>
      api.get('/api/v1/reports/analytics', { params }).then((r) => r.data),
  },

  /* ========================================================================
     UTILISATEURS / ADMINISTRATION
     ======================================================================== */
  admin: {
    /** Recuperer tous les utilisateurs */
    getUsers: (params?: PaginationParams & { role?: string; search?: string }) =>
      api.get('/api/v1/admin/users', { params }).then((r) => r.data),

    /** Recuperer les logs d'audit */
    getAuditLogs: (params?: PaginationParams & { action?: string; user_id?: string }) =>
      api.get('/api/v1/admin/audit-logs', { params }).then((r) => r.data),

    /** Recuperer les metriques systeme */
    getSystemMetrics: () =>
      api.get('/api/v1/admin/metrics').then((r) => r.data),
  },
};

/* ---------- Export par defaut de l'instance Axios brute ---------- */

export default api;
