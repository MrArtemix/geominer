"""
Post-traitement des cartes de probabilite SegFormer.

Pipeline :
    1. Seuillage adaptatif Otsu par fenetre glissante
    2. Nettoyage morphologique (erosion + dilatation)
    3. Vectorisation en GeoJSON (GDAL Polygonize → WGS84)
    4. Clustering DBSCAN des sites proches

Auteur : Ge O'Miner / MineSpot AI
"""

from __future__ import annotations

import logging
from typing import Any

import cv2
import numpy as np
from osgeo import gdal, ogr, osr
from scipy.ndimage import label as ndimage_label
from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from sklearn.cluster import DBSCAN

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

# Superficie minimum en hectares pour conserver un polygone
MIN_AREA_HA = 0.1
# Superficie maximum en hectares pour filtrer les faux positifs
MAX_AREA_HA = 500.0
# Noyau morphologique : ellipse 5x5
MORPH_KERNEL = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))


# ---------------------------------------------------------------------------
# 1. Seuillage adaptatif Otsu par fenetre glissante
# ---------------------------------------------------------------------------

def threshold_otsu_adaptive(
    prob_map: np.ndarray,
    window_size: int = 64,
) -> np.ndarray:
    """
    Appliquer un seuillage Otsu local par fenetre glissante sur la carte
    de probabilite.

    La carte est decoupee en blocs de taille ``window_size x window_size``.
    Pour chaque bloc, le seuil d'Otsu est calcule independamment. Les blocs
    ayant une variance trop faible (zones homogenes) utilisent un seuil
    global de repli.

    Parametres
    ----------
    prob_map : ndarray (H, W)
        Carte de probabilite flottante dans [0, 1].
    window_size : int
        Taille de la fenetre glissante en pixels.

    Retourne
    --------
    binary_mask : ndarray (H, W) uint8
        Masque binaire (0 = fond, 1 = site minier).
    """
    if prob_map.ndim != 2:
        raise ValueError(
            f"prob_map doit etre 2D, recu {prob_map.ndim}D"
        )

    H, W = prob_map.shape
    binary_mask = np.zeros((H, W), dtype=np.uint8)

    # Convertir en echelle 0-255 pour Otsu OpenCV
    prob_u8 = (np.clip(prob_map, 0.0, 1.0) * 255).astype(np.uint8)

    # Seuil global Otsu comme valeur de repli
    global_thresh, _ = cv2.threshold(prob_u8, 0, 255, cv2.THRESH_OTSU)
    logger.debug(f"Seuil Otsu global de repli : {global_thresh}")

    # Variance minimale pour considerer un bloc comme significatif
    min_variance = 5.0

    for y_start in range(0, H, window_size):
        for x_start in range(0, W, window_size):
            y_end = min(y_start + window_size, H)
            x_end = min(x_start + window_size, W)

            bloc = prob_u8[y_start:y_end, x_start:x_end]

            # Verifier si le bloc a assez de variance pour un Otsu local
            if np.var(bloc) < min_variance:
                # Bloc homogene : utiliser le seuil global
                thresh = global_thresh
            else:
                thresh, _ = cv2.threshold(bloc, 0, 255, cv2.THRESH_OTSU)

            # Appliquer le seuil local sur le bloc
            binary_mask[y_start:y_end, x_start:x_end] = (
                bloc >= thresh
            ).astype(np.uint8)

    logger.info(
        f"Seuillage Otsu adaptatif termine : "
        f"{binary_mask.sum()} pixels positifs sur {H * W} "
        f"({binary_mask.sum() / (H * W) * 100:.2f}%)"
    )

    return binary_mask


# ---------------------------------------------------------------------------
# 2. Nettoyage morphologique du masque binaire
# ---------------------------------------------------------------------------

