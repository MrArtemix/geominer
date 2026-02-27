"""
Moniteur de drift pour le modele MineSpot SegFormer.

Detecte le drift dans la distribution des scores de confiance IA
en comparant les 100 derniers sites detectes a une baseline de reference.

Methode : Test de Kolmogorov-Smirnov (scipy.stats.ks_2samp)
Seuil d'alerte : p-value < 0.05
Orchestration : Prefect flow avec schedule hebdomadaire

Auteur : Ge O'Miner / MineSpot AI
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import numpy as np
from scipy.stats import ks_2samp

# Ajouter le chemin du backend pour les imports
PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_SRC = PROJECT_ROOT / "backend" / "minespotai-svc" / "src"
sys.path.insert(0, str(BACKEND_SRC))

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Seuil de p-value pour declencher une alerte de drift
DRIFT_P_VALUE_THRESHOLD = 0.05

# Nombre de sites recents a analyser
RECENT_SAMPLE_SIZE = 100

# Configuration MLflow
MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")
MLFLOW_EXPERIMENT_NAME = "Drift-Monitor"

# Configuration base de donnees
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://geominer:geominer_secret_2024@localhost:5432/geominerdb",
)

# Fichier de baseline (genere lors de la mise en production du modele)
BASELINE_PATH = PROJECT_ROOT / "ml" / "models" / "confidence_baseline.npy"


# ---------------------------------------------------------------------------
# Recuperation des donnees
# ---------------------------------------------------------------------------

def get_recent_confidence_scores(
    n_sites: int = RECENT_SAMPLE_SIZE,
    db_url: str | None = None,
) -> np.ndarray:
    """
    Recuperer les scores de confiance IA des N derniers sites detectes
    depuis la base de donnees PostgreSQL.

    Parametres
    ----------
    n_sites : int
        Nombre de sites recents a recuperer.
    db_url : str | None
        URL de connexion PostgreSQL. Utilise DATABASE_URL si None.

    Retourne
    --------
    scores : ndarray
        Tableau des scores de confiance (float, 0-1).
    """
    url = db_url or DATABASE_URL

    try:
        import psycopg2

        conn = psycopg2.connect(url)
        cursor = conn.cursor()

        query = """
            SELECT confidence_ai
            FROM mining_sites
            WHERE confidence_ai IS NOT NULL
            ORDER BY detected_at DESC
            LIMIT %s
        """
        cursor.execute(query, (n_sites,))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        if not rows:
            logger.warning("Aucun site avec score de confiance trouve en BDD")
            return np.array([])

        scores = np.array([float(row[0]) for row in rows])
        logger.info(
            f"{len(scores)} scores de confiance recuperes "
            f"(moyenne={scores.mean():.4f}, std={scores.std():.4f})"
        )
        return scores

    except ImportError:
        logger.warning(
            "psycopg2 non installe. Utilisation de donnees synthetiques."
        )
        return _generate_synthetic_recent_scores(n_sites)
    except Exception as e:
        logger.error(f"Erreur de connexion BDD : {e}")
        logger.info("Repli sur des donnees synthetiques")
        return _generate_synthetic_recent_scores(n_sites)


def _generate_synthetic_recent_scores(n_sites: int = 100) -> np.ndarray:
    """
    Generer des scores de confiance synthetiques simulant les N derniers
    sites detectes. Utilise comme repli si la BDD n'est pas disponible.
    """
    rng = np.random.RandomState(int(datetime.now().timestamp()) % (2**31))
    # Simuler une legere derive par rapport a la baseline
    scores = rng.beta(4.5, 2.0, n_sites)  # Legere derive vs baseline beta(5, 2)
    logger.info(
        f"Scores synthetiques generes : {n_sites} echantillons "
        f"(moyenne={scores.mean():.4f})"
    )
    return scores


def get_baseline_distribution() -> np.ndarray:
    """
    Charger la distribution de reference (baseline) des scores de confiance.

    Si le fichier de baseline n'existe pas, en creer un a partir d'une
    distribution synthetique representative du modele en production.

    Retourne
    --------
    baseline : ndarray
        Distribution de reference des scores de confiance.
    """
    if BASELINE_PATH.exists():
        baseline = np.load(BASELINE_PATH)
        logger.info(
            f"Baseline chargee depuis {BASELINE_PATH} : "
            f"{len(baseline)} echantillons "
            f"(moyenne={baseline.mean():.4f})"
        )
        return baseline

    # Creer une baseline synthetique si elle n'existe pas
    logger.warning(
        f"Fichier de baseline introuvable a {BASELINE_PATH}. "
        f"Creation d'une baseline synthetique."
    )
    baseline = _create_synthetic_baseline()
    return baseline


def _create_synthetic_baseline(n_samples: int = 500) -> np.ndarray:
    """
    Creer une baseline synthetique representant la distribution attendue
    des scores de confiance du modele en production.

    La distribution suit une Beta(5, 2) centree autour de 0.71,
    representative d'un modele SegFormer bien entraine.
    """
    rng = np.random.RandomState(42)
    # Beta(5, 2) : moyenne ≈ 0.71, biais vers les hauts scores
    baseline = rng.beta(5, 2, n_samples)

    # Sauvegarder pour les prochaines executions
    BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    np.save(BASELINE_PATH, baseline)
    logger.info(
        f"Baseline synthetique creee et sauvegardee : "
        f"{BASELINE_PATH} ({len(baseline)} echantillons)"
    )

    return baseline


# ---------------------------------------------------------------------------
# Test de drift Kolmogorov-Smirnov
# ---------------------------------------------------------------------------

def detect_drift(
    recent_scores: np.ndarray,
    baseline_scores: np.ndarray,
    p_value_threshold: float = DRIFT_P_VALUE_THRESHOLD,
) -> dict:
    """
    Detecter un drift dans la distribution des scores de confiance
    en utilisant le test de Kolmogorov-Smirnov a 2 echantillons.

    Le test KS compare la distribution cumulative des scores recents
    avec celle de la baseline. Un p-value < seuil indique un drift
    statistiquement significatif.

    Parametres
    ----------
    recent_scores : ndarray
        Scores de confiance des sites recents.
    baseline_scores : ndarray
        Scores de confiance de la distribution de reference.
    p_value_threshold : float
        Seuil de p-value pour declarer un drift (defaut 0.05).

    Retourne
    --------
    result : dict
        {
            "drift_detected": bool,
            "ks_statistic": float,
            "p_value": float,
            "recent_mean": float,
            "recent_std": float,
            "baseline_mean": float,
            "baseline_std": float,
            "sample_size_recent": int,
            "sample_size_baseline": int,
            "threshold": float,
        }
    """
    if len(recent_scores) < 10:
        logger.warning(
            f"Echantillon recent trop petit ({len(recent_scores)} < 10). "
            f"Le test KS ne sera pas fiable."
        )

    if len(baseline_scores) < 10:
        logger.warning(
            f"Baseline trop petite ({len(baseline_scores)} < 10). "
            f"Le test KS ne sera pas fiable."
        )

    # Test de Kolmogorov-Smirnov a 2 echantillons
    ks_stat, p_value = ks_2samp(recent_scores, baseline_scores)

    drift_detected = p_value < p_value_threshold

    result = {
        "drift_detected": drift_detected,
        "ks_statistic": round(float(ks_stat), 6),
        "p_value": round(float(p_value), 6),
        "recent_mean": round(float(recent_scores.mean()), 4),
        "recent_std": round(float(recent_scores.std()), 4),
        "baseline_mean": round(float(baseline_scores.mean()), 4),
        "baseline_std": round(float(baseline_scores.std()), 4),
        "sample_size_recent": len(recent_scores),
        "sample_size_baseline": len(baseline_scores),
        "threshold": p_value_threshold,
    }

    if drift_detected:
        logger.warning(
            f"DRIFT DETECTE ! KS={ks_stat:.4f}, p-value={p_value:.6f} "
            f"(seuil={p_value_threshold}). "
            f"Distribution recente (moy={recent_scores.mean():.4f}) "
            f"vs baseline (moy={baseline_scores.mean():.4f})"
        )
    else:
        logger.info(
            f"Pas de drift detecte. KS={ks_stat:.4f}, p-value={p_value:.6f} "
            f"(seuil={p_value_threshold})"
        )

    return result


# ---------------------------------------------------------------------------
# Logging des resultats dans MLflow
# ---------------------------------------------------------------------------

def log_drift_to_mlflow(drift_result: dict) -> None:
    """
    Enregistrer les resultats du test de drift dans un experiment MLflow.

    Cree un nouveau run dans l'experiment "Drift-Monitor" avec les
    metriques et parametres du test KS.

    Parametres
    ----------
    drift_result : dict
        Resultats du test de drift (sortie de detect_drift()).
    """
    try:
        import mlflow

        mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
        mlflow.set_experiment(MLFLOW_EXPERIMENT_NAME)

        with mlflow.start_run(
            run_name=f"drift-check-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}",
        ):
            # Metriques
            mlflow.log_metric("ks_statistic", drift_result["ks_statistic"])
            mlflow.log_metric("p_value", drift_result["p_value"])
            mlflow.log_metric("recent_mean", drift_result["recent_mean"])
            mlflow.log_metric("recent_std", drift_result["recent_std"])
            mlflow.log_metric("baseline_mean", drift_result["baseline_mean"])
            mlflow.log_metric("baseline_std", drift_result["baseline_std"])
            mlflow.log_metric(
                "drift_detected", 1.0 if drift_result["drift_detected"] else 0.0
            )

            # Parametres
            mlflow.log_param("threshold", drift_result["threshold"])
            mlflow.log_param("sample_size_recent", drift_result["sample_size_recent"])
            mlflow.log_param("sample_size_baseline", drift_result["sample_size_baseline"])
            mlflow.log_param(
                "timestamp", datetime.now(timezone.utc).isoformat()
            )

            # Tag d'alerte si drift detecte
            if drift_result["drift_detected"]:
                mlflow.set_tag("alert", "DRIFT_DETECTED")
                mlflow.set_tag("severity", "WARNING")
                logger.info(
                    "Alerte de drift enregistree dans MLflow "
                    f"(experiment: {MLFLOW_EXPERIMENT_NAME})"
                )
            else:
                mlflow.set_tag("alert", "NONE")
                mlflow.set_tag("severity", "INFO")

        logger.info(
            f"Resultats du test de drift enregistres dans MLflow "
            f"(experiment: {MLFLOW_EXPERIMENT_NAME})"
        )

    except ImportError:
        logger.warning(
            "MLflow non installe. Les resultats ne sont pas enregistres. "
            "Installez avec : pip install mlflow"
        )
    except Exception as e:
        logger.error(f"Erreur lors de l'enregistrement MLflow : {e}")


# ---------------------------------------------------------------------------
# Envoi de notification (extensible)
# ---------------------------------------------------------------------------

def send_drift_alert(drift_result: dict) -> None:
    """
    Envoyer une notification en cas de drift detecte.

    En production, cette fonction pourrait envoyer un email, un message
    Slack, ou une notification via webhook. Ici on log dans le journal.
    """
    if not drift_result["drift_detected"]:
        return

    alert_message = (
        f"[ALERTE DRIFT] MineSpot SegFormer - "
        f"Distribution de confiance IA modifiee !\n"
        f"  KS-statistic : {drift_result['ks_statistic']}\n"
        f"  p-value : {drift_result['p_value']}\n"
        f"  Moyenne recente : {drift_result['recent_mean']} "
        f"(baseline : {drift_result['baseline_mean']})\n"
        f"  Ecart-type recent : {drift_result['recent_std']} "
        f"(baseline : {drift_result['baseline_std']})\n"
        f"  Echantillons : {drift_result['sample_size_recent']} recents "
        f"vs {drift_result['sample_size_baseline']} baseline\n"
        f"  Action recommandee : re-entrainer le modele ou verifier "
        f"la qualite des images satellites recentes."
    )

    logger.critical(alert_message)

    # Extensible : ajouter ici les notifications Slack, email, etc.
    # Exemple : requests.post(SLACK_WEBHOOK_URL, json={"text": alert_message})


# ---------------------------------------------------------------------------
# Fonction principale d'analyse de drift
# ---------------------------------------------------------------------------

def run_drift_analysis(
    n_recent: int = RECENT_SAMPLE_SIZE,
    p_threshold: float = DRIFT_P_VALUE_THRESHOLD,
    db_url: str | None = None,
    log_to_mlflow: bool = True,
) -> dict:
    """
    Executer l'analyse complete de drift du modele.

    Pipeline :
        1. Recuperer les scores de confiance recents depuis la BDD
        2. Charger la distribution de reference (baseline)
        3. Executer le test de Kolmogorov-Smirnov
        4. Enregistrer les resultats dans MLflow
        5. Envoyer une alerte si drift detecte

    Parametres
    ----------
    n_recent : int
        Nombre de sites recents a analyser.
    p_threshold : float
        Seuil de p-value pour le drift.
    db_url : str | None
        URL de connexion PostgreSQL.
    log_to_mlflow : bool
        Si True, enregistrer les resultats dans MLflow.

    Retourne
    --------
    result : dict
        Resultats complets de l'analyse de drift.
    """
    logger.info("=" * 50)
    logger.info("Analyse de drift du modele MineSpot SegFormer")
    logger.info("=" * 50)

    # Etape 1 : Recuperer les scores recents
    logger.info(f"Etape 1/5 : Recuperation des {n_recent} derniers scores")
    recent_scores = get_recent_confidence_scores(
        n_sites=n_recent, db_url=db_url
    )

    if len(recent_scores) == 0:
        logger.warning("Aucun score recent disponible. Analyse annulee.")
        return {
            "drift_detected": False,
            "error": "Aucun score recent disponible",
        }

    # Etape 2 : Charger la baseline
    logger.info("Etape 2/5 : Chargement de la baseline")
    baseline_scores = get_baseline_distribution()

    # Etape 3 : Test KS
    logger.info("Etape 3/5 : Test de Kolmogorov-Smirnov")
    drift_result = detect_drift(
        recent_scores, baseline_scores, p_value_threshold=p_threshold
    )

    # Etape 4 : Log MLflow
    if log_to_mlflow:
        logger.info("Etape 4/5 : Enregistrement dans MLflow")
        log_drift_to_mlflow(drift_result)
    else:
        logger.info("Etape 4/5 : Log MLflow desactive")

    # Etape 5 : Notification
    logger.info("Etape 5/5 : Verification des alertes")
    send_drift_alert(drift_result)

    logger.info("Analyse de drift terminee")
    return drift_result


# ---------------------------------------------------------------------------
# Prefect flow avec schedule hebdomadaire
# ---------------------------------------------------------------------------

try:
    from prefect import flow, task
    from prefect.tasks import task_input_hash

    @task(
        name="recuperer-scores-recents",
        retries=2,
        retry_delay_seconds=30,
        cache_key_fn=task_input_hash,
        cache_expiration=timedelta(hours=1),
    )
    def task_get_recent_scores(n_sites: int = RECENT_SAMPLE_SIZE) -> np.ndarray:
        """Tache Prefect : recuperer les scores de confiance recents."""
        return get_recent_confidence_scores(n_sites=n_sites)

    @task(
        name="charger-baseline",
        retries=1,
    )
    def task_get_baseline() -> np.ndarray:
        """Tache Prefect : charger la distribution de reference."""
        return get_baseline_distribution()

    @task(name="test-kolmogorov-smirnov")
    def task_detect_drift(
        recent: np.ndarray,
        baseline: np.ndarray,
        threshold: float = DRIFT_P_VALUE_THRESHOLD,
    ) -> dict:
        """Tache Prefect : executer le test KS."""
        return detect_drift(recent, baseline, p_value_threshold=threshold)

    @task(name="log-mlflow")
    def task_log_mlflow(drift_result: dict) -> None:
        """Tache Prefect : enregistrer dans MLflow."""
        log_drift_to_mlflow(drift_result)

    @task(name="envoyer-alerte")
    def task_send_alert(drift_result: dict) -> None:
        """Tache Prefect : envoyer une alerte si drift detecte."""
        send_drift_alert(drift_result)

    @flow(
        name="drift_monitor",
        description=(
            "Moniteur hebdomadaire de drift du modele MineSpot SegFormer. "
            "Compare la distribution des scores de confiance recents "
            "a la baseline via le test de Kolmogorov-Smirnov."
        ),
        retries=1,
        retry_delay_seconds=300,
    )
    def drift_monitor_flow(
        n_recent: int = RECENT_SAMPLE_SIZE,
        p_threshold: float = DRIFT_P_VALUE_THRESHOLD,
    ) -> dict:
        """
        Flow Prefect pour le monitoring de drift hebdomadaire.

        Orchestration :
            1. Recuperer les scores de confiance recents (avec retry)
            2. Charger la baseline de reference
            3. Executer le test KS
            4. Enregistrer les resultats dans MLflow
            5. Envoyer une alerte si drift detecte
        """
        logger.info("Demarrage du flow Prefect de monitoring de drift")

        # Taches executees en sequence
        recent_scores = task_get_recent_scores(n_sites=n_recent)
        baseline_scores = task_get_baseline()

        # Test de drift
        drift_result = task_detect_drift(
            recent_scores, baseline_scores, threshold=p_threshold
        )

        # Actions post-test
        task_log_mlflow(drift_result)
        task_send_alert(drift_result)

        return drift_result

    logger.info(
        "Flow Prefect 'drift_monitor' enregistre. "
        "Deployer avec : prefect deployment build "
        "ml/experiments/monitor_drift.py:drift_monitor_flow "
        "--name drift-monitor-weekly "
        "--cron '0 6 * * 1' "  # Tous les lundis a 6h
        "--apply"
    )

except ImportError:
    logger.info(
        "Prefect non installe. Le flow de monitoring ne sera pas disponible. "
        "Pour activer le scheduling, installez : pip install prefect"
    )

    # Fonction de repli sans Prefect
    def drift_monitor_flow(
        n_recent: int = RECENT_SAMPLE_SIZE,
        p_threshold: float = DRIFT_P_VALUE_THRESHOLD,
    ) -> dict:
        """Version sans Prefect du flow de monitoring de drift."""
        return run_drift_analysis(
            n_recent=n_recent,
            p_threshold=p_threshold,
        )


# ---------------------------------------------------------------------------
# Point d'entree en ligne de commande
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Moniteur de drift du modele MineSpot SegFormer",
    )
    parser.add_argument(
        "--n-recent",
        type=int,
        default=RECENT_SAMPLE_SIZE,
        help=f"Nombre de sites recents (defaut: {RECENT_SAMPLE_SIZE})",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DRIFT_P_VALUE_THRESHOLD,
        help=f"Seuil de p-value (defaut: {DRIFT_P_VALUE_THRESHOLD})",
    )
    parser.add_argument(
        "--no-mlflow",
        action="store_true",
        help="Desactiver le logging MLflow",
    )
    parser.add_argument(
        "--use-prefect",
        action="store_true",
        help="Executer via le flow Prefect",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Activer les logs de debug",
    )

    args = parser.parse_args()

    # Configuration du logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    if args.use_prefect:
        result = drift_monitor_flow(
            n_recent=args.n_recent,
            p_threshold=args.threshold,
        )
    else:
        result = run_drift_analysis(
            n_recent=args.n_recent,
            p_threshold=args.threshold,
            log_to_mlflow=not args.no_mlflow,
        )

    # Afficher le resultat
    logger.info(f"Resultat final : {result}")

    # Code de sortie : 1 si drift detecte
    if result.get("drift_detected", False):
        logger.warning("DRIFT DETECTE — code de sortie 1")
        sys.exit(1)
    else:
        logger.info("Pas de drift — code de sortie 0")
        sys.exit(0)
