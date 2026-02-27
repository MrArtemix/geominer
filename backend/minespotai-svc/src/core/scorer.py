"""
Scorer composite pour la priorisation des sites miniers detectes.

Utilise un modele LightGBM entraine sur des donnees synthetiques pour
calculer un score composite (0-100) a partir de 8 features contextuelles.

Priorites :
    CRITICAL (>80), HIGH (60-80), MEDIUM (40-60), LOW (<40)

Auteur : Ge O'Miner / MineSpot AI
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constantes et configuration
# ---------------------------------------------------------------------------

# Les 8 features MVP du scorer composite
FEATURE_NAMES: list[str] = [
    "confidence_ai",             # Score de confiance du modele IA (0-1)
    "distance_forest_m",         # Distance a la foret la plus proche en metres
    "distance_water_m",          # Distance au cours d'eau le plus proche en metres
    "area_ha",                   # Superficie du site detecte en hectares
    "is_protected_zone",         # 1 si dans une zone protegee, 0 sinon
    "historical_activity_count", # Nombre d'activites minieres historiques dans un rayon de 5km
    "accessibility_score",       # Score d'accessibilite routiere (0-1)
    "elevation_m",               # Altitude en metres
]

# Seuils de priorite
PRIORITY_THRESHOLDS = {
    "CRITICAL": 80,
    "HIGH": 60,
    "MEDIUM": 40,
    "LOW": 0,
}

# Chemin par defaut du modele sauvegarde
DEFAULT_MODEL_PATH = os.getenv(
    "SCORER_MODEL_PATH",
    str(Path(__file__).resolve().parents[5] / "ml" / "models" / "scorer_v1.pkl"),
)


# ---------------------------------------------------------------------------
# Generation de donnees synthetiques pour l'entrainement initial
# ---------------------------------------------------------------------------

def _generate_synthetic_training_data(
    n_samples: int = 100,
    random_seed: int = 42,
) -> tuple[pd.DataFrame, np.ndarray]:
    """
    Generer des donnees synthetiques realistes pour entrainer le scorer.

    La variable cible (score 0-100) est calculee par une formule heuristique
    basee sur l'expertise du domaine minier en Cote d'Ivoire, puis bruitee
    pour simuler la variabilite reelle.

    Parametres
    ----------
    n_samples : int
        Nombre d'exemples a generer.
    random_seed : int
        Graine aleatoire pour la reproductibilite.

    Retourne
    --------
    X : DataFrame (n_samples, 8)
        Features d'entrainement.
    y : ndarray (n_samples,)
        Scores cibles dans [0, 100].
    """
    rng = np.random.RandomState(random_seed)

    # Generer les features avec des distributions realistes
    confidence_ai = rng.beta(5, 2, n_samples)  # Tendance vers les valeurs hautes
    distance_forest_m = rng.exponential(500, n_samples).clip(0, 5000)
    distance_water_m = rng.exponential(800, n_samples).clip(0, 10000)
    area_ha = rng.lognormal(1.5, 1.0, n_samples).clip(0.1, 200)
    is_protected_zone = rng.binomial(1, 0.2, n_samples).astype(float)
    historical_activity_count = rng.poisson(3, n_samples).clip(0, 20)
    accessibility_score = rng.beta(3, 3, n_samples)
    elevation_m = rng.normal(350, 150, n_samples).clip(50, 1000)

    X = pd.DataFrame({
        "confidence_ai": confidence_ai,
        "distance_forest_m": distance_forest_m,
        "distance_water_m": distance_water_m,
        "area_ha": area_ha,
        "is_protected_zone": is_protected_zone,
        "historical_activity_count": historical_activity_count,
        "accessibility_score": accessibility_score,
        "elevation_m": elevation_m,
    })

    # Formule heuristique de scoring basee sur l'expertise metier
    # Plus le score est haut, plus le site est prioritaire
    score = (
        # Confiance IA : facteur principal
        confidence_ai * 30.0
        # Proximite foret : plus pres = plus critique (deforestation)
        + np.clip(1.0 - distance_forest_m / 5000.0, 0, 1) * 15.0
        # Proximite eau : plus pres = plus critique (pollution)
        + np.clip(1.0 - distance_water_m / 10000.0, 0, 1) * 12.0
        # Surface : les grands sites sont plus prioritaires
        + np.clip(np.log1p(area_ha) / np.log1p(200), 0, 1) * 10.0
        # Zone protegee : bonus majeur
        + is_protected_zone * 15.0
        # Historique : activite repetee = risque plus eleve
        + np.clip(historical_activity_count / 10.0, 0, 1) * 8.0
        # Accessibilite : sites accessibles = intervention plus facile
        + accessibility_score * 5.0
        # Altitude : altitude moyenne preferee (zones auriferes)
        + np.clip(1.0 - np.abs(elevation_m - 400) / 600, 0, 1) * 5.0
    )

    # Ajouter du bruit gaussien pour la variabilite
    noise = rng.normal(0, 3, n_samples)
    y = np.clip(score + noise, 0, 100)

    return X, y


# ---------------------------------------------------------------------------
# Entrainement et sauvegarde du modele LightGBM
# ---------------------------------------------------------------------------

def train_scorer_model(
    model_path: str | None = None,
    n_samples: int = 100,
) -> Any:
    """
    Entrainer un modele LightGBM sur des donnees synthetiques et le
    sauvegarder sur disque avec joblib.

    Parametres
    ----------
    model_path : str | None
        Chemin de sauvegarde du modele. Utilise DEFAULT_MODEL_PATH si None.
    n_samples : int
        Nombre d'exemples synthetiques pour l'entrainement.

    Retourne
    --------
    model : LGBMRegressor
        Modele entraine.
    """
    import lightgbm as lgb

    save_path = Path(model_path or DEFAULT_MODEL_PATH)
    save_path.parent.mkdir(parents=True, exist_ok=True)

    logger.info(
        f"Entrainement du scorer LightGBM sur {n_samples} exemples synthetiques"
    )

    # Generer les donnees
    X, y = _generate_synthetic_training_data(n_samples=n_samples)

    # Configurer et entrainer LightGBM
    model = lgb.LGBMRegressor(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.1,
        num_leaves=31,
        min_child_samples=5,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=0.1,
        random_state=42,
        verbose=-1,
    )

    model.fit(
        X, y,
        feature_name=FEATURE_NAMES,
    )

    # Sauvegarder le modele
    joblib.dump(model, save_path)
    logger.info(f"Modele scorer sauvegarde dans {save_path}")

    # Log des importances de features
    importances = dict(zip(FEATURE_NAMES, model.feature_importances_))
    sorted_imp = sorted(importances.items(), key=lambda x: x[1], reverse=True)
    logger.info("Importance des features :")
    for feat_name, imp_value in sorted_imp:
        logger.info(f"  {feat_name}: {imp_value}")

    return model


# ---------------------------------------------------------------------------
# Chargement du modele
# ---------------------------------------------------------------------------

_scorer_model: Any = None


def _load_scorer_model(model_path: str | None = None) -> Any:
    """
    Charger le modele scorer depuis le disque.
    Si le fichier n'existe pas, entrainer un nouveau modele automatiquement.
    """
    global _scorer_model

    if _scorer_model is not None:
        return _scorer_model

    path = Path(model_path or DEFAULT_MODEL_PATH)

    if not path.exists():
        logger.warning(
            f"Modele scorer introuvable a {path}. "
            f"Entrainement automatique sur donnees synthetiques."
        )
        _scorer_model = train_scorer_model(model_path=str(path))
    else:
        logger.info(f"Chargement du modele scorer depuis {path}")
        _scorer_model = joblib.load(path)

    return _scorer_model


# ---------------------------------------------------------------------------
# Fonctions publiques
# ---------------------------------------------------------------------------

def compute_composite_score(features: dict) -> float:
    """
    Calculer le score composite (0-100) pour un site minier a partir
    de ses features contextuelles.

    Parametres
    ----------
    features : dict
        Dictionnaire contenant les 8 features MVP :
        - confidence_ai (float, 0-1)
        - distance_forest_m (float, metres)
        - distance_water_m (float, metres)
        - area_ha (float, hectares)
        - is_protected_zone (int/bool, 0 ou 1)
        - historical_activity_count (int)
        - accessibility_score (float, 0-1)
        - elevation_m (float, metres)

    Retourne
    --------
    score : float
        Score composite dans [0, 100].
    """
    model = _load_scorer_model()

    # Construire le vecteur de features dans le bon ordre
    feature_values = []
    for feat_name in FEATURE_NAMES:
        value = features.get(feat_name)
        if value is None:
            # Valeurs par defaut pour les features manquantes
            defaults = {
                "confidence_ai": 0.5,
                "distance_forest_m": 1000.0,
                "distance_water_m": 2000.0,
                "area_ha": 1.0,
                "is_protected_zone": 0,
                "historical_activity_count": 0,
                "accessibility_score": 0.5,
                "elevation_m": 300.0,
            }
            value = defaults.get(feat_name, 0.0)
            logger.debug(
                f"Feature '{feat_name}' manquante, "
                f"valeur par defaut utilisee : {value}"
            )
        feature_values.append(float(value))

    # Prediction avec le modele LightGBM
    X_input = pd.DataFrame([feature_values], columns=FEATURE_NAMES)
    raw_score = float(model.predict(X_input)[0])

    # Clamper dans [0, 100]
    score = max(0.0, min(100.0, raw_score))

    logger.debug(
        f"Score composite calcule : {score:.2f} "
        f"(confidence_ai={features.get('confidence_ai', 'N/A')})"
    )

    return round(score, 2)


def assign_priority(score: float) -> str:
    """
    Assigner un niveau de priorite en fonction du score composite.

    Seuils :
        CRITICAL : score > 80
        HIGH     : 60 < score <= 80
        MEDIUM   : 40 < score <= 60
        LOW      : score <= 40

    Parametres
    ----------
    score : float
        Score composite (0-100).

    Retourne
    --------
    priority : str
        Niveau de priorite ("CRITICAL", "HIGH", "MEDIUM", "LOW").
    """
    if score > PRIORITY_THRESHOLDS["CRITICAL"]:
        return "CRITICAL"
    elif score > PRIORITY_THRESHOLDS["HIGH"]:
        return "HIGH"
    elif score > PRIORITY_THRESHOLDS["MEDIUM"]:
        return "MEDIUM"
    else:
        return "LOW"


def score_and_prioritize(features: dict) -> dict:
    """
    Calculer le score composite et assigner la priorite en une seule
    operation.

    Parametres
    ----------
    features : dict
        Features contextuelles du site.

    Retourne
    --------
    result : dict
        {
            "score": float (0-100),
            "priority": str,
            "features_used": dict
        }
    """
    score = compute_composite_score(features)
    priority = assign_priority(score)

    return {
        "score": score,
        "priority": priority,
        "features_used": {
            name: features.get(name) for name in FEATURE_NAMES
        },
    }


def batch_score(sites_features: list[dict]) -> list[dict]:
    """
    Calculer le score composite pour une liste de sites en batch.

    Parametres
    ----------
    sites_features : list[dict]
        Liste de dictionnaires de features.

    Retourne
    --------
    results : list[dict]
        Liste de resultats avec score et priorite.
    """
    model = _load_scorer_model()

    rows = []
    for features in sites_features:
        feature_values = []
        for feat_name in FEATURE_NAMES:
            value = features.get(feat_name, 0.0)
            feature_values.append(float(value) if value is not None else 0.0)
        rows.append(feature_values)

    X_batch = pd.DataFrame(rows, columns=FEATURE_NAMES)
    raw_scores = model.predict(X_batch)

    results = []
    for i, raw_score in enumerate(raw_scores):
        score = max(0.0, min(100.0, float(raw_score)))
        score = round(score, 2)
        results.append({
            "score": score,
            "priority": assign_priority(score),
            "features_used": {
                name: sites_features[i].get(name)
                for name in FEATURE_NAMES
            },
        })

    logger.info(
        f"Scoring batch termine : {len(results)} sites scores, "
        f"score moyen = {np.mean([r['score'] for r in results]):.1f}"
    )

    return results


# ---------------------------------------------------------------------------
# Point d'entree pour l'entrainement initial
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger.info("Entrainement initial du scorer composite")
    model = train_scorer_model()
    logger.info("Entrainement termine avec succes")

    # Test rapide
    test_features = {
        "confidence_ai": 0.92,
        "distance_forest_m": 150.0,
        "distance_water_m": 300.0,
        "area_ha": 5.2,
        "is_protected_zone": 1,
        "historical_activity_count": 7,
        "accessibility_score": 0.8,
        "elevation_m": 380.0,
    }
    result = score_and_prioritize(test_features)
    logger.info(f"Test de scoring : {result}")
