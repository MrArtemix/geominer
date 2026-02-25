"""
Prepare training dataset for MineSpot SegFormer.

Reads multi-band GeoTIFF images and corresponding label masks, tiles them
into 256x256 patches, filters out patches with excessive cloud cover or
no-data, and saves them as numpy ``.npy`` files with a train/val/test split.

Usage:
    python prepare_dataset.py \
        --input-dir /data/raw \
        --output-dir /data/prepared \
        --patch-size 256 \
        --overlap 32
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import List, Tuple

import numpy as np
import rasterio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def tile_image(
    image: np.ndarray,
    patch_size: int = 256,
    overlap: int = 32,
) -> List[Tuple[np.ndarray, Tuple[int, int]]]:
    """
    Tile a ``(C, H, W)`` array into overlapping patches.

    Returns a list of ``(patch, (row, col))`` where *patch* has shape
    ``(C, patch_size, patch_size)`` and ``(row, col)`` is the top-left pixel
    coordinate of the patch in the source image.
    """
    C, H, W = image.shape
    step = patch_size - overlap
    patches: List[Tuple[np.ndarray, Tuple[int, int]]] = []

    for y in range(0, H, step):
        for x in range(0, W, step):
            y_end = min(y + patch_size, H)
            x_end = min(x + patch_size, W)
            y_start = max(y_end - patch_size, 0)
            x_start = max(x_end - patch_size, 0)

            patch = image[:, y_start:y_end, x_start:x_end]
            ph, pw = patch.shape[1], patch.shape[2]

            if ph < patch_size or pw < patch_size:
                padded = np.zeros((C, patch_size, patch_size), dtype=image.dtype)
                padded[:, :ph, :pw] = patch
                patch = padded

            patches.append((patch, (y_start, x_start)))

    return patches


def tile_mask(
    mask: np.ndarray,
    patch_size: int = 256,
    overlap: int = 32,
) -> List[Tuple[np.ndarray, Tuple[int, int]]]:
    """
    Tile a ``(H, W)`` label mask into overlapping patches, matching
    :func:`tile_image`.
    """
    H, W = mask.shape
    step = patch_size - overlap
    patches: List[Tuple[np.ndarray, Tuple[int, int]]] = []

    for y in range(0, H, step):
        for x in range(0, W, step):
            y_end = min(y + patch_size, H)
            x_end = min(x + patch_size, W)
            y_start = max(y_end - patch_size, 0)
            x_start = max(x_end - patch_size, 0)

            patch = mask[y_start:y_end, x_start:x_end]
            ph, pw = patch.shape

            if ph < patch_size or pw < patch_size:
                padded = np.zeros((patch_size, patch_size), dtype=mask.dtype)
                padded[:ph, :pw] = patch
                patch = padded

            patches.append((patch, (y_start, x_start)))

    return patches


def has_excessive_nodata(patch: np.ndarray, threshold: float = 0.5) -> bool:
    """Return ``True`` if more than *threshold* fraction of pixels are NaN or zero."""
    total = patch.size
    nodata_count = np.count_nonzero(np.isnan(patch) | (patch == 0))
    return (nodata_count / total) > threshold


def has_excessive_cloud(
    patch: np.ndarray,
    blue_band_index: int = 0,
    threshold: float = 0.5,
    brightness_cutoff: float = 0.7,
) -> bool:
    """
    Heuristic cloud check: flag patch if the blue band's high-brightness
    fraction exceeds *threshold*.
    """
    blue = patch[blue_band_index].astype(np.float64)
    b_min, b_max = np.nanmin(blue), np.nanmax(blue)
    if b_max - b_min < 1e-10:
        return False
    blue_norm = (blue - b_min) / (b_max - b_min)
    cloud_fraction = np.nanmean(blue_norm > brightness_cutoff)
    return cloud_fraction > threshold


def split_indices(
    n: int,
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
    seed: int = 42,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return shuffled index arrays for train / val / test splits."""
    rng = np.random.default_rng(seed)
    indices = rng.permutation(n)
    n_train = int(n * train_ratio)
    n_val = int(n * val_ratio)
    return indices[:n_train], indices[n_train:n_train + n_val], indices[n_train + n_val:]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def prepare_dataset(
    input_dir: str,
    output_dir: str,
    patch_size: int = 256,
    overlap: int = 32,
) -> None:
    """
    Process all image/mask pairs in *input_dir* and write ``.npy`` patches
    to *output_dir*.

    Expected layout of *input_dir*::

        input_dir/
            images/
                scene_001.tif
                scene_002.tif
                ...
            masks/
                scene_001.tif
                scene_002.tif
                ...

    Output layout::

        output_dir/
            train/
                images/  patch_00000.npy ...
                masks/   patch_00000.npy ...
            val/
                images/ ...
                masks/  ...
            test/
                images/ ...
                masks/  ...
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir)

    images_dir = input_path / "images"
    masks_dir = input_path / "masks"

    if not images_dir.exists():
        raise FileNotFoundError(f"Images directory not found: {images_dir}")
    if not masks_dir.exists():
        raise FileNotFoundError(f"Masks directory not found: {masks_dir}")

    image_files = sorted(images_dir.glob("*.tif"))
    print(f"Found {len(image_files)} image files")

    all_image_patches: List[np.ndarray] = []
    all_mask_patches: List[np.ndarray] = []

    for img_file in image_files:
        mask_file = masks_dir / img_file.name
        if not mask_file.exists():
            print(f"  WARNING: No mask for {img_file.name}, skipping")
            continue

        # Read image
        with rasterio.open(img_file) as src:
            image = src.read().astype(np.float32)  # (C, H, W)

        # Read mask
        with rasterio.open(mask_file) as src:
            mask = src.read(1).astype(np.uint8)  # (H, W)

        print(f"  Processing {img_file.name}: image={image.shape}, mask={mask.shape}")

        # Tile
        img_patches = tile_image(image, patch_size=patch_size, overlap=overlap)
        msk_patches = tile_mask(mask, patch_size=patch_size, overlap=overlap)

        assert len(img_patches) == len(msk_patches), (
            f"Mismatch: {len(img_patches)} image patches vs {len(msk_patches)} mask patches"
        )

        # Filter
        accepted = 0
        for (ip, _), (mp, _) in zip(img_patches, msk_patches):
            if has_excessive_nodata(ip, threshold=0.5):
                continue
            if has_excessive_cloud(ip, blue_band_index=0, threshold=0.5):
                continue
            all_image_patches.append(ip)
            all_mask_patches.append(mp)
            accepted += 1

        print(f"    Accepted {accepted}/{len(img_patches)} patches")

    total = len(all_image_patches)
    print(f"\nTotal accepted patches: {total}")

    if total == 0:
        print("No patches to save. Exiting.")
        return

    # Split
    train_idx, val_idx, test_idx = split_indices(total)
    splits = {
        "train": train_idx,
        "val": val_idx,
        "test": test_idx,
    }

    for split_name, indices in splits.items():
        split_img_dir = output_path / split_name / "images"
        split_msk_dir = output_path / split_name / "masks"
        split_img_dir.mkdir(parents=True, exist_ok=True)
        split_msk_dir.mkdir(parents=True, exist_ok=True)

        for j, idx in enumerate(indices):
            np.save(split_img_dir / f"patch_{j:05d}.npy", all_image_patches[idx])
            np.save(split_msk_dir / f"patch_{j:05d}.npy", all_mask_patches[idx])

        print(f"  {split_name}: {len(indices)} patches saved to {split_img_dir.parent}")

    print("Dataset preparation complete.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare training dataset for MineSpot SegFormer"
    )
    parser.add_argument(
        "--input-dir", required=True,
        help="Root directory containing images/ and masks/ sub-directories",
    )
    parser.add_argument(
        "--output-dir", required=True,
        help="Output directory for the prepared .npy dataset",
    )
    parser.add_argument(
        "--patch-size", type=int, default=256,
        help="Patch size in pixels (default: 256)",
    )
    parser.add_argument(
        "--overlap", type=int, default=32,
        help="Overlap between adjacent patches in pixels (default: 32)",
    )

    args = parser.parse_args()
    prepare_dataset(
        input_dir=args.input_dir,
        output_dir=args.output_dir,
        patch_size=args.patch_size,
        overlap=args.overlap,
    )


if __name__ == "__main__":
    main()
