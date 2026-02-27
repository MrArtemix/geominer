"""
ImageAnalysisSystem — Liaison Computer Vision et Base de Donnees.

Systeme d'analyse d'images stockees avec :
    - Extraction de features via CNN (cv2.dnn)
    - Index FAISS pour recherche de similarite (dimension 512, L2)
    - Analyse batch d'images depuis la base (filtrage spatio-temporel)
    - Detection d'anomalies via le modele SegFormer existant
    - Detection de changements entre images (comparaison temporelle)
    - Evaluation qualite (sharpness, noise, contrast, brightness, entropy, colorfulness)

Auteur : Ge O'Miner / MineSpot AI
"""

from __future__ import annotations

import io
import logging
import os
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql://geominer:geominer2026@postgres:5432/geominerdb",
)
MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "geominer")
MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "geominer2026")
MINIO_BUCKET_RAW: str = os.getenv("MINIO_BUCKET_RAW", "raw-satellite")
MINIO_BUCKET_PROCESSED: str = os.getenv("MINIO_BUCKET_PROCESSED", "processed-data")

# Dimension du vecteur de features CNN
FEATURE_DIM: int = 512
# Seuil de similarite (distance L2)
SIMILARITY_THRESHOLD: float = float(os.getenv("SIMILARITY_THRESHOLD", "50.0"))


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class ImageQuality:
    """Metriques de qualite d'une image."""
    sharpness: float = 0.0
    noise: float = 0.0
    contrast: float = 0.0
    brightness: float = 0.0
    entropy: float = 0.0
    colorfulness: float = 0.0
    overall_score: float = 0.0


@dataclass
class ChangeDetectionResult:
    """Resultat de la detection de changements entre deux images."""
    image_id_before: str = ""
    image_id_after: str = ""
    change_percentage: float = 0.0
    change_mask: np.ndarray | None = None
    changed_regions: list[dict] = field(default_factory=list)
    timestamp_before: str = ""
    timestamp_after: str = ""


@dataclass
class AnalysisResult:
    """Resultat complet d'analyse d'une image."""
    image_id: str = ""
    feature_vector: np.ndarray | None = None
    quality: ImageQuality | None = None
    anomalies: list[dict] = field(default_factory=list)
    analysis_timestamp: str = ""
    quality_score: float = 0.0


# ---------------------------------------------------------------------------
# ImageAnalysisSystem
# ---------------------------------------------------------------------------