def clean_binary_mask(mask: np.ndarray) -> np.ndarray:
    """
    Nettoyer le masque binaire par operations morphologiques et filtrage
    de surface.

    Pipeline :
        1. Erosion (kernel ellipse 5x5) pour eliminer le bruit pixel
        2. Dilatation (meme kernel) pour restaurer les contours
        3. Suppression des composantes connexes < 0.1 ha
           (approximation : on utilise le nombre de pixels comme proxy
           avant vectorisation complete)

    Parametres
    ----------
    mask : ndarray (H, W) uint8
        Masque binaire brut (0 ou 1).

    Retourne
    --------
    cleaned : ndarray (H, W) uint8
        Masque binaire nettoye.
    """
    if mask.dtype != np.uint8:
        mask = mask.astype(np.uint8)

    # Erosion pour eliminer le bruit isole
    eroded = cv2.erode(mask, MORPH_KERNEL, iterations=1)

    # Dilatation pour restaurer les formes erodees
    dilated = cv2.dilate(eroded, MORPH_KERNEL, iterations=1)

    # Fermeture additionnelle pour combler les petits trous internes
    closed = cv2.morphologyEx(dilated, cv2.MORPH_CLOSE, MORPH_KERNEL)

    # Etiquetage des composantes connexes
    labeled, num_features = ndimage_label(closed)

    # Filtrer les petites composantes
    # Seuil heuristique : un pixel Sentinel-2 10m = 100m2 = 0.01 ha
    # Donc 0.1 ha = 10 pixels minimum (a 10m/pixel)
    min_pixels = 10  # Equivalent a ~0.1 ha pour Sentinel-2 a 10m
    cleaned = np.zeros_like(closed)

    for comp_id in range(1, num_features + 1):
        component = (labeled == comp_id)
        if component.sum() >= min_pixels:
            cleaned[component] = 1

    pixels_removed = int(closed.sum()) - int(cleaned.sum())
    logger.info(
        f"Nettoyage morphologique : {num_features} composantes trouvees, "
        f"{pixels_removed} pixels supprimes (composantes < {min_pixels}px)"
    )

    return cleaned


# ---------------------------------------------------------------------------
# 3. Vectorisation en GeoJSON avec GDAL Polygonize
# ---------------------------------------------------------------------------

def vectorize_to_geojson(
    binary_mask: np.ndarray,
    transform: Any,
    crs: str = "EPSG:4326",
) -> list[dict]:
    """
    Convertir un masque binaire raster en liste de Features GeoJSON
    via GDAL Polygonize.

    Chaque polygone resultant est reprojete en WGS84 et enrichi avec :
    - area_ha : superficie en hectares
    - centroid : [lon, lat]
    - bbox : [minx, miny, maxx, maxy]

    Les polygones < 0.1 ha et > 500 ha sont filtres.

    Parametres
    ----------
    binary_mask : ndarray (H, W) uint8
        Masque binaire nettoye.
    transform : rasterio.Affine
        Transformation affine pixel→coordonnees du CRS source.
    crs : str
        Code EPSG du CRS source (ex: "EPSG:4326", "EPSG:32630").

    Retourne
    --------
    features : list[dict]
        Liste de Features GeoJSON compatibles RFC 7946.
    """
    from rasterio.features import shapes as rasterio_shapes
    from pyproj import Transformer
    from shapely.ops import transform as shapely_transform

    H, W = binary_mask.shape
    features: list[dict] = []

    # Extraire les polygones avec rasterio (plus fiable que GDAL pur)
    mask_u8 = binary_mask.astype(np.uint8)

    # Determiner si une reprojection vers WGS84 est necessaire
    source_epsg = crs.replace("EPSG:", "") if "EPSG:" in crs else crs
    needs_reprojection = source_epsg != "4326"

    # Prepararer le transformateur de coordonnees si necessaire
    transformer = None
    if needs_reprojection:
        try:
            transformer = Transformer.from_crs(
                f"EPSG:{source_epsg}", "EPSG:4326", always_xy=True
            )
        except Exception as e:
            logger.warning(
                f"Impossible de creer le transformateur CRS "
                f"EPSG:{source_epsg} → EPSG:4326 : {e}. "
                f"Les coordonnees resteront dans le CRS source."
            )
            needs_reprojection = False

    # Transformer de projection pour les calculs de surface en metres
    # Utiliser une projection equivalente (Albers Cote d'Ivoire)
    area_transformer = None
    try:
        # EPSG:32630 = UTM zone 30N, couvre la Cote d'Ivoire
        area_transformer = Transformer.from_crs(
            "EPSG:4326", "EPSG:32630", always_xy=True
        )
    except Exception as e:
        logger.warning(
            f"Impossible de creer le transformateur de surface : {e}"
        )

    # Vectorisation rasterio
    for geom, value in rasterio_shapes(
        mask_u8, mask=mask_u8, transform=transform
    ):
        if value == 0:
            continue

        poly = shape(geom)

        # Reprojeter vers WGS84 si necessaire
        if needs_reprojection and transformer is not None:
            poly = shapely_transform(transformer.transform, poly)

        # Calculer la surface en hectares
        if area_transformer is not None:
            # Projeter vers UTM pour surface en m2
            poly_utm = shapely_transform(area_transformer.transform, poly)
            area_m2 = poly_utm.area
        else:
            # Approximation pour WGS84 : degres → metres au niveau equateur
            # 1 degre ≈ 111 320 m a l'equateur
            centroid = poly.centroid
            cos_lat = np.cos(np.radians(centroid.y))
            dx_m = 111320.0 * cos_lat
            dy_m = 110540.0
            # Approximation grossiere de la surface
            bounds = poly.bounds
            approx_width = (bounds[2] - bounds[0]) * dx_m
            approx_height = (bounds[3] - bounds[1]) * dy_m
            area_m2 = poly.area * dx_m * dy_m

        area_ha = area_m2 / 10000.0

        # Filtrer par superficie
        if area_ha < MIN_AREA_HA:
            continue
        if area_ha > MAX_AREA_HA:
            logger.warning(
                f"Polygone trop grand filtre : {area_ha:.1f} ha "
                f"(max {MAX_AREA_HA} ha)"
            )
            continue

        # Calculer centroide et bounding box
        centroid = poly.centroid
        bbox = list(poly.bounds)  # [minx, miny, maxx, maxy]

        feature = {
            "type": "Feature",
            "geometry": mapping(poly),
            "properties": {
                "class": "mining_site",
                "area_ha": round(area_ha, 4),
                "centroid": [round(centroid.x, 6), round(centroid.y, 6)],
                "bbox": [round(b, 6) for b in bbox],
            },
        }
        features.append(feature)

    logger.info(
        f"Vectorisation terminee : {len(features)} polygones valides "
        f"(filtre {MIN_AREA_HA}-{MAX_AREA_HA} ha)"
    )

    return features


