"""
ModelManager — Gestionnaire singleton du modele SegFormer en production.

Responsabilites :
    - Charger le modele depuis MLflow Model Registry (stage=Production)
    - Swap atomique du modele sans interruption de service
    - Exposer les metadonnees du modele en cours

Auteur : Ge O'Miner / MineSpot AI
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import torch

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MLFLOW_TRACKING_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")
MLFLOW_MODEL_NAME = os.getenv("MLFLOW_MODEL_NAME", "MineSpotSegFormer")
MLFLOW_MODEL_STAGE = os.getenv("MLFLOW_MODEL_STAGE", "Production")
FALLBACK_WEIGHTS_PATH = os.getenv(
    "MINESPOT_WEIGHTS_PATH", "/models/best_f1.pth"
)
DEVICE = os.getenv(
    "MINESPOT_DEVICE", "cuda" if torch.cuda.is_available() else "cpu"
)


# ---------------------------------------------------------------------------
# Dataclass pour les informations du modele
# ---------------------------------------------------------------------------

@dataclass
class ModelInfo:
    """Metadonnees du modele actuellement charge."""
    version: str = "unknown"
    run_id: str = "unknown"
    f1_score: float = 0.0
    loaded_at: str = ""
    source: str = "unknown"  # "mlflow" ou "filesystem"
    stage: str = "unknown"
    weights_path: str = ""
    device: str = "cpu"


# ---------------------------------------------------------------------------
# ModelManager Singleton
# ---------------------------------------------------------------------------

class ModelManager:
    """
    Gestionnaire singleton pour le modele MineSpot SegFormer.

    Charge le modele depuis MLflow Model Registry si disponible,
    sinon utilise un fichier de poids local en repli.

    Utilisation :
        manager = ModelManager.get_instance()
        model = manager.get_model()
        info = manager.get_model_info()
    """

    _instance: Optional[ModelManager] = None
    _instance_lock = threading.Lock()

    def __init__(self) -> None:
        """Initialisation privee — utiliser get_instance() a la place."""
        self._model: Any = None
        self._model_info: ModelInfo = ModelInfo()
        self._model_lock = threading.Lock()
        self._initialized = False

    @classmethod
    def get_instance(cls) -> ModelManager:
        """
        Obtenir l'instance unique du ModelManager (pattern Singleton
        thread-safe avec double-checked locking).
        """
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reinitialiser le singleton (utile pour les tests)."""
        with cls._instance_lock:
            cls._instance = None

    # -----------------------------------------------------------------
    # Chargement du modele
    # -----------------------------------------------------------------

    def load_model(self) -> None:
        """
        Charger le modele depuis MLflow Model Registry (stage=Production).

        Si MLflow n'est pas disponible ou si le modele n'existe pas dans le
        registry, repli sur le fichier de poids local.
        """
        logger.info(
            f"Tentative de chargement du modele '{MLFLOW_MODEL_NAME}' "
            f"(stage={MLFLOW_MODEL_STAGE}) depuis MLflow"
        )

        # Tentative 1 : Charger depuis MLflow
        loaded = self._load_from_mlflow()

        # Tentative 2 : Repli sur le systeme de fichiers
        if not loaded:
            loaded = self._load_from_filesystem()

        if not loaded:
            logger.error(
                "Impossible de charger le modele depuis MLflow "
                "ou le systeme de fichiers. Le service demarrera "
                "sans modele (mode degradation gracieuse)."
            )
            return

        self._initialized = True
        logger.info(
            f"Modele charge avec succes : "
            f"version={self._model_info.version}, "
            f"source={self._model_info.source}, "
            f"device={self._model_info.device}"
        )

    def _load_from_mlflow(self) -> bool:
        """
        Charger le modele depuis MLflow Model Registry.

        Retourne True si le chargement a reussi, False sinon.
        """
        try:
            import mlflow
            import mlflow.pytorch

            mlflow.set_tracking_uri(MLFLOW_TRACKING_URI)
            client = mlflow.tracking.MlflowClient()

            # Rechercher la derniere version au stage Production
            model_versions = client.get_latest_versions(
                name=MLFLOW_MODEL_NAME,
                stages=[MLFLOW_MODEL_STAGE],
            )

            if not model_versions:
                logger.warning(
                    f"Aucune version du modele '{MLFLOW_MODEL_NAME}' "
                    f"trouvee au stage '{MLFLOW_MODEL_STAGE}' dans MLflow"
                )
                return False

            latest_version = model_versions[0]
            logger.info(
                f"Version MLflow trouvee : v{latest_version.version} "
                f"(run_id={latest_version.run_id})"
            )

            # Charger le modele PyTorch depuis MLflow
            model_uri = f"models:/{MLFLOW_MODEL_NAME}/{MLFLOW_MODEL_STAGE}"
            model = mlflow.pytorch.load_model(model_uri, map_location=DEVICE)
            model.to(DEVICE)
            model.eval()

            # Rechauffement du modele
            self._warmup_model(model)

            # Recuperer le F1 score depuis les metriques du run
            f1_score = 0.0
            try:
                run = client.get_run(latest_version.run_id)
                f1_score = run.data.metrics.get("best_val_f1", 0.0)
            except Exception as e:
                logger.warning(
                    f"Impossible de recuperer le F1 score du run : {e}"
                )

            # Swap atomique du modele
            with self._model_lock:
                self._model = model
                self._model_info = ModelInfo(
                    version=str(latest_version.version),
                    run_id=latest_version.run_id,
                    f1_score=f1_score,
                    loaded_at=datetime.now(timezone.utc).isoformat(),
                    source="mlflow",
                    stage=MLFLOW_MODEL_STAGE,
                    weights_path=model_uri,
                    device=DEVICE,
                )

            return True

        except ImportError:
            logger.info("MLflow non installe, repli sur le systeme de fichiers")
            return False
        except Exception as e:
            logger.warning(f"Echec du chargement MLflow : {e}")
            return False

    def _load_from_filesystem(self) -> bool:
        """
        Charger le modele depuis un fichier de poids local.

        Retourne True si le chargement a reussi, False sinon.
        """
        weights_path = Path(FALLBACK_WEIGHTS_PATH)

        if not weights_path.exists():
            logger.warning(
                f"Fichier de poids introuvable : {weights_path}"
            )
            return False

        try:
            from models.minespot_segformer import (
                MineSpotSegFormer,
                load_model as load_segformer,
                warmup_model,
            )

            logger.info(
                f"Chargement du modele depuis le fichier {weights_path}"
            )
            model = load_segformer(str(weights_path), device=DEVICE)
            warmup_model(model, device=DEVICE)

            # Swap atomique
            with self._model_lock:
                self._model = model
                self._model_info = ModelInfo(
                    version="local",
                    run_id="filesystem",
                    f1_score=0.0,
                    loaded_at=datetime.now(timezone.utc).isoformat(),
                    source="filesystem",
                    stage="local",
                    weights_path=str(weights_path),
                    device=DEVICE,
                )

            return True

        except Exception as e:
            logger.error(
                f"Echec du chargement depuis le fichier : {e}"
            )
            return False

    def _warmup_model(self, model: Any) -> None:
        """Prechauffer le modele avec un forward pass fictif."""
        try:
            dummy = torch.randn(1, 12, 256, 256, device=DEVICE)
            with torch.no_grad():
                model(dummy)
            logger.debug("Prechauffement du modele termine")
        except Exception as e:
            logger.warning(f"Echec du prechauffement : {e}")

    # -----------------------------------------------------------------
    # Rechargement a chaud (swap atomique)
    # -----------------------------------------------------------------

    def reload_model(self) -> dict:
        """
        Recharger le modele depuis MLflow ou le filesystem.

        Le swap est atomique : l'ancien modele continue a servir les
        requetes pendant le chargement du nouveau. Le remplacement
        de la reference se fait sous verrou.

        Retourne
        --------
        result : dict
            Informations sur le rechargement effectue.
        """
        logger.info("Rechargement du modele demande")
        start_time = time.time()

        # Sauvegarder l'ancienne info pour le log
        old_info = self._model_info

        # Tenter de charger depuis MLflow d'abord
        loaded = self._load_from_mlflow()
        if not loaded:
            loaded = self._load_from_filesystem()

        elapsed = time.time() - start_time

        if loaded:
            logger.info(
                f"Modele recharge avec succes en {elapsed:.2f}s : "
                f"v{old_info.version} → v{self._model_info.version}"
            )
            return {
                "status": "succes",
                "previous_version": old_info.version,
                "new_version": self._model_info.version,
                "source": self._model_info.source,
                "duration_s": round(elapsed, 2),
            }
        else:
            logger.error(
                f"Echec du rechargement apres {elapsed:.2f}s. "
                f"L'ancien modele v{old_info.version} est conserve."
            )
            return {
                "status": "echec",
                "message": "Impossible de recharger le modele",
                "current_version": old_info.version,
                "duration_s": round(elapsed, 2),
            }

    # -----------------------------------------------------------------
    # Accesseurs
    # -----------------------------------------------------------------

    def get_model(self) -> Any:
        """
        Obtenir le modele actuellement charge.

        Retourne
        --------
        model : MineSpotSegFormer
            Modele en mode eval sur le bon device.

        Raises
        ------
        RuntimeError
            Si aucun modele n'est charge.
        """
        with self._model_lock:
            if self._model is None:
                raise RuntimeError(
                    "Aucun modele charge. Appelez load_model() d'abord."
                )
            return self._model

    def get_model_info(self) -> dict:
        """
        Obtenir les metadonnees du modele actuellement charge.

        Retourne
        --------
        info : dict
            {
                "version": str,
                "run_id": str,
                "f1_score": float,
                "loaded_at": str (ISO 8601),
                "source": str,
                "stage": str,
                "device": str,
            }
        """
        with self._model_lock:
            return {
                "version": self._model_info.version,
                "run_id": self._model_info.run_id,
                "f1_score": self._model_info.f1_score,
                "loaded_at": self._model_info.loaded_at,
                "source": self._model_info.source,
                "stage": self._model_info.stage,
                "device": self._model_info.device,
                "is_loaded": self._model is not None,
            }

    @property
    def is_loaded(self) -> bool:
        """Verifier si un modele est actuellement charge."""
        return self._model is not None

    @property
    def is_initialized(self) -> bool:
        """Verifier si le manager a ete initialise."""
        return self._initialized