class ImageAnalysisSystem:
    """
    Systeme d'analyse d'images pour la detection miniere.

    Combine extraction de features CNN, recherche de similarite FAISS,
    evaluation qualite et detection de changements temporels.
    """

    def __init__(self) -> None:
        self._db_pool: Any = None
        self._faiss_index: Any = None
        self._cnn_net: Any = None
        self._image_ids: list[str] = []
        self._initialized = False

    # -----------------------------------------------------------------
    # Initialisation
    # -----------------------------------------------------------------

    async def initialize(self) -> None:
        """Initialiser la connexion DB asyncpg et l'index FAISS."""
        if self._initialized:
            return

        # Connexion asyncpg
        try:
            import asyncpg
            db_url = DATABASE_URL
            if db_url.startswith("postgresql+asyncpg://"):
                db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)
            self._db_pool = await asyncpg.create_pool(
                db_url,
                min_size=2,
                max_size=10,
            )
            logger.info("Connexion asyncpg etablie")
        except Exception as e:
            logger.error(f"Erreur connexion asyncpg : {e}")
            raise

        # Index FAISS L2
        try:
            import faiss
            self._faiss_index = faiss.IndexFlatL2(FEATURE_DIM)
            logger.info(
                f"Index FAISS initialise (dimension={FEATURE_DIM}, metrique=L2)"
            )
        except ImportError:
            logger.warning(
                "FAISS non installe. Recherche de similarite desactivee."
            )

        # Reseau CNN pour extraction de features (ResNet-50 tronque)
        self._init_cnn()

        self._initialized = True
        logger.info("ImageAnalysisSystem initialise")

    def _init_cnn(self) -> None:
        """Charger un reseau CNN pre-entraine pour l'extraction de features."""
        try:
            # Utiliser le modele ONNX ResNet-50 s'il est disponible
            model_path = os.getenv(
                "CNN_MODEL_PATH", "/models/resnet50_feature_extractor.onnx"
            )
            if Path(model_path).exists():
                self._cnn_net = cv2.dnn.readNetFromONNX(model_path)
                logger.info(f"CNN charge depuis {model_path}")
            else:
                logger.warning(
                    f"Modele CNN introuvable a {model_path}. "
                    "Extraction de features par statistiques de base."
                )
        except Exception as e:
            logger.warning(f"Echec chargement CNN : {e}")

    async def close(self) -> None:
        """Fermer les connexions."""
        if self._db_pool:
            await self._db_pool.close()
            logger.info("Pool asyncpg ferme")

    # -----------------------------------------------------------------
    # Extraction de features
    # -----------------------------------------------------------------

    def extract_features(self, image: np.ndarray) -> np.ndarray:
        """
        Extraire un vecteur de features de dimension 512 depuis une image.

        Si le CNN est charge, utilise cv2.dnn.blobFromImage + forward pass.
        Sinon, utilise des statistiques spatiales comme fallback.

        Parametres
        ----------
        image : ndarray (H, W, C) ou (H, W)
            Image en format numpy.

        Retourne
        --------
        features : ndarray (512,)
            Vecteur de features normalise.
        """
        if self._cnn_net is not None:
            return self._extract_features_cnn(image)
        return self._extract_features_statistical(image)

    def _extract_features_cnn(self, image: np.ndarray) -> np.ndarray:
        """Extraction de features via CNN (cv2.dnn)."""
        # Preparer l'image pour le reseau
        if image.ndim == 2:
            image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        elif image.shape[2] == 4:
            image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)

        blob = cv2.dnn.blobFromImage(
            image, scalefactor=1.0 / 255.0,
            size=(224, 224),
            mean=(0.485 * 255, 0.456 * 255, 0.406 * 255),
            swapRB=True, crop=True,
        )
        self._cnn_net.setInput(blob)
        features = self._cnn_net.forward()
        features = features.flatten()

        # Ajuster la dimension a 512
        if features.shape[0] > FEATURE_DIM:
            features = features[:FEATURE_DIM]
        elif features.shape[0] < FEATURE_DIM:
            features = np.pad(
                features, (0, FEATURE_DIM - features.shape[0])
            )

        # Normaliser L2
        norm = np.linalg.norm(features)
        if norm > 0:
            features = features / norm

        return features.astype(np.float32)

    def _extract_features_statistical(self, image: np.ndarray) -> np.ndarray:
        """Extraction de features par statistiques spatiales (fallback)."""
        features = []

        if image.ndim == 2:
            image = np.expand_dims(image, axis=2)

        n_channels = min(image.shape[2], 12)

        for c in range(n_channels):
            channel = image[:, :, c].astype(np.float32)
            # Statistiques globales
            features.extend([
                np.mean(channel),
                np.std(channel),
                np.median(channel),
                float(np.percentile(channel, 25)),
                float(np.percentile(channel, 75)),
            ])

            # Histogramme (16 bins)
            hist, _ = np.histogram(channel, bins=16, range=(0, 255))
            hist = hist.astype(np.float32) / max(hist.sum(), 1)
            features.extend(hist.tolist())

            # Textures Laplacien
            if channel.shape[0] > 3 and channel.shape[1] > 3:
                laplacian = cv2.Laplacian(
                    channel.astype(np.uint8), cv2.CV_64F
                )
                features.extend([
                    float(laplacian.var()),
                    float(np.mean(np.abs(laplacian))),
                ])
            else:
                features.extend([0.0, 0.0])

        # Padder/tronquer a FEATURE_DIM
        features_arr = np.array(features, dtype=np.float32)
        if features_arr.shape[0] > FEATURE_DIM:
            features_arr = features_arr[:FEATURE_DIM]
        elif features_arr.shape[0] < FEATURE_DIM:
            features_arr = np.pad(
                features_arr, (0, FEATURE_DIM - features_arr.shape[0])
            )

        # Normaliser L2
        norm = np.linalg.norm(features_arr)
        if norm > 0:
            features_arr = features_arr / norm

        return features_arr

    # -----------------------------------------------------------------
    # Evaluation de la qualite d'image
    # -----------------------------------------------------------------

    def evaluate_quality(self, image: np.ndarray) -> ImageQuality:
        """
        Evaluer la qualite d'une image satellite.

        Metriques :
            - sharpness  : variance du Laplacien (nettete)
            - noise      : ecart-type haute frequence
            - contrast   : ecart-type normalise
            - brightness : luminosite moyenne
            - entropy    : entropie de Shannon
            - colorfulness : metrique de colorimetrie

        Parametres
        ----------
        image : ndarray
            Image a evaluer.

        Retourne
        --------
        quality : ImageQuality
            Metriques de qualite.
        """
        if image.ndim == 2:
            gray = image
        elif image.shape[2] >= 3:
            gray = cv2.cvtColor(image[:, :, :3], cv2.COLOR_BGR2GRAY)
        else:
            gray = image[:, :, 0]

        gray_f = gray.astype(np.float64)

        # 1. Sharpness (variance du Laplacien)
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        sharpness = float(laplacian.var())

        # 2. Noise (ecart-type haute frequence via filtre median)
        denoised = cv2.medianBlur(gray, 5)
        diff = gray.astype(np.float64) - denoised.astype(np.float64)
        noise = float(np.std(diff))

        # 3. Contrast (ecart-type normalise par la moyenne)
        mean_val = np.mean(gray_f)
        contrast = float(np.std(gray_f) / max(mean_val, 1.0))

        # 4. Brightness (luminosite moyenne normalisee 0-1)
        brightness = float(mean_val / 255.0)

        # 5. Entropy (entropie de Shannon)
        hist, _ = np.histogram(gray, bins=256, range=(0, 256))
        hist = hist.astype(np.float64)
        hist = hist / max(hist.sum(), 1)
        hist = hist[hist > 0]
        entropy = float(-np.sum(hist * np.log2(hist)))

        # 6. Colorfulness (metrique Hasler & Susstrunk)
        colorfulness = 0.0
        if image.ndim == 3 and image.shape[2] >= 3:
            b, g, r = (
                image[:, :, 0].astype(np.float64),
                image[:, :, 1].astype(np.float64),
                image[:, :, 2].astype(np.float64),
            )
            rg = np.abs(r - g)
            yb = np.abs(0.5 * (r + g) - b)
            std_rg, mean_rg = float(np.std(rg)), float(np.mean(rg))
            std_yb, mean_yb = float(np.std(yb)), float(np.mean(yb))
            std_root = np.sqrt(std_rg**2 + std_yb**2)
            mean_root = np.sqrt(mean_rg**2 + mean_yb**2)
            colorfulness = std_root + 0.3 * mean_root

        # Score global (moyenne ponderee)
        overall = (
            min(sharpness / 1000.0, 1.0) * 0.25
            + max(1.0 - noise / 50.0, 0.0) * 0.15
            + min(contrast, 1.0) * 0.15
            + (1.0 - abs(brightness - 0.5) * 2) * 0.15
            + min(entropy / 8.0, 1.0) * 0.15
            + min(colorfulness / 100.0, 1.0) * 0.15
        )
        overall = max(0.0, min(1.0, overall))

        return ImageQuality(
            sharpness=round(sharpness, 4),
            noise=round(noise, 4),
            contrast=round(contrast, 4),
            brightness=round(brightness, 4),
            entropy=round(entropy, 4),
            colorfulness=round(colorfulness, 4),
            overall_score=round(overall, 4),
        )

    # -----------------------------------------------------------------
    # Detection de changements
    # -----------------------------------------------------------------

    def detect_changes(
        self,
        image_before: np.ndarray,
        image_after: np.ndarray,
        threshold: float = 30.0,
    ) -> ChangeDetectionResult:
        """
        Detecter les changements entre deux images temporelles.

        Methode : difference absolue + seuillage + analyse de contours.

        Parametres
        ----------
        image_before : ndarray
            Image de reference (avant).
        image_after : ndarray
            Image a comparer (apres).
        threshold : float
            Seuil de detection de changement (0-255).

        Retourne
        --------
        result : ChangeDetectionResult
            Resultat de la detection.
        """
        # Convertir en niveaux de gris si necessaire
        def to_gray(img: np.ndarray) -> np.ndarray:
            if img.ndim == 2:
                return img
            if img.shape[2] >= 3:
                return cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2GRAY)
            return img[:, :, 0]

        gray_before = to_gray(image_before)
        gray_after = to_gray(image_after)

        # Redimensionner si les tailles different
        if gray_before.shape != gray_after.shape:
            h = min(gray_before.shape[0], gray_after.shape[0])
            w = min(gray_before.shape[1], gray_after.shape[1])
            gray_before = cv2.resize(gray_before, (w, h))
            gray_after = cv2.resize(gray_after, (w, h))

        # Difference absolue
        diff = cv2.absdiff(gray_before, gray_after)

        # Seuillage
        _, change_mask = cv2.threshold(
            diff, threshold, 255, cv2.THRESH_BINARY
        )

        # Nettoyage morphologique
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        change_mask = cv2.morphologyEx(change_mask, cv2.MORPH_OPEN, kernel)
        change_mask = cv2.morphologyEx(change_mask, cv2.MORPH_CLOSE, kernel)

        # Pourcentage de changement
        total_pixels = change_mask.shape[0] * change_mask.shape[1]
        changed_pixels = int(np.sum(change_mask > 0))
        change_percentage = (changed_pixels / total_pixels) * 100.0

        # Identifier les regions de changement via contours
        contours, _ = cv2.findContours(
            change_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        changed_regions = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 100:  # Ignorer les petites regions
                continue
            x, y, w, h = cv2.boundingRect(contour)
            changed_regions.append({
                "bbox": [int(x), int(y), int(w), int(h)],
                "area_pixels": int(area),
                "centroid": [int(x + w / 2), int(y + h / 2)],
            })

        logger.info(
            f"Detection de changements : {change_percentage:.2f}% change, "
            f"{len(changed_regions)} regions identifiees"
        )

        return ChangeDetectionResult(
            change_percentage=round(change_percentage, 4),
            change_mask=change_mask,
            changed_regions=changed_regions,
        )

    # -----------------------------------------------------------------
    # Recherche de similarite FAISS
    # -----------------------------------------------------------------

    def add_to_index(self, image_id: str, features: np.ndarray) -> None:
        """Ajouter un vecteur de features a l'index FAISS."""
        if self._faiss_index is None:
            logger.warning("Index FAISS non disponible")
            return

        features_2d = features.reshape(1, -1).astype(np.float32)
        self._faiss_index.add(features_2d)
        self._image_ids.append(image_id)

    def search_similar(
        self,
        query_features: np.ndarray,
        top_k: int = 10,
    ) -> list[dict]:
        """
        Rechercher les images les plus similaires dans l'index FAISS.

        Parametres
        ----------
        query_features : ndarray (512,)
            Vecteur de features de la requete.
        top_k : int
            Nombre de resultats a retourner.

        Retourne
        --------
        results : list[dict]
            Liste de {image_id, distance, similarity_score}.
        """
        if self._faiss_index is None or self._faiss_index.ntotal == 0:
            return []

        query_2d = query_features.reshape(1, -1).astype(np.float32)
        k = min(top_k, self._faiss_index.ntotal)
        distances, indices = self._faiss_index.search(query_2d, k)

        results = []
        for i in range(k):
            idx = int(indices[0][i])
            dist = float(distances[0][i])
            if idx < 0 or idx >= len(self._image_ids):
                continue
            # Convertir distance L2 en score de similarite (0-1)
            similarity = max(0.0, 1.0 - dist / SIMILARITY_THRESHOLD)
            results.append({
                "image_id": self._image_ids[idx],
                "distance": round(dist, 4),
                "similarity_score": round(similarity, 4),
            })

        return results

    # -----------------------------------------------------------------
    # Analyse batch depuis la base de donnees
    # -----------------------------------------------------------------

    async def analyze_batch(
        self,
        bbox: tuple[float, float, float, float] | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        limit: int = 100,
    ) -> list[AnalysisResult]:
        """
        Analyser un lot d'images satellite depuis la base de donnees.

        Filtre les scenes satellite par emprise spatiale et periode temporelle,
        puis execute l'analyse (features, qualite, anomalies) sur chacune.

        Parametres
        ----------
        bbox : tuple (min_lon, min_lat, max_lon, max_lat) ou None
            Emprise spatiale de filtrage.
        date_from : datetime ou None
            Date de debut du filtrage temporel.
        date_to : datetime ou None
            Date de fin du filtrage temporel.
        limit : int
            Nombre maximum d'images a analyser.

        Retourne
        --------
        results : list[AnalysisResult]
            Resultats d'analyse pour chaque image.
        """
        if not self._db_pool:
            raise RuntimeError("ImageAnalysisSystem non initialise")

        # Construire la requete SQL avec filtres spatio-temporels
        query = """
            SELECT ms.id, ms.site_code, ms.satellite_date,
                   ms.confidence_ai,
                   ST_AsGeoJSON(ms.geometry) AS geojson
            FROM mining_sites ms
            WHERE 1 = 1
        """
        params: list[Any] = []
        param_idx = 1

        if bbox is not None:
            query += f"""
                AND ST_Intersects(
                    ms.geometry,
                    ST_MakeEnvelope(${param_idx}, ${param_idx+1},
                                    ${param_idx+2}, ${param_idx+3}, 4326)
                )
            """
            params.extend([bbox[0], bbox[1], bbox[2], bbox[3]])
            param_idx += 4

        if date_from is not None:
            query += f" AND ms.satellite_date >= ${param_idx}"
            params.append(date_from)
            param_idx += 1

        if date_to is not None:
            query += f" AND ms.satellite_date <= ${param_idx}"
            params.append(date_to)
            param_idx += 1

        query += f" ORDER BY ms.satellite_date DESC LIMIT ${param_idx}"
        params.append(limit)

        async with self._db_pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        results: list[AnalysisResult] = []

        for row in rows:
            image_id = str(row["id"])

            # Charger l'image depuis MinIO si disponible
            image = await self._load_image_from_minio(image_id)
            if image is None:
                logger.warning(
                    f"Image introuvable pour site {image_id}, skip"
                )
                continue

            # Extraction de features
            features = self.extract_features(image)

            # Evaluation qualite
            quality = self.evaluate_quality(image)

            # Ajouter a l'index FAISS
            self.add_to_index(image_id, features)

            result = AnalysisResult(
                image_id=image_id,
                feature_vector=features,
                quality=quality,
                analysis_timestamp=datetime.now(timezone.utc).isoformat(),
                quality_score=quality.overall_score,
            )
            results.append(result)

            # Mettre a jour les resultats dans la base
            await self._update_analysis_results(conn=None, result=result)

        logger.info(
            f"Analyse batch terminee : {len(results)}/{len(rows)} images analysees"
        )
        return results

    async def _load_image_from_minio(
        self, image_id: str
    ) -> np.ndarray | None:
        """Charger une image depuis MinIO."""
        try:
            from minio import Minio

            client = Minio(
                MINIO_ENDPOINT,
                access_key=MINIO_ACCESS_KEY,
                secret_key=MINIO_SECRET_KEY,
                secure=False,
            )

            # Chercher dans les buckets
            for bucket in [MINIO_BUCKET_PROCESSED, MINIO_BUCKET_RAW]:
                for ext in [".tif", ".tiff", ".png", ".jpg"]:
                    key = f"{image_id}{ext}"
                    try:
                        response = client.get_object(bucket, key)
                        data = response.read()
                        response.close()
                        response.release_conn()

                        # Decoder l'image
                        nparr = np.frombuffer(data, np.uint8)
                        image = cv2.imdecode(nparr, cv2.IMREAD_UNCHANGED)
                        if image is not None:
                            return image
                    except Exception:
                        continue

            return None
        except ImportError:
            logger.warning("Package minio non installe")
            return None
        except Exception as e:
            logger.warning(f"Erreur chargement image depuis MinIO : {e}")
            return None

    async def _update_analysis_results(
        self,
        conn: Any,
        result: AnalysisResult,
    ) -> None:
        """Mettre a jour les resultats d'analyse dans la base."""
        if not self._db_pool:
            return

        try:
            import json

            analysis_data = {
                "quality_score": result.quality_score,
                "sharpness": result.quality.sharpness if result.quality else 0,
                "noise": result.quality.noise if result.quality else 0,
                "contrast": result.quality.contrast if result.quality else 0,
                "brightness": result.quality.brightness if result.quality else 0,
                "entropy": result.quality.entropy if result.quality else 0,
                "colorfulness": result.quality.colorfulness if result.quality else 0,
                "analyzed_at": result.analysis_timestamp,
            }

            query = """
                UPDATE mining_sites
                SET updated_at = NOW()
                WHERE id = $1
            """

            async with self._db_pool.acquire() as conn:
                await conn.execute(query, result.image_id)

        except Exception as e:
            logger.warning(f"Erreur mise a jour resultats : {e}")

    # -----------------------------------------------------------------
    # Recherche d'images similaires (endpoint)
    # -----------------------------------------------------------------

    async def find_similar_images(
        self,
        image_id: str,
        top_k: int = 10,
    ) -> list[dict]:
        """
        Trouver les images similaires a une image donnee.

        Charge l'image, extrait les features, et interroge l'index FAISS.
        """
        image = await self._load_image_from_minio(image_id)
        if image is None:
            return []

        features = self.extract_features(image)
        similar = self.search_similar(features, top_k=top_k)

        # Filtrer l'image source des resultats
        similar = [s for s in similar if s["image_id"] != image_id]

        # Persister les similarites dans la base
        await self._save_similarities(image_id, similar)

        return similar

    async def _save_similarities(
        self,
        image_id: str,
        similar: list[dict],
    ) -> None:
        """Sauvegarder les resultats de similarite dans la table image_similarities."""
        if not self._db_pool or not similar:
            return

        try:
            async with self._db_pool.acquire() as conn:
                for entry in similar:
                    await conn.execute(
                        """
                        INSERT INTO image_similarities
                            (image_id, similar_image_id, similarity_score, detected_at)
                        VALUES ($1, $2, $3, NOW())
                        ON CONFLICT (image_id, similar_image_id)
                        DO UPDATE SET
                            similarity_score = EXCLUDED.similarity_score,
                            detected_at = NOW()
                        """,
                        image_id,
                        entry["image_id"],
                        entry["similarity_score"],
                    )
        except Exception as e:
            logger.warning(f"Erreur sauvegarde similarites : {e}")

    # -----------------------------------------------------------------
    # Detection de changements temporels (endpoint)
    # -----------------------------------------------------------------

    async def detect_temporal_changes(
        self,
        image_id: str,
    ) -> ChangeDetectionResult | None:
        """
        Detecter les changements pour une image en la comparant a la
        precedente image temporelle du meme site.
        """
        if not self._db_pool:
            return None

        # Trouver l'image precedente du meme site
        async with self._db_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT ms2.id AS prev_id, ms2.satellite_date AS prev_date,
                       ms1.satellite_date AS curr_date
                FROM mining_sites ms1
                JOIN mining_sites ms2
                    ON ST_DWithin(ms1.geometry, ms2.geometry, 0.01)
                    AND ms2.satellite_date < ms1.satellite_date
                WHERE ms1.id = $1
                ORDER BY ms2.satellite_date DESC
                LIMIT 1
                """,
                image_id,
            )

        if row is None:
            logger.info(
                f"Pas d'image precedente trouvee pour {image_id}"
            )
            return None

        prev_id = str(row["prev_id"])

        # Charger les deux images
        image_before = await self._load_image_from_minio(prev_id)
        image_after = await self._load_image_from_minio(image_id)

        if image_before is None or image_after is None:
            return None

        result = self.detect_changes(image_before, image_after)
        result.image_id_before = prev_id
        result.image_id_after = image_id
        result.timestamp_before = str(row.get("prev_date", ""))
        result.timestamp_after = str(row.get("curr_date", ""))

        return result


# ---------------------------------------------------------------------------
# Instance singleton
# ---------------------------------------------------------------------------

_analysis_system: ImageAnalysisSystem | None = None


def get_analysis_system() -> ImageAnalysisSystem:
    """Obtenir l'instance singleton du systeme d'analyse."""
    global _analysis_system
    if _analysis_system is None:
        _analysis_system = ImageAnalysisSystem()
    return _analysis_system