# ---------------------------------------------------------------------------
# 4. Clustering DBSCAN des sites proches
# ---------------------------------------------------------------------------

def cluster_nearby_sites(
    polygons: list[dict],
    eps: float = 200.0,
    min_samples: int = 3,
) -> list[dict]:
    """
    Regrouper les polygones proches en clusters via DBSCAN sur les
    centroides, puis fusionner les geometries de chaque cluster.

    Parametres
    ----------
    polygons : list[dict]
        Liste de Features GeoJSON avec properties.centroid.
    eps : float
        Distance maximale entre centroides en metres (defaut 200m).
    min_samples : int
        Nombre minimum d'echantillons pour former un cluster (defaut 3).

    Retourne
    --------
    clustered : list[dict]
        Liste de Features GeoJSON (un par cluster + les outliers).
    """
    if len(polygons) == 0:
        return []

    if len(polygons) < min_samples:
        logger.info(
            f"Pas assez de polygones ({len(polygons)}) pour le clustering "
            f"(min_samples={min_samples}). Retour sans modification."
        )
        return polygons

    # Extraire les centroides
    centroids = []
    for feat in polygons:
        props = feat.get("properties", {})
        centroid = props.get("centroid")
        if centroid is not None:
            centroids.append(centroid)
        else:
            # Calculer le centroide depuis la geometrie
            poly = shape(feat["geometry"])
            c = poly.centroid
            centroids.append([c.x, c.y])

    centroids_array = np.array(centroids)

    # Convertir les degres en metres approximatifs pour DBSCAN
    # Latitude moyenne Cote d'Ivoire ≈ 7.5 degres Nord
    mean_lat = np.mean(centroids_array[:, 1])
    cos_lat = np.cos(np.radians(mean_lat))
    # Facteurs de conversion degres → metres
    lon_to_m = 111320.0 * cos_lat
    lat_to_m = 110540.0

    # Convertir en metres
    centroids_meters = centroids_array.copy()
    centroids_meters[:, 0] *= lon_to_m
    centroids_meters[:, 1] *= lat_to_m

    # Appliquer DBSCAN
    clustering = DBSCAN(
        eps=eps,
        min_samples=min_samples,
        metric="euclidean",
    )
    labels = clustering.fit_predict(centroids_meters)

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = int((labels == -1).sum())
    logger.info(
        f"DBSCAN clustering : {n_clusters} clusters trouves, "
        f"{n_noise} outliers (eps={eps}m, min_samples={min_samples})"
    )

    clustered: list[dict] = []

    # Regrouper les polygones par label de cluster
    unique_labels = set(labels)
    for label_id in sorted(unique_labels):
        indices = np.where(labels == label_id)[0]

        if label_id == -1:
            # Les outliers sont retournes tels quels
            for idx in indices:
                feat = polygons[idx].copy()
                feat["properties"] = {**feat.get("properties", {})}
                feat["properties"]["cluster_id"] = -1
                feat["properties"]["cluster_size"] = 1
                clustered.append(feat)
            continue

        # Fusionner les geometries du cluster
        cluster_polys = []
        cluster_areas = []
        for idx in indices:
            poly = shape(polygons[idx]["geometry"])
            cluster_polys.append(poly)
            area = polygons[idx].get("properties", {}).get("area_ha", 0)
            cluster_areas.append(area)

        merged_geometry = unary_union(cluster_polys)
        merged_centroid = merged_geometry.centroid
        merged_bbox = list(merged_geometry.bounds)
        total_area = sum(cluster_areas)

        cluster_feature = {
            "type": "Feature",
            "geometry": mapping(merged_geometry),
            "properties": {
                "class": "mining_site_cluster",
                "cluster_id": int(label_id),
                "cluster_size": len(indices),
                "area_ha": round(total_area, 4),
                "centroid": [
                    round(merged_centroid.x, 6),
                    round(merged_centroid.y, 6),
                ],
                "bbox": [round(b, 6) for b in merged_bbox],
                "member_count": len(indices),
            },
        }
        clustered.append(cluster_feature)

    logger.info(
        f"Clustering termine : {len(clustered)} features resultantes "
        f"({n_clusters} clusters + {n_noise} outliers)"
    )

    return clustered


