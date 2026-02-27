#!/usr/bin/env python3
"""
Ge O'Miner - Generateur de dataset synthetique pour SegFormer.

Genere 200 patches 256x256x12 canaux simulant un stack satellite multi-spectral :
  - 80 patches positifs (orpaillage) : VV/VH eleves, NDVI bas, BSI eleve, turbidite eau
  - 120 patches negatifs : foret (NDVI>0.6), agriculture (NDVI 0.3-0.6), eau (NDWI>0.3), urbain

Sauvegarde en .npy avec annotations.json et preview.png.

Usage:
    python prepare_dataset.py
    python prepare_dataset.py --output-dir /custom/path --num-patches 200
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np


# ---------------------------------------------------------------------------
# Configuration des 12 canaux simulant un stack Sentinel-1 + Sentinel-2
# ---------------------------------------------------------------------------
# Index des canaux :
#  0: B02 (Blue)    1: B03 (Green)   2: B04 (Red)    3: B05 (Red Edge 1)
#  4: B06 (Red Edge 2)  5: B07 (Red Edge 3)  6: B08 (NIR)  7: B11 (SWIR1)
#  8: B12 (SWIR2)   9: NDVI   10: VV (SAR)   11: VH (SAR)

NUM_CHANNELS = 12
PATCH_SIZE = 256
SEED = 42


def _generate_mining_patch(rng: np.random.Generator) -> np.ndarray:
    """
    Generer un patch positif (site d'orpaillage).
    Caracteristiques : VV/VH eleves, NDVI tres bas (<0.2), BSI eleve, turbidite eau.
    """
    patch = np.zeros((NUM_CHANNELS, PATCH_SIZE, PATCH_SIZE), dtype=np.float32)

    # Sol nu / degrade - reflectances elevees dans le visible
    patch[0] = rng.uniform(0.15, 0.35, (PATCH_SIZE, PATCH_SIZE))  # Blue
    patch[1] = rng.uniform(0.18, 0.40, (PATCH_SIZE, PATCH_SIZE))  # Green
    patch[2] = rng.uniform(0.20, 0.45, (PATCH_SIZE, PATCH_SIZE))  # Red

    # Red Edge - faible vegetation
    patch[3] = rng.uniform(0.12, 0.25, (PATCH_SIZE, PATCH_SIZE))
    patch[4] = rng.uniform(0.10, 0.22, (PATCH_SIZE, PATCH_SIZE))
    patch[5] = rng.uniform(0.08, 0.20, (PATCH_SIZE, PATCH_SIZE))

    # NIR tres bas (pas de vegetation)
    patch[6] = rng.uniform(0.05, 0.18, (PATCH_SIZE, PATCH_SIZE))

    # SWIR eleve (sol nu)
    patch[7] = rng.uniform(0.25, 0.50, (PATCH_SIZE, PATCH_SIZE))
    patch[8] = rng.uniform(0.20, 0.45, (PATCH_SIZE, PATCH_SIZE))

    # NDVI tres bas (< 0.2) - sol degrade
    patch[9] = rng.uniform(-0.1, 0.15, (PATCH_SIZE, PATCH_SIZE))

    # SAR VV/VH eleves (terrain perturbe, machinerie)
    patch[10] = rng.uniform(0.4, 0.85, (PATCH_SIZE, PATCH_SIZE))  # VV
    patch[11] = rng.uniform(0.3, 0.75, (PATCH_SIZE, PATCH_SIZE))  # VH

    # Ajouter des taches d'eau turbide (mercure) dans ~20% du patch
    water_mask = rng.random((PATCH_SIZE, PATCH_SIZE)) < 0.2
    patch[0, water_mask] = rng.uniform(0.05, 0.12, water_mask.sum())
    patch[6, water_mask] = rng.uniform(0.02, 0.08, water_mask.sum())
    patch[9, water_mask] = rng.uniform(-0.3, -0.1, water_mask.sum())

    return patch


def _generate_forest_patch(rng: np.random.Generator) -> np.ndarray:
    """Generer un patch foret (negatif). NDVI > 0.6."""
    patch = np.zeros((NUM_CHANNELS, PATCH_SIZE, PATCH_SIZE), dtype=np.float32)

    # Vegetation dense - faible visible, fort NIR
    patch[0] = rng.uniform(0.02, 0.06, (PATCH_SIZE, PATCH_SIZE))  # Blue
    patch[1] = rng.uniform(0.03, 0.08, (PATCH_SIZE, PATCH_SIZE))  # Green
    patch[2] = rng.uniform(0.02, 0.05, (PATCH_SIZE, PATCH_SIZE))  # Red
    patch[3] = rng.uniform(0.10, 0.25, (PATCH_SIZE, PATCH_SIZE))
    patch[4] = rng.uniform(0.20, 0.40, (PATCH_SIZE, PATCH_SIZE))
    patch[5] = rng.uniform(0.30, 0.50, (PATCH_SIZE, PATCH_SIZE))
    patch[6] = rng.uniform(0.35, 0.60, (PATCH_SIZE, PATCH_SIZE))  # NIR fort
    patch[7] = rng.uniform(0.10, 0.20, (PATCH_SIZE, PATCH_SIZE))
    patch[8] = rng.uniform(0.08, 0.15, (PATCH_SIZE, PATCH_SIZE))
    patch[9] = rng.uniform(0.60, 0.90, (PATCH_SIZE, PATCH_SIZE))  # NDVI > 0.6
    patch[10] = rng.uniform(0.10, 0.30, (PATCH_SIZE, PATCH_SIZE))  # VV faible
    patch[11] = rng.uniform(0.05, 0.20, (PATCH_SIZE, PATCH_SIZE))  # VH faible

    return patch


def _generate_agriculture_patch(rng: np.random.Generator) -> np.ndarray:
    """Generer un patch agriculture (negatif). NDVI 0.3-0.6 cyclique."""
    patch = np.zeros((NUM_CHANNELS, PATCH_SIZE, PATCH_SIZE), dtype=np.float32)

    # Vegetation moderee avec pattern regulier (parcelles)
    patch[0] = rng.uniform(0.05, 0.12, (PATCH_SIZE, PATCH_SIZE))
    patch[1] = rng.uniform(0.08, 0.18, (PATCH_SIZE, PATCH_SIZE))
    patch[2] = rng.uniform(0.06, 0.15, (PATCH_SIZE, PATCH_SIZE))
    patch[3] = rng.uniform(0.12, 0.28, (PATCH_SIZE, PATCH_SIZE))
    patch[4] = rng.uniform(0.18, 0.35, (PATCH_SIZE, PATCH_SIZE))
    patch[5] = rng.uniform(0.22, 0.38, (PATCH_SIZE, PATCH_SIZE))
    patch[6] = rng.uniform(0.20, 0.40, (PATCH_SIZE, PATCH_SIZE))  # NIR moyen
    patch[7] = rng.uniform(0.12, 0.25, (PATCH_SIZE, PATCH_SIZE))
    patch[8] = rng.uniform(0.10, 0.22, (PATCH_SIZE, PATCH_SIZE))
    patch[9] = rng.uniform(0.30, 0.60, (PATCH_SIZE, PATCH_SIZE))  # NDVI cyclique
    patch[10] = rng.uniform(0.15, 0.35, (PATCH_SIZE, PATCH_SIZE))
    patch[11] = rng.uniform(0.10, 0.25, (PATCH_SIZE, PATCH_SIZE))

    # Ajouter des lignes regulieres (sillons agricoles)
    for i in range(0, PATCH_SIZE, 16):
        stripe = slice(i, min(i + 3, PATCH_SIZE))
        patch[2, stripe, :] *= 1.3
        patch[9, stripe, :] *= 0.7

    return patch


def _generate_water_patch(rng: np.random.Generator) -> np.ndarray:
    """Generer un patch eau (negatif). NDWI > 0.3."""
    patch = np.zeros((NUM_CHANNELS, PATCH_SIZE, PATCH_SIZE), dtype=np.float32)

    # Eau - absorption forte dans NIR/SWIR
    patch[0] = rng.uniform(0.05, 0.15, (PATCH_SIZE, PATCH_SIZE))  # Blue eleve relatif
    patch[1] = rng.uniform(0.04, 0.12, (PATCH_SIZE, PATCH_SIZE))
    patch[2] = rng.uniform(0.02, 0.08, (PATCH_SIZE, PATCH_SIZE))
    patch[3] = rng.uniform(0.01, 0.05, (PATCH_SIZE, PATCH_SIZE))
    patch[4] = rng.uniform(0.01, 0.04, (PATCH_SIZE, PATCH_SIZE))
    patch[5] = rng.uniform(0.01, 0.03, (PATCH_SIZE, PATCH_SIZE))
    patch[6] = rng.uniform(0.005, 0.03, (PATCH_SIZE, PATCH_SIZE))  # NIR tres bas
    patch[7] = rng.uniform(0.002, 0.02, (PATCH_SIZE, PATCH_SIZE))
    patch[8] = rng.uniform(0.001, 0.015, (PATCH_SIZE, PATCH_SIZE))
    patch[9] = rng.uniform(-0.5, -0.1, (PATCH_SIZE, PATCH_SIZE))  # NDVI negatif
    patch[10] = rng.uniform(0.02, 0.10, (PATCH_SIZE, PATCH_SIZE))  # VV faible
    patch[11] = rng.uniform(0.01, 0.06, (PATCH_SIZE, PATCH_SIZE))  # VH faible

    return patch


def _generate_urban_patch(rng: np.random.Generator) -> np.ndarray:
    """Generer un patch urbain (negatif)."""
    patch = np.zeros((NUM_CHANNELS, PATCH_SIZE, PATCH_SIZE), dtype=np.float32)

    # Zones urbaines - reflectances mixtes, structures regulieres
    patch[0] = rng.uniform(0.10, 0.25, (PATCH_SIZE, PATCH_SIZE))
    patch[1] = rng.uniform(0.12, 0.28, (PATCH_SIZE, PATCH_SIZE))
    patch[2] = rng.uniform(0.12, 0.30, (PATCH_SIZE, PATCH_SIZE))
    patch[3] = rng.uniform(0.10, 0.22, (PATCH_SIZE, PATCH_SIZE))
    patch[4] = rng.uniform(0.10, 0.20, (PATCH_SIZE, PATCH_SIZE))
    patch[5] = rng.uniform(0.10, 0.20, (PATCH_SIZE, PATCH_SIZE))
    patch[6] = rng.uniform(0.12, 0.25, (PATCH_SIZE, PATCH_SIZE))
    patch[7] = rng.uniform(0.15, 0.35, (PATCH_SIZE, PATCH_SIZE))
    patch[8] = rng.uniform(0.12, 0.30, (PATCH_SIZE, PATCH_SIZE))
    patch[9] = rng.uniform(0.05, 0.25, (PATCH_SIZE, PATCH_SIZE))  # NDVI faible
    patch[10] = rng.uniform(0.25, 0.55, (PATCH_SIZE, PATCH_SIZE))  # VV moyen-eleve
    patch[11] = rng.uniform(0.15, 0.40, (PATCH_SIZE, PATCH_SIZE))  # VH moyen

    # Ajouter des structures en grille (routes/batiments)
    for i in range(0, PATCH_SIZE, 32):
        patch[7, i:i+2, :] = rng.uniform(0.4, 0.6, (min(2, PATCH_SIZE - i), PATCH_SIZE))
        patch[7, :, i:i+2] = rng.uniform(0.4, 0.6, (PATCH_SIZE, min(2, PATCH_SIZE - i)))

    return patch


# ---------------------------------------------------------------------------
# Generation du dataset complet
# ---------------------------------------------------------------------------

def generate_dataset(
    output_dir: str,
    num_patches: int = 200,
    seed: int = SEED,
) -> None:
    """Generer le dataset synthetique complet."""
    rng = np.random.default_rng(seed)
    output_path = Path(output_dir)
    patches_dir = output_path / "sample_patches"
    patches_dir.mkdir(parents=True, exist_ok=True)

    # Repartition : 80 positifs, 120 negatifs
    num_positive = int(num_patches * 0.4)  # 80
    num_negative = num_patches - num_positive  # 120

    # Repartition des negatifs : foret 40, agriculture 35, eau 25, urbain 20
    num_forest = int(num_negative * 0.33)       # ~40
    num_agriculture = int(num_negative * 0.29)   # ~35
    num_water = int(num_negative * 0.21)         # ~25
    num_urban = num_negative - num_forest - num_agriculture - num_water  # ~20

    print(f"Generation de {num_patches} patches ({num_positive} positifs, {num_negative} negatifs)")
    print(f"  Positifs (orpaillage): {num_positive}")
    print(f"  Foret: {num_forest}, Agriculture: {num_agriculture}, Eau: {num_water}, Urbain: {num_urban}")

    all_patches = []
    all_labels = []

    # Positifs (label = 1)
    for i in range(num_positive):
        patch = _generate_mining_patch(rng)
        all_patches.append(patch)
        all_labels.append(1)
        if (i + 1) % 20 == 0:
            print(f"  Positifs: {i + 1}/{num_positive}")

    # Negatifs (label = 0)
    generators = (
        [(_generate_forest_patch, num_forest, "foret")],
    )
    neg_configs = [
        (_generate_forest_patch, num_forest, "foret"),
        (_generate_agriculture_patch, num_agriculture, "agriculture"),
        (_generate_water_patch, num_water, "eau"),
        (_generate_urban_patch, num_urban, "urbain"),
    ]

    for gen_func, count, name in neg_configs:
        for i in range(count):
            patch = gen_func(rng)
            all_patches.append(patch)
            all_labels.append(0)
        print(f"  Negatifs ({name}): {count}")

    # Sauvegarder chaque patch en .npy
    print(f"\nSauvegarde de {len(all_patches)} patches...")
    for i, patch in enumerate(all_patches):
        np.save(patches_dir / f"patch_{i:05d}.npy", patch)

    # Creer le split train/val/test
    indices = rng.permutation(len(all_patches))
    n_train = int(len(all_patches) * 0.7)
    n_val = int(len(all_patches) * 0.15)

    train_idx = indices[:n_train].tolist()
    val_idx = indices[n_train:n_train + n_val].tolist()
    test_idx = indices[n_train + n_val:].tolist()

    # annotations.json
    annotations = {
        "total_patches": len(all_patches),
        "num_channels": NUM_CHANNELS,
        "patch_size": PATCH_SIZE,
        "positive_count": num_positive,
        "negative_count": num_negative,
        "patches": [f"patch_{i:05d}.npy" for i in range(len(all_patches))],
        "labels": all_labels,
        "split": {
            "train": train_idx,
            "val": val_idx,
            "test": test_idx,
        },
        "channel_names": [
            "B02_Blue", "B03_Green", "B04_Red", "B05_RedEdge1",
            "B06_RedEdge2", "B07_RedEdge3", "B08_NIR", "B11_SWIR1",
            "B12_SWIR2", "NDVI", "VV_SAR", "VH_SAR",
        ],
    }

    with open(patches_dir / "annotations.json", "w") as f:
        json.dump(annotations, f, indent=2)

    print(f"  annotations.json sauvegarde")
    print(f"  Split: train={len(train_idx)}, val={len(val_idx)}, test={len(test_idx)}")

    # Generer preview.png (grille 4x4 RGB fausse couleur)
    _generate_preview(all_patches, all_labels, patches_dir, rng)

    print(f"\nDataset genere dans {patches_dir}")


def _generate_preview(
    patches: list[np.ndarray],
    labels: list[int],
    output_dir: Path,
    rng: np.random.Generator,
) -> None:
    """Generer une grille 4x4 de patches en RGB fausse couleur (NIR, Red, Green)."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("  [WARN] matplotlib non disponible - preview.png non genere")
        return

    # Selectionner 8 positifs + 8 negatifs
    pos_idx = [i for i, l in enumerate(labels) if l == 1]
    neg_idx = [i for i, l in enumerate(labels) if l == 0]
    selected = list(rng.choice(pos_idx, min(8, len(pos_idx)), replace=False))
    selected += list(rng.choice(neg_idx, min(8, len(neg_idx)), replace=False))

    fig, axes = plt.subplots(4, 4, figsize=(16, 16))
    fig.suptitle("Ge O'Miner - Dataset Preview (NIR-R-G False Color)", fontsize=16, fontweight="bold")

    for ax_idx, (ax, patch_idx) in enumerate(zip(axes.flat, selected)):
        patch = patches[patch_idx]
        label = labels[patch_idx]

        # Fausse couleur : NIR (ch6), Red (ch2), Green (ch1)
        rgb = np.stack([patch[6], patch[2], patch[1]], axis=-1)
        # Normaliser entre 0 et 1
        rgb_min = rgb.min()
        rgb_max = rgb.max()
        if rgb_max > rgb_min:
            rgb = (rgb - rgb_min) / (rgb_max - rgb_min)
        else:
            rgb = np.zeros_like(rgb)

        ax.imshow(rgb)
        label_text = "ORPAILLAGE" if label == 1 else "NEGATIF"
        color = "red" if label == 1 else "green"
        ax.set_title(f"#{patch_idx} - {label_text}", color=color, fontweight="bold")
        ax.axis("off")

    # Remplir les axes restants si moins de 16 patches
    for ax in axes.flat[len(selected):]:
        ax.axis("off")

    plt.tight_layout()
    preview_path = output_dir / "preview.png"
    plt.savefig(preview_path, dpi=100, bbox_inches="tight")
    plt.close()
    print(f"  preview.png sauvegarde ({preview_path})")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ge O'Miner - Generateur de dataset synthetique pour SegFormer",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Repertoire de sortie (default: ml/datasets/)",
    )
    parser.add_argument(
        "--num-patches",
        type=int,
        default=200,
        help="Nombre total de patches a generer (default: 200)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=SEED,
        help="Graine aleatoire pour reproductibilite (default: 42)",
    )

    args = parser.parse_args()

    if args.output_dir is None:
        # Detecter le repertoire par defaut
        script_dir = Path(__file__).parent
        output_dir = str(script_dir)
    else:
        output_dir = args.output_dir

    generate_dataset(
        output_dir=output_dir,
        num_patches=args.num_patches,
        seed=args.seed,
    )


if __name__ == "__main__":
    main()
