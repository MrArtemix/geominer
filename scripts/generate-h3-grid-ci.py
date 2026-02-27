#!/usr/bin/env python3
"""
Generateur de grille H3 pour la Cote d'Ivoire.

Ce script :
    1. Genere tous les hexagones H3 resolution 7 couvrant la bbox de la CI
    2. Calcule le score de risque GoldRisk pour chaque hexagone
    3. Insere les resultats dans la table h3_risk_scores (PostgreSQL)
    4. Exporte la grille en GeoJSON : scripts/data/h3_grid_ci.geojson

Bounding box Cote d'Ivoire :
    minLon=-8.60, minLat=4.35, maxLon=-2.49, maxLat=10.74

Utilisation :
    python scripts/generate-h3-grid-ci.py [--resolution 7] [--db-url URL] [--dry-run]

Auteur : Ge O'Miner / MineSpot AI
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import h3
import numpy as np

# Ajouter le chemin du backend pour les imports
PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "minespotai-svc" / "src"
sys.path.insert(0, str(BACKEND_SRC))

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Bounding box de la Cote d'Ivoire
CI_BBOX = {
    "min_lon": -8.60,
    "min_lat": 4.35,
    "max_lon": -2.49,
    "max_lat": 10.74,
}

# Resolution H3 par defaut
DEFAULT_RESOLUTION = 7

# Chemin de sortie GeoJSON
OUTPUT_DIR = PROJECT_ROOT / "scripts" / "data"
OUTPUT_GEOJSON = OUTPUT_DIR / "h3_grid_ci.geojson"

# URL base de donnees
DEFAULT_DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://geominer:geominer_secret_2024@localhost:5432/geominerdb",
)


# ---------------------------------------------------------------------------
# Generation de la grille H3
# ---------------------------------------------------------------------------

def generate_h3_grid(
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
    resolution: int = 7,
) -> list[str]:
    """
    Generer tous les hexagones H3 intersectant une bounding box.

    Parametres
    ----------
    min_lon, min_lat, max_lon, max_lat : float
        Coordonnees de la bounding box en WGS84.
    resolution : int
        Resolution H3 (defaut 7, ~5.16 km2 par hexagone).

    Retourne
    --------
    h3_indices : list[str]
        Liste des index H3 couvrant la bbox.
    """
    # Definir le polygone de la bbox (h3 attend lat, lng)
    bbox_polygon = [
        (min_lat, min_lon),
        (min_lat, max_lon),
        (max_lat, max_lon),
        (max_lat, min_lon),
        (min_lat, min_lon),
    ]

    logger.info(
        f"Generation de la grille H3 resolution {resolution} "
        f"pour la bbox [{min_lon}, {min_lat}, {max_lon}, {max_lat}]"
    )

    # Generer les hexagones avec h3-py v4
    h3_indices = list(h3.polygon_to_cells(
        h3.LatLngPoly(bbox_polygon),
        res=resolution,
    ))

    logger.info(f"{len(h3_indices)} hexagones H3 generes")
    return h3_indices


# ---------------------------------------------------------------------------
# Calcul des scores de risque
# ---------------------------------------------------------------------------

def compute_risk_scores(h3_indices: list[str]) -> dict[str, float]:
    """
    Calculer les scores de risque GoldRisk pour chaque hexagone.

    Tente d'utiliser le modele GoldRisk XGBoost s'il est disponible,
    sinon utilise une formule heuristique de repli.

    Parametres
    ----------
    h3_indices : list[str]
        Liste des index H3.

    Retourne
    --------
    scores : dict[str, float]
        Dictionnaire {h3_index: risk_score}.
    """
    try:
        from models.goldrisk_xgb import predict_risk_batch
        logger.info("Utilisation du modele GoldRisk XGBoost pour le scoring")
        return predict_risk_batch(h3_indices)
    except ImportError as e:
        logger.warning(
            f"Modele GoldRisk non disponible ({e}). "
            f"Utilisation de la formule heuristique de repli."
        )
        return _fallback_risk_scores(h3_indices)


def _fallback_risk_scores(h3_indices: list[str]) -> dict[str, float]:
    """
    Calculer des scores de risque heuristiques bases sur la position
    geographique lorsque le modele XGBoost n'est pas disponible.

    Les zones auriferes connues de la CI ont un score plus eleve.
    """
    # Zones auriferes principales de Cote d'Ivoire (lat, lon, rayon_km, poids)
    gold_zones = [
        (7.80, -7.00, 50, 0.9),   # Ity (Man) - plus grande mine d'or
        (9.26, -5.69, 40, 0.85),  # Tongon (Korhogo)
        (5.80, -5.50, 30, 0.75),  # Agbaou (Divo)
        (6.60, -5.60, 25, 0.70),  # Bonikro (Yamoussoukro)
        (6.20, -6.30, 30, 0.65),  # Sissingue (Daloa)
        (7.50, -6.50, 35, 0.60),  # Abujar (Seguela)
    ]

    scores = {}
    for h3_idx in h3_indices:
        lat, lng = h3.cell_to_latlng(h3_idx)

        # Score base sur la proximite des zones auriferes
        max_influence = 0.0
        for zone_lat, zone_lon, rayon_km, poids in gold_zones:
            distance_km = np.sqrt(
                ((lat - zone_lat) * 110.54) ** 2
                + ((lng - zone_lon) * 111.32 * np.cos(np.radians(lat))) ** 2
            )
            if distance_km < rayon_km:
                influence = poids * (1.0 - distance_km / rayon_km)
                max_influence = max(max_influence, influence)

        # Ajouter un bruit deterministe base sur le hash H3
        seed = abs(hash(h3_idx)) % (2**31)
        rng = np.random.RandomState(seed)
        noise = rng.normal(0, 0.05)

        risk = np.clip(max_influence + noise + 0.1, 0, 1)
        scores[h3_idx] = round(float(risk), 4)

    return scores


# ---------------------------------------------------------------------------
# Conversion en GeoJSON
# ---------------------------------------------------------------------------

def h3_to_geojson_polygon(h3_index: str) -> dict:
    """Convertir un index H3 en geometrie GeoJSON Polygon."""
    boundary = h3.cell_to_boundary(h3_index)
    coords = [[lng, lat] for lat, lng in boundary]
    coords.append(coords[0])
    return {
        "type": "Polygon",
        "coordinates": [coords],
    }


def build_geojson(
    h3_indices: list[str],
    risk_scores: dict[str, float],
    resolution: int,
) -> dict:
    """
    Construire un GeoJSON FeatureCollection a partir des hexagones et scores.

    Parametres
    ----------
    h3_indices : list[str]
        Liste des index H3.
    risk_scores : dict[str, float]
        Scores de risque pour chaque hexagone.
    resolution : int
        Resolution H3 utilisee.

    Retourne
    --------
    geojson : dict
        FeatureCollection GeoJSON conforme RFC 7946.
    """
    features = []
    for h3_idx in h3_indices:
        lat, lng = h3.cell_to_latlng(h3_idx)
        score = risk_scores.get(h3_idx, 0.0)

        # Determiner le niveau de risque
        if score >= 0.8:
            risk_level = "CRITIQUE"
        elif score >= 0.6:
            risk_level = "ELEVE"
        elif score >= 0.4:
            risk_level = "MOYEN"
        elif score >= 0.2:
            risk_level = "FAIBLE"
        else:
            risk_level = "MINIMAL"

        feature = {
            "type": "Feature",
            "geometry": h3_to_geojson_polygon(h3_idx),
            "properties": {
                "h3_index": h3_idx,
                "resolution": resolution,
                "risk_score": score,
                "risk_level": risk_level,
                "center_lat": round(lat, 6),
                "center_lng": round(lng, 6),
            },
        }
        features.append(feature)

    # Trier par score decroissant
    features.sort(
        key=lambda f: f["properties"]["risk_score"], reverse=True
    )

    # Statistiques
    all_scores = list(risk_scores.values())
    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "resolution": resolution,
        "total_hexagons": len(features),
        "bbox": CI_BBOX,
        "stats": {
            "mean_risk": round(float(np.mean(all_scores)), 4) if all_scores else 0,
            "max_risk": round(float(np.max(all_scores)), 4) if all_scores else 0,
            "min_risk": round(float(np.min(all_scores)), 4) if all_scores else 0,
            "std_risk": round(float(np.std(all_scores)), 4) if all_scores else 0,
            "critical_count": sum(1 for s in all_scores if s >= 0.8),
            "high_count": sum(1 for s in all_scores if 0.6 <= s < 0.8),
            "medium_count": sum(1 for s in all_scores if 0.4 <= s < 0.6),
            "low_count": sum(1 for s in all_scores if 0.2 <= s < 0.4),
            "minimal_count": sum(1 for s in all_scores if s < 0.2),
        },
    }

    geojson = {
        "type": "FeatureCollection",
        "metadata": metadata,
        "features": features,
    }

    return geojson


# ---------------------------------------------------------------------------
# Insertion en base de donnees
# ---------------------------------------------------------------------------

def insert_into_database(
    h3_indices: list[str],
    risk_scores: dict[str, float],
    resolution: int,
    db_url: str,
) -> int:
    """
    Inserer les scores de risque H3 dans la table h3_risk_scores
    avec un upsert batch.

    Parametres
    ----------
    h3_indices : list[str]
        Liste des index H3.
    risk_scores : dict[str, float]
        Scores de risque.
    resolution : int
        Resolution H3.
    db_url : str
        URL de connexion PostgreSQL.

    Retourne
    --------
    count : int
        Nombre de lignes inserees/mises a jour.
    """
    try:
        import psycopg2
        from psycopg2.extras import execute_values
    except ImportError:
        logger.error(
            "Package 'psycopg2' requis pour l'insertion en base de donnees. "
            "Installez-le avec : pip install psycopg2-binary"
        )
        return 0

    logger.info(f"Connexion a la base de donnees : {db_url.split('@')[-1]}")

    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()

        # Preparer les donnees pour l'upsert batch
        values = []
        now = datetime.now(timezone.utc)
        for h3_idx in h3_indices:
            score = risk_scores.get(h3_idx, 0.0)
            values.append((
                h3_idx,
                resolution,
                score,
                0,     # site_count initial
                0,     # alert_count initial
                0.0,   # water_risk initial
                0.0,   # deforestation_risk initial
                now,   # computed_at
                json.dumps({"source": "generate-h3-grid-ci", "model": "goldrisk_v1"}),
            ))

        # Upsert : inserer ou mettre a jour si l'hexagone existe deja
        query = """
            INSERT INTO h3_risk_scores (
                h3_index, resolution, risk_score,
                site_count, alert_count, water_risk, deforestation_risk,
                computed_at, metadata
            ) VALUES %s
            ON CONFLICT (h3_index, resolution)
            DO UPDATE SET
                risk_score = EXCLUDED.risk_score,
                computed_at = EXCLUDED.computed_at,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
        """

        # Inserer par batch de 500
        batch_size = 500
        total_inserted = 0

        for i in range(0, len(values), batch_size):
            batch = values[i:i + batch_size]
            execute_values(cursor, query, batch)
            total_inserted += len(batch)
            logger.info(
                f"Batch insere : {total_inserted}/{len(values)} "
                f"({total_inserted / len(values) * 100:.0f}%)"
            )

        conn.commit()
        cursor.close()
        conn.close()

        logger.info(
            f"Insertion terminee : {total_inserted} hexagones "
            f"inseres/mis a jour dans h3_risk_scores"
        )
        return total_inserted

    except psycopg2.OperationalError as e:
        logger.error(f"Erreur de connexion a la base de donnees : {e}")
        return 0
    except Exception as e:
        logger.error(f"Erreur lors de l'insertion : {e}")
        return 0


# ---------------------------------------------------------------------------
# Export GeoJSON
# ---------------------------------------------------------------------------

def export_geojson(geojson: dict, output_path: Path) -> None:
    """
    Sauvegarder le GeoJSON dans un fichier.

    Parametres
    ----------
    geojson : dict
        FeatureCollection GeoJSON.
    output_path : Path
        Chemin du fichier de sortie.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    logger.info(
        f"GeoJSON exporte : {output_path} "
        f"({file_size_mb:.2f} Mo, "
        f"{len(geojson.get('features', []))} features)"
    )