# ---------------------------------------------------------------------------
# Pipeline complet de post-traitement
# ---------------------------------------------------------------------------

def run_postprocessing_pipeline(
    prob_map: np.ndarray,
    transform: Any,
    crs: str = "EPSG:4326",
    window_size: int = 64,
    cluster_eps: float = 200.0,
    cluster_min_samples: int = 3,
) -> dict:
    """
    Executer le pipeline complet de post-traitement :
        1. Seuillage Otsu adaptatif
        2. Nettoyage morphologique
        3. Vectorisation GeoJSON
        4. Clustering DBSCAN

    Parametres
    ----------
    prob_map : ndarray (H, W)
        Carte de probabilite issue du modele SegFormer.
    transform : rasterio.Affine
        Transformation affine du raster source.
    crs : str
        CRS source (ex: "EPSG:32630").
    window_size : int
        Taille de la fenetre pour Otsu adaptatif.
    cluster_eps : float
        Distance DBSCAN en metres.
    cluster_min_samples : int
        Nombre minimum d'echantillons pour DBSCAN.

    Retourne
    --------
    result : dict
        {
            "binary_mask": ndarray,
            "features": list[Feature],
            "clustered_features": list[Feature],
            "stats": dict avec metriques du pipeline
        }
    """
    logger.info("Demarrage du pipeline de post-traitement")

    # Etape 1 : Seuillage adaptatif
    binary_mask = threshold_otsu_adaptive(prob_map, window_size=window_size)

    # Etape 2 : Nettoyage morphologique
    cleaned_mask = clean_binary_mask(binary_mask)

    # Etape 3 : Vectorisation GeoJSON
    features = vectorize_to_geojson(cleaned_mask, transform, crs)

    # Etape 4 : Clustering DBSCAN
    clustered_features = cluster_nearby_sites(
        features,
        eps=cluster_eps,
        min_samples=cluster_min_samples,
    )

    # Statistiques du pipeline
    stats = {
        "pixels_positifs_bruts": int(binary_mask.sum()),
        "pixels_positifs_nettoyes": int(cleaned_mask.sum()),
        "polygones_vectorises": len(features),
        "features_apres_clustering": len(clustered_features),
        "surface_totale_ha": round(
            sum(
                f.get("properties", {}).get("area_ha", 0)
                for f in features
            ),
            2,
        ),
    }

    logger.info(
        f"Pipeline termine : {stats['polygones_vectorises']} polygones, "
        f"{stats['features_apres_clustering']} features finales, "
        f"{stats['surface_totale_ha']} ha total"
    )

    return {
        "binary_mask": cleaned_mask,
        "features": features,
        "clustered_features": clustered_features,
        "stats": stats,
    }
