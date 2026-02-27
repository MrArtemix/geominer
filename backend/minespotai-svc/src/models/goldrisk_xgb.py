"""
GoldRisk XGBoost — Modele de prediction du risque minier par hexagone H3.

Entraine sur 500 hexagones synthetiques avec 8 features geospatiales
pour predire un score de risque minier (0-1) par cellule H3 resolution 7.

Endpoints FastAPI :
    GET  /risk-map/h3              - Carte de risque GeoJSON (cache Redis 24h)
    GET  /risk-map/h3/{h3_index}   - Score de risque pour un hexagone specifique
    POST /risk-map/refresh         - Rafraichir le cache et recalculer les scores

Auteur : Ge O'Miner / MineSpot AI
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

import h3
import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Chemin par defaut du modele sauvegarde
DEFAULT_MODEL_PATH = os.getenv(
    "GOLDRISK_MODEL_PATH",
    str(Path(__file__).resolve().parents[4] / "ml" / "models" / "goldrisk_v1.pkl"),
)

# Configuration Redis
REDIS_URL = os.getenv("REDIS_URL", "redis://:redis_secret_2024@redis:6379/0")
REDIS_CACHE_KEY = "goldrisk:risk_map:h3"
REDIS_CACHE_TTL = 86400  # 24 heures en secondes

# Les 8 features du modele GoldRisk
FEATURE_NAMES: list[str] = [
    "distance_to_known_site_km",   # Distance au site minier connu le plus proche (km)
    "distance_to_river_km",        # Distance a la riviere la plus proche (km)
    "elevation_m",                 # Altitude moyenne de l'hexagone (m)
    "historical_site_count_10km",  # Nombre de sites historiques dans un rayon de 10km
    "road_accessibility_score",    # Score d'accessibilite routiere (0-1)
    "ndvi_trend_6months",          # Tendance NDVI sur 6 mois (negatif = deforestation)
    "gold_price_index",            # Indice du prix de l'or normalise (0-1)
    "is_border_region",            # 1 si zone frontaliere, 0 sinon
]

# Parametres XGBoost
XGBOOST_PARAMS = {
    "n_estimators": 300,
    "max_depth": 7,
    "learning_rate": 0.05,
    "subsample": 0.8,
    "colsample_bytree": 0.8,
    "min_child_weight": 3,
    "gamma": 0.1,
    "reg_alpha": 0.1,
    "reg_lambda": 1.0,
    "objective": "binary:logistic",
    "eval_metric": "auc",
    "random_state": 42,
    "n_jobs": -1,
    "verbosity": 0,
}


# ---------------------------------------------------------------------------
# Generation de donnees synthetiques
# ---------------------------------------------------------------------------

def _generate_synthetic_h3_data(
    n_samples: int = 500,
    random_seed: int = 42,
) -> tuple[pd.DataFrame, np.ndarray]:
    """
    Generer des donnees synthetiques representant des hexagones H3
    en Cote d'Ivoire pour entrainer le modele de risque.

    La variable cible est un score de risque (0-1) base sur une formule
    heuristique combinant les 8 features geospatiales.

    Parametres
    ----------
    n_samples : int
        Nombre d'hexagones synthetiques a generer.
    random_seed : int
        Graine pour la reproductibilite.

    Retourne
    --------
    X : DataFrame (n_samples, 8)
        Features geospatiales.
    y : ndarray (n_samples,)
        Labels binaires (0 = faible risque, 1 = risque eleve).
    """
    rng = np.random.RandomState(random_seed)

    # Generer les features avec des distributions realistes pour la CI
    distance_to_known_site_km = rng.exponential(15, n_samples).clip(0.1, 100)
    distance_to_river_km = rng.exponential(5, n_samples).clip(0.05, 50)
    elevation_m = rng.normal(350, 200, n_samples).clip(0, 1200)
    historical_site_count_10km = rng.poisson(2, n_samples).clip(0, 25)
    road_accessibility_score = rng.beta(3, 4, n_samples)
    ndvi_trend_6months = rng.normal(-0.02, 0.05, n_samples).clip(-0.3, 0.2)
    gold_price_index = rng.beta(5, 3, n_samples)
    is_border_region = rng.binomial(1, 0.15, n_samples).astype(float)

    X = pd.DataFrame({
        "distance_to_known_site_km": distance_to_known_site_km,
        "distance_to_river_km": distance_to_river_km,
        "elevation_m": elevation_m,
        "historical_site_count_10km": historical_site_count_10km,
        "road_accessibility_score": road_accessibility_score,
        "ndvi_trend_6months": ndvi_trend_6months,
        "gold_price_index": gold_price_index,
        "is_border_region": is_border_region,
    })

    # Formule heuristique de risque basee sur l'expertise metier
    # Un score eleve signifie un risque de site minier illegal eleve
    risk_score = (
        # Proximite d'un site connu : facteur principal
        np.clip(1.0 - distance_to_known_site_km / 50.0, 0, 1) * 0.25
        # Proximite riviere : orpaillage souvent pres des cours d'eau
        + np.clip(1.0 - distance_to_river_km / 20.0, 0, 1) * 0.15
        # Altitude : zones alluviales preferees (200-500m en CI)
        + np.clip(1.0 - np.abs(elevation_m - 350) / 500, 0, 1) * 0.10
        # Historique : sites precedents = recurrence probable
        + np.clip(historical_site_count_10km / 10.0, 0, 1) * 0.15
        # Accessibilite : paradoxalement, les zones peu accessibles aussi
        + (1.0 - road_accessibility_score) * 0.05
        + road_accessibility_score * 0.05
        # Tendance NDVI negative = deforestation potentielle
        + np.clip(-ndvi_trend_6months * 10, 0, 1) * 0.10
        # Prix de l'or eleve = motivation accrue
        + gold_price_index * 0.10
        # Zone frontaliere : controle plus difficile
        + is_border_region * 0.10
    )

    # Ajouter du bruit et convertir en labels binaires
    noise = rng.normal(0, 0.08, n_samples)
    risk_prob = np.clip(risk_score + noise, 0, 1)

    # Seuil a 0.45 pour obtenir environ 35% de positifs (realiste pour la CI)
    y = (risk_prob > 0.45).astype(int)

    logger.info(
        f"Donnees synthetiques generees : {n_samples} hexagones, "
        f"{y.sum()} positifs ({y.mean() * 100:.1f}%)"
    )

    return X, y


# ---------------------------------------------------------------------------
# Entrainement du modele XGBoost
# ---------------------------------------------------------------------------

def train_goldrisk_model(
    model_path: str | None = None,
    n_samples: int = 500,
) -> xgb.XGBClassifier:
    """
    Entrainer le modele XGBoost GoldRisk sur des donnees synthetiques
    et sauvegarder le modele avec joblib.

    Parametres
    ----------
    model_path : str | None
        Chemin de sauvegarde. Defaut : ml/models/goldrisk_v1.pkl
    n_samples : int
        Nombre d'hexagones synthetiques.

    Retourne
    --------
    model : XGBClassifier
        Modele entraine.
    """
    save_path = Path(model_path or DEFAULT_MODEL_PATH)
    save_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info(
        f"Entrainement du modele GoldRisk XGBoost "
        f"sur {n_samples} hexagones synthetiques"
    )

    # Generer les donnees
    X, y = _generate_synthetic_h3_data(n_samples=n_samples)

    # Configurer le modele XGBoost
    model = xgb.XGBClassifier(**XGBOOST_PARAMS)

    # Split train/eval pour l'early stopping
    from sklearn.model_selection import train_test_split

    X_train, X_eval, y_train, y_eval = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_eval, y_eval)],
        verbose=False,
    )

    # Evaluation rapide
    from sklearn.metrics import roc_auc_score, classification_report

    y_pred_proba = model.predict_proba(X_eval)[:, 1]
    y_pred = model.predict(X_eval)
    auc = roc_auc_score(y_eval, y_pred_proba)

    logger.info(f"AUC sur la validation : {auc:.4f}")
    logger.info(
        f"Rapport de classification :\n"
        f"{classification_report(y_eval, y_pred, target_names=['Faible risque', 'Risque eleve'])}"
    )

    # Importance des features
    importances = dict(zip(FEATURE_NAMES, model.feature_importances_))
    sorted_imp = sorted(importances.items(), key=lambda x: x[1], reverse=True)
    logger.info("Importance des features GoldRisk :")
    for feat_name, imp_value in sorted_imp:
        logger.info(f"  {feat_name}: {imp_value:.4f}")

    # Sauvegarder le modele
    joblib.dump(model, save_path)
    logger.info(f"Modele GoldRisk sauvegarde dans {save_path}")

    return model


# ---------------------------------------------------------------------------
# Chargement du modele
# ---------------------------------------------------------------------------

_goldrisk_model: Optional[xgb.XGBClassifier] = None


def _load_goldrisk_model(model_path: str | None = None) -> xgb.XGBClassifier:
    """
    Charger le modele GoldRisk depuis le disque.
    Si inexistant, entrainer automatiquement sur donnees synthetiques.
    """
    global _goldrisk_model

    if _goldrisk_model is not None:
        return _goldrisk_model

    path = Path(model_path or DEFAULT_MODEL_PATH)

    if not path.exists():
        logger.warning(
            f"Modele GoldRisk introuvable a {path}. "
            f"Entrainement automatique sur donnees synthetiques."
        )
        _goldrisk_model = train_goldrisk_model(model_path=str(path))
    else:
        logger.info(f"Chargement du modele GoldRisk depuis {path}")
        _goldrisk_model = joblib.load(path)

    return _goldrisk_model


# ---------------------------------------------------------------------------
# Fonctions de prediction
# ---------------------------------------------------------------------------

def _get_features_for_h3(h3_index: str) -> dict:
    """
    Generer des features synthetiques pour un hexagone H3 donne.

    En production, ces features seraient extraites de sources geospatiales
    reelles (PostGIS, rasters, API). Ici on utilise le hash de l'index H3
    comme graine pour des valeurs deterministes et reproductibles.

    Parametres
    ----------
    h3_index : str
        Index H3 resolution 7.

    Retourne
    --------
    features : dict
        Dictionnaire des 8 features pour cet hexagone.
    """
    # Utiliser le hash de l'index H3 comme graine deterministe
    seed = hash(h3_index) % (2**31)
    rng = np.random.RandomState(abs(seed))

    # Position geographique de l'hexagone
    lat, lng = h3.cell_to_latlng(h3_index)

    # Generer des features correlees avec la position geographique
    # Les zones du sud de la CI ont plus de forets et de rivieres
    lat_factor = (lat - 4.35) / (10.74 - 4.35)  # 0=sud, 1=nord

    # Distance au site connu : plus probable pres des zones auriferes connues
    # Zones auriferes historiques : nord-est (Ity, Tongon) et centre (Agbaou)
    distance_ity = np.sqrt((lat - 7.8)**2 + (lng - (-7.0))**2) * 111
    distance_to_known_site_km = float(
        max(0.5, distance_ity * rng.uniform(0.5, 1.5))
    )

    # Distance a la riviere : plus de cours d'eau au sud
    distance_to_river_km = float(
        rng.exponential(3 + lat_factor * 5).clip(0.1, 40)
    )

    # Altitude : varie avec la geographie CI
    base_elevation = 200 + lat_factor * 300  # Plus eleve au nord
    elevation_m = float(
        rng.normal(base_elevation, 80).clip(0, 1200)
    )

    # Sites historiques : plus concentres dans les zones auriferes
    concentration = max(0.1, 1.0 - distance_ity / 50)
    historical_site_count_10km = int(
        rng.poisson(concentration * 5).clip(0, 25)
    )

    # Accessibilite routiere
    road_accessibility_score = float(rng.beta(3, 4))

    # Tendance NDVI : deforestation plus marquee au sud
    ndvi_trend_6months = float(
        rng.normal(-0.01 - (1 - lat_factor) * 0.02, 0.03).clip(-0.3, 0.2)
    )

    # Prix de l'or : index global
    gold_price_index = float(rng.beta(5, 3))

    # Zone frontaliere : verifier la proximite des frontieres CI
    # Frontieres approximatives : nord (Mali), nord-est (Burkina), est (Ghana),
    # ouest (Liberia, Guinee)
    is_near_border = (
        lat > 9.5  # Proche du Mali/Burkina
        or lng < -7.8  # Proche du Liberia/Guinee
        or lng > -3.0  # Proche du Ghana
    )
    is_border_region = float(is_near_border and rng.random() > 0.3)

    return {
        "distance_to_known_site_km": round(distance_to_known_site_km, 2),
        "distance_to_river_km": round(distance_to_river_km, 2),
        "elevation_m": round(elevation_m, 1),
        "historical_site_count_10km": historical_site_count_10km,
        "road_accessibility_score": round(road_accessibility_score, 3),
        "ndvi_trend_6months": round(ndvi_trend_6months, 4),
        "gold_price_index": round(gold_price_index, 3),
        "is_border_region": is_border_region,
    }


def predict_risk(h3_index: str) -> float:
    """
    Predire le score de risque minier pour un hexagone H3.

    Parametres
    ----------
    h3_index : str
        Index H3 resolution 7.

    Retourne
    --------
    risk_score : float
        Probabilite de risque minier dans [0, 1].
    """
    model = _load_goldrisk_model()
    features = _get_features_for_h3(h3_index)

    X = pd.DataFrame([features], columns=FEATURE_NAMES)
    risk_score = float(model.predict_proba(X)[0, 1])

    return round(risk_score, 4)


def predict_risk_batch(h3_indices: list[str]) -> dict[str, float]:
    """
    Predire le score de risque pour une liste d'hexagones H3 en batch.

    Parametres
    ----------
    h3_indices : list[str]
        Liste d'index H3 resolution 7.

    Retourne
    --------
    results : dict[str, float]
        Dictionnaire {h3_index: risk_score}.
    """
    if not h3_indices:
        return {}

    model = _load_goldrisk_model()

    # Generer les features pour tous les hexagones
    rows = []
    for h3_idx in h3_indices:
        features = _get_features_for_h3(h3_idx)
        rows.append([features[name] for name in FEATURE_NAMES])

    X = pd.DataFrame(rows, columns=FEATURE_NAMES)

    # Prediction batch
    probas = model.predict_proba(X)[:, 1]

    results = {
        h3_idx: round(float(prob), 4)
        for h3_idx, prob in zip(h3_indices, probas)
    }

    logger.info(
        f"Prediction batch : {len(results)} hexagones scores, "
        f"risque moyen = {np.mean(list(results.values())):.3f}"
    )

    return results


# ---------------------------------------------------------------------------
# Utilitaire Redis
# ---------------------------------------------------------------------------

def _get_redis_client():
    """Creer un client Redis."""
    try:
        import redis
        return redis.from_url(REDIS_URL, decode_responses=True)
    except ImportError:
        logger.warning("Package 'redis' non installe, cache desactive")
        return None
    except Exception as e:
        logger.warning(f"Connexion Redis impossible : {e}")
        return None


# ---------------------------------------------------------------------------
# Schemas Pydantic pour les endpoints
# ---------------------------------------------------------------------------

class H3RiskResponse(BaseModel):
    """Reponse pour un hexagone H3 individuel."""
    h3_index: str
    risk_score: float
    risk_level: str
    features: dict
    geometry: dict  # GeoJSON du polygone H3


class RiskMapResponse(BaseModel):
    """Reponse pour la carte de risque complete."""
    type: str = "FeatureCollection"
    features: list[dict]
    metadata: dict


class RefreshResponse(BaseModel):
    """Reponse du rafraichissement de la carte de risque."""
    status: str
    hexagons_updated: int
    cache_ttl_s: int


# ---------------------------------------------------------------------------
# Router FastAPI
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/risk-map", tags=["risk-map"])


def _risk_level(score: float) -> str:
    """Convertir un score de risque en niveau textuel."""
    if score >= 0.8:
        return "CRITIQUE"
    elif score >= 0.6:
        return "ELEVE"
    elif score >= 0.4:
        return "MOYEN"
    elif score >= 0.2:
        return "FAIBLE"
    else:
        return "MINIMAL"


def _h3_to_geojson_polygon(h3_index: str) -> dict:
    """Convertir un index H3 en geometrie GeoJSON Polygon."""
    boundary = h3.cell_to_boundary(h3_index)
    # h3 retourne les coords en (lat, lng), GeoJSON attend (lng, lat)
    coords = [[lng, lat] for lat, lng in boundary]
    # Fermer le polygone
    coords.append(coords[0])
    return {
        "type": "Polygon",
        "coordinates": [coords],
    }


@router.get("/h3", response_model=RiskMapResponse)
async def get_risk_map_h3(
    min_risk: float = Query(0.0, ge=0.0, le=1.0, description="Score de risque minimum"),
    resolution: int = Query(7, ge=4, le=9, description="Resolution H3"),
) -> RiskMapResponse:
    """
    Obtenir la carte de risque minier en GeoJSON avec des hexagones H3.

    Le resultat est mis en cache Redis pendant 24 heures.
    Chaque hexagone contient un score de risque et un niveau de risque.
    """
    # Verifier le cache Redis
    redis_client = _get_redis_client()
    cache_key = f"{REDIS_CACHE_KEY}:res{resolution}:min{min_risk}"

    if redis_client is not None:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                logger.info(f"Carte de risque servie depuis le cache Redis ({cache_key})")
                data = json.loads(cached)
                return RiskMapResponse(**data)
        except Exception as e:
            logger.warning(f"Erreur lecture cache Redis : {e}")

    # Generer la carte de risque
    # Bounding box de la Cote d'Ivoire
    min_lon, min_lat = -8.60, 4.35
    max_lon, max_lat = -2.49, 10.74

    # Generer les hexagones H3 couvrant la bbox
    # Utiliser les sommets de la bbox pour obtenir les hexagones
    bbox_polygon = [
        (min_lat, min_lon),
        (min_lat, max_lon),
        (max_lat, max_lon),
        (max_lat, min_lon),
        (min_lat, min_lon),
    ]

    # Obtenir tous les hexagones H3 intersectant la bbox
    try:
        h3_indices = list(h3.polygon_to_cells(
            h3.LatLngPoly(bbox_polygon),
            res=resolution,
        ))
    except Exception as e:
        logger.error(f"Erreur generation grille H3 : {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la generation de la grille H3 : {str(e)}",
        )

    logger.info(
        f"Grille H3 generee : {len(h3_indices)} hexagones "
        f"a resolution {resolution}"
    )

    # Predire le risque pour tous les hexagones
    risk_scores = predict_risk_batch(h3_indices)

    # Construire le GeoJSON
    features = []
    for h3_idx, score in risk_scores.items():
        if score < min_risk:
            continue

        feature = {
            "type": "Feature",
            "geometry": _h3_to_geojson_polygon(h3_idx),
            "properties": {
                "h3_index": h3_idx,
                "risk_score": score,
                "risk_level": _risk_level(score),
                "resolution": resolution,
            },
        }
        features.append(feature)

    # Trier par score decroissant
    features.sort(
        key=lambda f: f["properties"]["risk_score"], reverse=True
    )

    result_data = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "total_hexagons": len(h3_indices),
            "filtered_hexagons": len(features),
            "min_risk_filter": min_risk,
            "resolution": resolution,
            "avg_risk": round(
                np.mean(list(risk_scores.values())), 4
            ) if risk_scores else 0.0,
            "max_risk": round(
                max(risk_scores.values()), 4
            ) if risk_scores else 0.0,
        },
    }

    # Mettre en cache Redis
    if redis_client is not None:
        try:
            redis_client.setex(
                cache_key,
                REDIS_CACHE_TTL,
                json.dumps(result_data),
            )
            logger.info(f"Carte de risque mise en cache Redis ({cache_key})")
        except Exception as e:
            logger.warning(f"Erreur ecriture cache Redis : {e}")

    return RiskMapResponse(**result_data)


@router.get("/h3/{h3_index}", response_model=H3RiskResponse)
async def get_risk_h3_single(h3_index: str) -> H3RiskResponse:
    """
    Obtenir le score de risque minier pour un hexagone H3 specifique.

    Parametres
    ----------
    h3_index : str
        Index H3 valide (ex: "872a1072dffffff").
    """
    # Valider l'index H3
    if not h3.is_valid_cell(h3_index):
        raise HTTPException(
            status_code=400,
            detail=f"Index H3 invalide : '{h3_index}'"
        )

    # Obtenir les features et le score
    features = _get_features_for_h3(h3_index)
    risk_score = predict_risk(h3_index)
    geometry = _h3_to_geojson_polygon(h3_index)

    return H3RiskResponse(
        h3_index=h3_index,
        risk_score=risk_score,
        risk_level=_risk_level(risk_score),
        features=features,
        geometry=geometry,
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_risk_map(
    resolution: int = Query(7, ge=4, le=9, description="Resolution H3"),
) -> RefreshResponse:
    """
    Rafraichir la carte de risque en invalidant le cache Redis
    et en recalculant les scores pour tous les hexagones.
    """
    # Invalider le cache Redis
    redis_client = _get_redis_client()
    if redis_client is not None:
        try:
            # Supprimer toutes les cles de cache de la carte de risque
            pattern = f"{REDIS_CACHE_KEY}:*"
            keys = redis_client.keys(pattern)
            if keys:
                redis_client.delete(*keys)
                logger.info(f"{len(keys)} cles de cache supprimees")
        except Exception as e:
            logger.warning(f"Erreur invalidation cache Redis : {e}")

    # Recalculer pour forcer le cache
    # Bounding box CI
    bbox_polygon = [
        (4.35, -8.60),
        (4.35, -2.49),
        (10.74, -2.49),
        (10.74, -8.60),
        (4.35, -8.60),
    ]

    try:
        h3_indices = list(h3.polygon_to_cells(
            h3.LatLngPoly(bbox_polygon),
            res=resolution,
        ))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur generation grille H3 : {str(e)}",
        )

    # Recalculer les scores en batch
    risk_scores = predict_risk_batch(h3_indices)

    # Remettre en cache
    features = []
    for h3_idx, score in risk_scores.items():
        feature = {
            "type": "Feature",
            "geometry": _h3_to_geojson_polygon(h3_idx),
            "properties": {
                "h3_index": h3_idx,
                "risk_score": score,
                "risk_level": _risk_level(score),
                "resolution": resolution,
            },
        }
        features.append(feature)

    result_data = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "total_hexagons": len(h3_indices),
            "filtered_hexagons": len(features),
            "min_risk_filter": 0.0,
            "resolution": resolution,
            "avg_risk": round(np.mean(list(risk_scores.values())), 4),
            "max_risk": round(max(risk_scores.values()), 4),
        },
    }

    if redis_client is not None:
        try:
            cache_key = f"{REDIS_CACHE_KEY}:res{resolution}:min0.0"
            redis_client.setex(
                cache_key,
                REDIS_CACHE_TTL,
                json.dumps(result_data),
            )
            logger.info("Cache Redis rafraichi avec succes")
        except Exception as e:
            logger.warning(f"Erreur ecriture cache Redis : {e}")

    logger.info(
        f"Carte de risque rafraichie : {len(h3_indices)} hexagones "
        f"a resolution {resolution}"
    )

    return RefreshResponse(
        status="succes",
        hexagons_updated=len(h3_indices),
        cache_ttl_s=REDIS_CACHE_TTL,
    )


# ---------------------------------------------------------------------------
# Point d'entree pour l'entrainement initial
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger.info("Entrainement initial du modele GoldRisk XGBoost")
    model = train_goldrisk_model()
    logger.info("Entrainement termine avec succes")

    # Test rapide sur quelques hexagones
    test_indices = [
        h3.latlng_to_cell(7.5, -5.5, 7),  # Centre CI
        h3.latlng_to_cell(5.3, -4.0, 7),   # Abidjan
        h3.latlng_to_cell(7.8, -7.0, 7),   # Zone aurifere Ity
        h3.latlng_to_cell(9.5, -5.5, 7),   # Nord CI
    ]

    results = predict_risk_batch(test_indices)
    for h3_idx, score in results.items():
        lat, lng = h3.cell_to_latlng(h3_idx)
        logger.info(
            f"  {h3_idx} ({lat:.2f}, {lng:.2f}) : "
            f"risque = {score:.4f} ({_risk_level(score)})"
        )