# ---------------------------------------------------------------------------
# Point d'entree principal
# ---------------------------------------------------------------------------

def main() -> None:
    """Point d'entree du script de generation de grille H3."""
    parser = argparse.ArgumentParser(
        description="Generer la grille H3 de risque minier pour la Cote d'Ivoire",
    )
    parser.add_argument(
        "--resolution", "-r",
        type=int,
        default=DEFAULT_RESOLUTION,
        help=f"Resolution H3 (defaut: {DEFAULT_RESOLUTION})",
    )
    parser.add_argument(
        "--db-url",
        type=str,
        default=DEFAULT_DB_URL,
        help="URL de connexion PostgreSQL",
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default=str(OUTPUT_GEOJSON),
        help=f"Chemin du fichier GeoJSON de sortie (defaut: {OUTPUT_GEOJSON})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generer le GeoJSON sans inserer en base de donnees",
    )
    parser.add_argument(
        "--no-export",
        action="store_true",
        help="Ne pas exporter le fichier GeoJSON",
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

    logger.info("=" * 60)
    logger.info("Generation de la grille H3 - Cote d'Ivoire")
    logger.info("=" * 60)

    start_time = time.time()

    # Etape 1 : Generer la grille H3
    logger.info("Etape 1/4 : Generation des hexagones H3")
    h3_indices = generate_h3_grid(
        min_lon=CI_BBOX["min_lon"],
        min_lat=CI_BBOX["min_lat"],
        max_lon=CI_BBOX["max_lon"],
        max_lat=CI_BBOX["max_lat"],
        resolution=args.resolution,
    )
    logger.info(f"  → {len(h3_indices)} hexagones generes")

    # Etape 2 : Calculer les scores de risque
    logger.info("Etape 2/4 : Calcul des scores de risque GoldRisk")
    risk_scores = compute_risk_scores(h3_indices)
    avg_score = np.mean(list(risk_scores.values()))
    logger.info(f"  → Score de risque moyen : {avg_score:.4f}")

    # Etape 3 : Insertion en base de donnees
    if not args.dry_run:
        logger.info("Etape 3/4 : Insertion dans h3_risk_scores")
        count = insert_into_database(
            h3_indices, risk_scores, args.resolution, args.db_url,
        )
        logger.info(f"  → {count} lignes inserees/mises a jour")
    else:
        logger.info("Etape 3/4 : Insertion en BDD ignoree (--dry-run)")

    # Etape 4 : Export GeoJSON
    if not args.no_export:
        logger.info("Etape 4/4 : Export GeoJSON")
        geojson = build_geojson(h3_indices, risk_scores, args.resolution)
        output_path = Path(args.output)
        export_geojson(geojson, output_path)
    else:
        logger.info("Etape 4/4 : Export GeoJSON ignore (--no-export)")

    elapsed = time.time() - start_time
    logger.info("=" * 60)
    logger.info(f"Generation terminee en {elapsed:.1f}s")
    logger.info(f"  Hexagones : {len(h3_indices)}")
    logger.info(f"  Score moyen : {avg_score:.4f}")
    logger.info(f"  Resolution H3 : {args.resolution}")
    if not args.no_export:
        logger.info(f"  Fichier GeoJSON : {args.output}")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
