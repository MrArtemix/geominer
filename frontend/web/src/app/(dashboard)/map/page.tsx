'use client';

/* ==========================================================================
   /map - OpsCenter Carte Operationnelle
   Ge O'Miner - Carte plein ecran avec overlay de controles

   Fonctionnalites :
   - OpsMap plein ecran avec MapLibre GL JS
   - MapControls en overlay (haut-droite)
   - Panel lateral retractable (slide depuis droite) : details du site
   - Barre inferieure : stats live (nb sites actifs, alertes 24h, capteurs OK)
   - Chargement anime avec spinner glassmorphism
   - Sources React Query (refetch 60s)
   ========================================================================== */

import { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import maplibregl from 'maplibre-gl';
import {
  Crosshair,
  X,
  MapPin,
  AlertTriangle,
  Droplets,
  Shield,
  ExternalLink,
  Calendar,
  Cpu,
  Activity,
  TrendingUp,
} from 'lucide-react';
import api from '@/lib/api';
import { useMapStore } from '@/stores/mapStore';
import { useAlertStore } from '@/stores/alertStore';
import { SITE_STATUS_COLORS, SITE_STATUS_LABELS, formatConfidence } from '@/lib/maplibre';
import OpsMap, { type OpsMapHandle, type Basemap } from '@/components/map/OpsMap';
import SiteLayer from '@/components/map/SiteLayer';
import AlertLayer from '@/components/map/AlertLayer';
import HeatmapLayer, { type H3Cell } from '@/components/map/HeatmapLayer';
import AquaGuardLayer from '@/components/map/AquaGuardLayer';
import MapControls from '@/components/map/MapControls';
import type { SiteFeatureCollection, Alert, SensorReading, MiningSite } from '@/types';

/* ---------- Intervalle de refetch des donnees ---------- */
const REFETCH_INTERVAL = 60_000; // 60 secondes

/* ---------- Page principale ---------- */

export default function MapPage() {
  const mapHandleRef = useRef<OpsMapHandle>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [basemap, setBasemap] = useState<Basemap>('osm');
  const [mapReady, setMapReady] = useState(false);

  /* --- Etat du store --- */
  const activeLayers = useMapStore((s) => s.activeLayers);
  const terrain3DEnabled = useMapStore((s) => s.terrain3DEnabled);
  const toggleTerrain3D = useMapStore((s) => s.toggleTerrain3D);
  const sidePanelOpen = useMapStore((s) => s.sidePanelOpen);
  const setSidePanelOpen = useMapStore((s) => s.setSidePanelOpen);
  const selectedSiteId = useMapStore((s) => s.selectedSiteId);
  const selectedSiteData = useMapStore((s) => s.selectedSiteData);
  const selectSite = useMapStore((s) => s.selectSite);
  const statusFilters = useMapStore((s) => s.statusFilters);
  const setSearchResults = useMapStore((s) => s.setSearchResults);
  const storeAlerts = useAlertStore((s) => s.alerts);

  /* --- Callback carte prete --- */
  const onMapReady = useCallback((map: maplibregl.Map) => {
    setMapInstance(map);
    setMapReady(true);
  }, []);

  /* --- Recentrer sur la Cote d'Ivoire --- */
  const handleResetView = useCallback(() => {
    mapHandleRef.current?.resetView();
  }, []);

  /* ====================================================================
     Sources de donnees React Query (refetch 60s)
     ==================================================================== */

  /* --- Sites (GeoJSON FeatureCollection) --- */
  const {
    data: sitesGeoJSON,
    isLoading: sitesLoading,
    isError: sitesError,
  } = useQuery<SiteFeatureCollection>({
    queryKey: ['sites', 'geojson'],
    queryFn: () => api.get('/api/sites?format=geojson').then((r) => r.data),
    refetchInterval: REFETCH_INTERVAL,
  });

  /* --- Alertes georeferencees --- */
  const {
    data: alertsData,
    isLoading: alertsLoading,
  } = useQuery<Alert[]>({
    queryKey: ['alerts-geo'],
    queryFn: () => api.get('/api/alerts?active=true').then((r) => r.data),
    refetchInterval: REFETCH_INTERVAL,
  });

  /* --- Heatmap H3 risque (hexagones) --- */
  const { data: heatmapData } = useQuery<H3Cell[]>({
    queryKey: ['h3-risk'],
    queryFn: () => api.get('/api/analytics/h3-risk').then((r) => r.data),
    enabled: activeLayers.has('heatmap'),
    refetchInterval: REFETCH_INTERVAL,
  });

  /* --- Capteurs AquaGuard --- */
  const { data: sensorsData } = useQuery<SensorReading[]>({
    queryKey: ['aquaguard-geo'],
    queryFn: () => api.get('/api/aquaguard/sensors').then((r) => r.data),
    enabled: activeLayers.has('aquaguard'),
    refetchInterval: REFETCH_INTERVAL,
  });

  /* --- Liste complete des sites (pour la recherche) --- */
  const { data: allSites } = useQuery<MiningSite[]>({
    queryKey: ['sites', 'list'],
    queryFn: () => api.get('/api/sites').then((r) => r.data?.results ?? r.data),
    refetchInterval: REFETCH_INTERVAL * 2,
  });

  /* --- Fusion des alertes (API + store WebSocket) --- */
  const mergedAlerts = useMemo(() => {
    const alertMap = new Map<string, Alert>();
    (alertsData ?? []).forEach((a) => alertMap.set(a.id, a));
    storeAlerts.forEach((a) => alertMap.set(a.id, a));
    return Array.from(alertMap.values());
  }, [alertsData, storeAlerts]);

  /* ====================================================================
     Stats live pour la barre inferieure
     ==================================================================== */

  const liveStats = useMemo(() => {
    const features = sitesGeoJSON?.features ?? [];
    const activeSites = features.filter(
      (f) => f.properties.status === 'ACTIVE' || f.properties.status === 'CONFIRMED'
    ).length;

    const now = Date.now();
    const h24 = 24 * 60 * 60 * 1000;
    const alertes24h = mergedAlerts.filter(
      (a) => new Date(a.created_at).getTime() > now - h24
    ).length;

    const capteurs = sensorsData?.length ?? 0;
    const capteursOk = sensorsData?.filter(
      (s) => !s.is_anomaly && s.ph >= 6.5 && s.ph <= 8.5
    ).length ?? 0;

    return { activeSites, alertes24h, capteurs, capteursOk, totalSites: features.length };
  }, [sitesGeoJSON, mergedAlerts, sensorsData]);

  /* ====================================================================
     Recherche de site
     ==================================================================== */

  const handleSearchSite = useCallback(
    (query: string) => {
      if (!allSites || !query.trim()) {
        setSearchResults([]);
        return;
      }
      const q = query.toLowerCase();
      const results = allSites.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.region?.toLowerCase().includes(q) ||
          s.department?.toLowerCase().includes(q)
      );
      setSearchResults(results);
    },
    [allSites, setSearchResults]
  );

  const handleSelectSearchResult = useCallback(
    (site: MiningSite) => {
      selectSite(site.id, site);
      mapHandleRef.current?.flyTo([site.longitude, site.latitude], 13);
    },
    [selectSite]
  );

  /* ====================================================================
     Clic sur un site depuis la couche
     ==================================================================== */

  const handleSiteClick = useCallback(
    (siteId: string, coordinates: [number, number]) => {
      // Trouver les donnees completes du site
      const site = allSites?.find((s) => s.id === siteId);
      selectSite(siteId, site ?? null);
    },
    [allSites, selectSite]
  );

  /* --- Resultat de recherche dans le store --- */
  const searchResults = useMapStore((s) => s.searchResults);

  /* --- Chargement global --- */
  const isLoading = sitesLoading || alertsLoading;

  /* --- Donnees du site selectionne (depuis les features si pas dans allSites) --- */
  const selectedSiteInfo = useMemo(() => {
    if (selectedSiteData) return selectedSiteData;
    if (!selectedSiteId || !sitesGeoJSON) return null;
    const feature = sitesGeoJSON.features.find((f) => f.properties.id === selectedSiteId);
    if (!feature) return null;
    return {
      id: feature.properties.id,
      name: feature.properties.name,
      status: feature.properties.status,
      ai_confidence_score: feature.properties.ai_confidence_score,
      detection_date: feature.properties.detection_date,
      area_hectares: feature.properties.area_hectares,
      latitude: feature.geometry.coordinates[1],
      longitude: feature.geometry.coordinates[0],
    } as MiningSite;
  }, [selectedSiteId, selectedSiteData, sitesGeoJSON]);

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 64px)' }}>
      {/* ==================================================================
          Overlay de chargement anime
          ================================================================== */}
      <AnimatePresence>
        {!mapReady && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
          >
            {/* Cercles concentriques animees style radar */}
            <div className="relative w-24 h-24">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="absolute inset-0 rounded-full border border-gold-500/20"
                  animate={{
                    scale: [1, 2.5],
                    opacity: [0.6, 0],
                  }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    delay: i * 0.8,
                    ease: 'easeOut',
                  }}
                />
              ))}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <Crosshair size={36} className="text-gold-400" />
              </motion.div>
            </div>
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="mt-6 text-sm text-geo-500 mono tracking-wider"
            >
              Initialisation de la carte operationnelle...
            </motion.p>
            <div className="flex gap-1 mt-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-gold-500/60"
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================================================================
          Overlay d'erreur
          ================================================================== */}
      {sitesError && mapReady && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-4 py-2.5 rounded-lg
                     flex items-center gap-2 text-xs font-medium"
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            backdropFilter: 'blur(12px)',
            color: '#f87171',
          }}
        >
          <AlertTriangle size={14} />
          Erreur de chargement des sites. Nouvelle tentative automatique...
        </motion.div>
      )}

      {/* ==================================================================
          Indicateur de chargement des donnees (apres carte chargee)
          ================================================================== */}
      {isLoading && mapReady && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(148, 163, 184, 0.1)',
          }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          >
            <Activity size={12} className="text-gold-400" />
          </motion.div>
          <span className="text-[10px] text-geo-500 font-medium">
            Chargement des donnees...
          </span>
        </motion.div>
      )}

      {/* ==================================================================
          Carte MapLibre
          ================================================================== */}
      <OpsMap
        ref={mapHandleRef}
        basemap={basemap}
        terrain3D={terrain3DEnabled}
        className="absolute inset-0"
        onMapReady={onMapReady}
      />

      {/* ==================================================================
          Couches imperatives (rendues dans le DOM mais invisibles)
          ================================================================== */}
      <SiteLayer
        map={mapInstance}
        data={sitesGeoJSON ?? null}
        visible={activeLayers.has('mining-sites')}
        statusFilters={statusFilters}
        onSiteClick={handleSiteClick}
      />
      <AlertLayer
        map={mapInstance}
        alerts={mergedAlerts}
        visible={activeLayers.has('alerts')}
      />
      <HeatmapLayer
        map={mapInstance}
        data={heatmapData ?? []}
        visible={activeLayers.has('heatmap')}
      />
      <AquaGuardLayer
        map={mapInstance}
        sensors={sensorsData ?? []}
        visible={activeLayers.has('aquaguard')}
      />

      {/* ==================================================================
          Controles flottants (haut-droite)
          ================================================================== */}
      <MapControls
        basemap={basemap}
        onBasemapChange={setBasemap}
        terrain3D={terrain3DEnabled}
        onTerrain3DToggle={toggleTerrain3D}
        onResetView={handleResetView}
        onSearchSite={handleSearchSite}
        searchResults={searchResults}
        onSelectSearchResult={handleSelectSearchResult}
      />

      {/* ==================================================================
          Panel lateral retractable (slide depuis la droite)
          ================================================================== */}
      <AnimatePresence>
        {sidePanelOpen && selectedSiteInfo && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute top-0 right-0 bottom-12 w-80 z-20 overflow-y-auto"
            style={{
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderLeft: '1px solid rgba(148, 163, 184, 0.1)',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
            }}
          >
            {/* --- En-tete du panel --- */}
            <div className="sticky top-0 z-10 p-4 flex items-center justify-between"
              style={{
                background: 'rgba(15, 23, 42, 0.95)',
                borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
              }}
            >
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-gold-400" />
                <span className="text-sm font-bold text-geo-400">Details du site</span>
              </div>
              <button
                onClick={() => {
                  setSidePanelOpen(false);
                  selectSite(null);
                }}
                className="w-7 h-7 rounded-lg flex items-center justify-center
                           text-geo-600 hover:text-geo-400 hover:bg-white/[0.04]
                           transition-all duration-200"
              >
                <X size={16} />
              </button>
            </div>

            {/* --- Contenu du panel --- */}
            <div className="p-4 space-y-4">
              {/* Nom et statut */}
              <div>
                <h3 className="text-lg font-bold text-geo-400 mb-2">
                  {selectedSiteInfo.name}
                </h3>
                <span
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{
                    background: `${SITE_STATUS_COLORS[selectedSiteInfo.status]}22`,
                    color: SITE_STATUS_COLORS[selectedSiteInfo.status],
                    border: `1px solid ${SITE_STATUS_COLORS[selectedSiteInfo.status]}44`,
                  }}
                >
                  {SITE_STATUS_LABELS[selectedSiteInfo.status] ?? selectedSiteInfo.status}
                </span>
              </div>

              {/* Informations detaillees */}
              <div className="space-y-3">
                {/* Date de detection */}
                <div
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148,163,184,0.06)' }}
                >
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-geo-600" />
                    <span className="text-xs text-geo-600">Detection</span>
                  </div>
                  <span className="text-xs font-semibold text-geo-400 mono">
                    {selectedSiteInfo.detection_date
                      ? new Date(selectedSiteInfo.detection_date).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'N/A'}
                  </span>
                </div>

                {/* Surface */}
                <div
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148,163,184,0.06)' }}
                >
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-geo-600" />
                    <span className="text-xs text-geo-600">Surface</span>
                  </div>
                  <span className="text-xs font-semibold text-geo-400 mono">
                    {selectedSiteInfo.area_hectares?.toFixed(2) ?? 'N/A'} ha
                  </span>
                </div>

                {/* Confiance IA */}
                <div
                  className="p-3 rounded-lg"
                  style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148,163,184,0.06)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Cpu size={14} className="text-violet-400" />
                      <span className="text-xs text-geo-600">Confiance IA</span>
                    </div>
                    <span className="text-xs font-bold text-violet-400 mono">
                      {selectedSiteInfo.ai_confidence_score != null
                        ? formatConfidence(selectedSiteInfo.ai_confidence_score)
                        : 'N/A'}
                    </span>
                  </div>
                  <div
                    className="w-full h-2 rounded-full overflow-hidden"
                    style={{ background: 'rgba(15, 23, 42, 0.6)' }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.round((selectedSiteInfo.ai_confidence_score ?? 0) * 100)}%`,
                      }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{
                        background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
                        boxShadow: '0 0 10px rgba(139, 92, 246, 0.4)',
                      }}
                    />
                  </div>
                </div>

                {/* Coordonnees */}
                <div
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148,163,184,0.06)' }}
                >
                  <div className="flex items-center gap-2">
                    <Crosshair size={14} className="text-cyan-400" />
                    <span className="text-xs text-geo-600">Coordonnees</span>
                  </div>
                  <span className="text-[10px] font-medium text-cyan-400 mono">
                    {selectedSiteInfo.latitude?.toFixed(4)}, {selectedSiteInfo.longitude?.toFixed(4)}
                  </span>
                </div>

                {/* Region */}
                {selectedSiteInfo.region && (
                  <div
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148,163,184,0.06)' }}
                  >
                    <div className="flex items-center gap-2">
                      <Shield size={14} className="text-geo-600" />
                      <span className="text-xs text-geo-600">Region</span>
                    </div>
                    <span className="text-xs font-semibold text-geo-400">
                      {selectedSiteInfo.region}
                      {selectedSiteInfo.department && ` · ${selectedSiteInfo.department}`}
                    </span>
                  </div>
                )}

                {/* Impact environnemental */}
                {selectedSiteInfo.environmental_impact_score != null && (
                  <div
                    className="p-3 rounded-lg"
                    style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148,163,184,0.06)' }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp size={14} className="text-danger-400" />
                        <span className="text-xs text-geo-600">Impact environnemental</span>
                      </div>
                      <span className="text-xs font-bold text-danger-400 mono">
                        {Math.round(selectedSiteInfo.environmental_impact_score * 100)}%
                      </span>
                    </div>
                    <div
                      className="w-full h-2 rounded-full overflow-hidden"
                      style={{ background: 'rgba(15, 23, 42, 0.6)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.round(selectedSiteInfo.environmental_impact_score * 100)}%`,
                          background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                          boxShadow: '0 0 8px rgba(239, 68, 68, 0.3)',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Bouton vers la fiche complete */}
              <a
                href={`/sites/${selectedSiteInfo.id}`}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg
                           text-xs font-semibold text-white transition-all duration-200"
                style={{
                  background: 'linear-gradient(135deg, #fbbf24, #d97706)',
                  boxShadow: '0 0 16px rgba(251, 191, 36, 0.3)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 0 24px rgba(251, 191, 36, 0.5)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 0 16px rgba(251, 191, 36, 0.3)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                }}
              >
                <ExternalLink size={13} />
                Voir la fiche complete
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================================================================
          Barre inferieure - Stats live
          ================================================================== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: mapReady ? 1 : 0, y: mapReady ? 0 : 20 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="absolute bottom-0 left-0 right-0 z-10 h-12 flex items-center justify-center gap-6 px-6"
        style={{
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(148, 163, 184, 0.08)',
        }}
      >
        {/* Sites actifs */}
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
          >
            <MapPin size={12} className="text-danger-400" />
          </div>
          <div>
            <span className="text-sm font-bold text-geo-400 mono">{liveStats.activeSites}</span>
            <span className="text-[10px] text-geo-600 ml-1.5">sites actifs</span>
          </div>
        </div>

        {/* Separateur vertical */}
        <div className="w-px h-5 bg-geo-800" />

        {/* Total sites */}
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: 'rgba(251, 191, 36, 0.12)', border: '1px solid rgba(251, 191, 36, 0.2)' }}
          >
            <MapPin size={12} className="text-gold-400" />
          </div>
          <div>
            <span className="text-sm font-bold text-geo-400 mono">{liveStats.totalSites}</span>
            <span className="text-[10px] text-geo-600 ml-1.5">sites total</span>
          </div>
        </div>

        {/* Separateur vertical */}
        <div className="w-px h-5 bg-geo-800" />

        {/* Alertes 24h */}
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.2)' }}
          >
            <AlertTriangle size={12} className="text-warning-400" />
          </div>
          <div>
            <span className="text-sm font-bold text-geo-400 mono">{liveStats.alertes24h}</span>
            <span className="text-[10px] text-geo-600 ml-1.5">alertes 24h</span>
          </div>
        </div>

        {/* Separateur vertical */}
        <div className="w-px h-5 bg-geo-800" />

        {/* Capteurs AquaGuard */}
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.2)' }}
          >
            <Droplets size={12} className="text-cyan-400" />
          </div>
          <div>
            <span className="text-sm font-bold text-geo-400 mono">
              {liveStats.capteursOk}/{liveStats.capteurs}
            </span>
            <span className="text-[10px] text-geo-600 ml-1.5">capteurs OK</span>
          </div>
        </div>

        {/* Separateur vertical */}
        <div className="w-px h-5 bg-geo-800" />

        {/* Indicateur temps reel */}
        <div className="flex items-center gap-1.5">
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-gold-400"
          />
          <span className="text-[10px] text-geo-600 font-medium">Temps reel</span>
        </div>
      </motion.div>
    </div>
  );
}
