"""
Training script for MineSpot SegFormer.

Uses PyTorch with a custom Dataset, combined Dice + BCE loss, AdamW
optimiser with CosineAnnealingWarmRestarts, and early stopping on
validation IoU.

Usage:
    python train.py \
        --data-dir /data/prepared \
        --output-dir /models \
        --epochs 50 \
        --batch-size 8 \
        --lr 1e-4 \
        --device cuda
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingWarmRestarts
from torch.utils.data import DataLoader, Dataset
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Allow importing the model from the project tree
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODELS_SRC = PROJECT_ROOT / "backend" / "minespotai-svc" / "src"
if str(MODELS_SRC) not in sys.path:
    sys.path.insert(0, str(MODELS_SRC))

from models.minespot_segformer import MineSpotSegFormer  # noqa: E402


# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------

class MiningPatchDataset(Dataset):
    """
    Loads image and mask ``.npy`` patches produced by ``prepare_dataset.py``.

    Expected directory layout::

        root/
            images/
                patch_00000.npy  # (C, H, W) float32
                ...
            masks/
                patch_00000.npy  # (H, W) uint8
                ...
    """

    def __init__(self, root: str) -> None:
        self.root = Path(root)
        self.img_dir = self.root / "images"
        self.msk_dir = self.root / "masks"

        self.files = sorted(self.img_dir.glob("*.npy"))
        if not self.files:
            raise FileNotFoundError(f"No .npy files found in {self.img_dir}")

    def __len__(self) -> int:
        return len(self.files)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        img_path = self.files[idx]
        msk_path = self.msk_dir / img_path.name

        image = np.load(img_path).astype(np.float32)   # (C, H, W)
        mask = np.load(msk_path).astype(np.int64)       # (H, W)

        # Replace NaN with 0 in image
        image = np.nan_to_num(image, nan=0.0)

        return torch.from_numpy(image), torch.from_numpy(mask)


# ---------------------------------------------------------------------------
# Loss
# ---------------------------------------------------------------------------

class DiceBCELoss(nn.Module):
    """
    Combined Dice loss + Binary Cross-Entropy loss.

    For multi-class we compute Dice per-class and average, plus standard
    cross-entropy on the logits.
    """

    def __init__(self, smooth: float = 1.0, bce_weight: float = 0.5):
        super().__init__()
        self.smooth = smooth
        self.bce_weight = bce_weight

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """
        Args:
            logits: (B, C, H, W) raw model output.
            targets: (B, H, W) integer class labels.
        """
        num_classes = logits.shape[1]

        # --- Cross-Entropy component ---
        ce_loss = F.cross_entropy(logits, targets)

        # --- Dice component ---
        probs = F.softmax(logits, dim=1)  # (B, C, H, W)
        targets_oh = F.one_hot(targets, num_classes)  # (B, H, W, C)
        targets_oh = targets_oh.permute(0, 3, 1, 2).float()  # (B, C, H, W)

        dims = (0, 2, 3)  # reduce over batch, height, width
        intersection = (probs * targets_oh).sum(dim=dims)
        union = probs.sum(dim=dims) + targets_oh.sum(dim=dims)

        dice = (2.0 * intersection + self.smooth) / (union + self.smooth)
        dice_loss = 1.0 - dice.mean()

        return self.bce_weight * ce_loss + (1.0 - self.bce_weight) * dice_loss


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

@torch.no_grad()
def compute_metrics(
    logits: torch.Tensor,
    targets: torch.Tensor,
    num_classes: int = 2,
) -> Dict[str, float]:
    """
    Compute IoU, F1, precision, recall per class and return as a flat dict.

    Args:
        logits: (B, C, H, W)
        targets: (B, H, W)
        num_classes: Number of classes.

    Returns:
        Dict with keys like ``iou_0``, ``f1_1``, ``precision_1``, etc.
        Also includes ``mean_iou`` and ``mean_f1``.
    """
    preds = logits.argmax(dim=1)  # (B, H, W)
    metrics: Dict[str, float] = {}

    ious, f1s = [], []

    for cls in range(num_classes):
        pred_cls = (preds == cls)
        true_cls = (targets == cls)

        tp = (pred_cls & true_cls).sum().float().item()
        fp = (pred_cls & ~true_cls).sum().float().item()
        fn = (~pred_cls & true_cls).sum().float().item()

        precision = tp / (tp + fp + 1e-10)
        recall = tp / (tp + fn + 1e-10)
        f1 = 2 * precision * recall / (precision + recall + 1e-10)
        iou = tp / (tp + fp + fn + 1e-10)

        metrics[f"precision_{cls}"] = precision
        metrics[f"recall_{cls}"] = recall
        metrics[f"f1_{cls}"] = f1
        metrics[f"iou_{cls}"] = iou

        ious.append(iou)
        f1s.append(f1)

    metrics["mean_iou"] = float(np.mean(ious))
    metrics["mean_f1"] = float(np.mean(f1s))
    return metrics


# ---------------------------------------------------------------------------
# Training loop
# ---------------------------------------------------------------------------

def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: str,
) -> Tuple[float, Dict[str, float]]:
    """Run one training epoch, return average loss and metrics."""
    model.train()
    total_loss = 0.0
    all_metrics: Dict[str, float] = {}
    n_batches = 0

    for images, masks in tqdm(loader, desc="  train", leave=False):
        images = images.to(device)
        masks = masks.to(device)

        optimizer.zero_grad()
        logits = model(images)
        loss = criterion(logits, masks)
        loss.backward()
        optimizer.step()

        total_loss += loss.item()
        batch_metrics = compute_metrics(logits, masks)
        for k, v in batch_metrics.items():
            all_metrics[k] = all_metrics.get(k, 0.0) + v
        n_batches += 1

    avg_loss = total_loss / max(n_batches, 1)
    avg_metrics = {k: v / max(n_batches, 1) for k, v in all_metrics.items()}
    return avg_loss, avg_metrics


@torch.no_grad()
def validate(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: str,
) -> Tuple[float, Dict[str, float]]:
    """Run validation, return average loss and metrics."""
    model.eval()
    total_loss = 0.0
    all_metrics: Dict[str, float] = {}
    n_batches = 0

    for images, masks in tqdm(loader, desc="  val  ", leave=False):
        images = images.to(device)
        masks = masks.to(device)

        logits = model(images)
        loss = criterion(logits, masks)

        total_loss += loss.item()
        batch_metrics = compute_metrics(logits, masks)
        for k, v in batch_metrics.items():
            all_metrics[k] = all_metrics.get(k, 0.0) + v
        n_batches += 1

    avg_loss = total_loss / max(n_batches, 1)
    avg_metrics = {k: v / max(n_batches, 1) for k, v in all_metrics.items()}
    return avg_loss, avg_metrics


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Train MineSpot SegFormer")
    parser.add_argument("--data-dir", required=True,
                        help="Root data directory with train/val/test sub-dirs")
    parser.add_argument("--output-dir", default="./checkpoints",
                        help="Directory to save model weights")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--device", default=None,
                        help="Device (default: auto-detect)")
    parser.add_argument("--patience", type=int, default=10,
                        help="Early stopping patience (epochs)")
    parser.add_argument("--num-workers", type=int, default=4)

    args = parser.parse_args()

    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    data_root = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # ---- Datasets & loaders ------------------------------------------------
    train_ds = MiningPatchDataset(data_root / "train")
    val_ds = MiningPatchDataset(data_root / "val")

    print(f"Training samples : {len(train_ds)}")
    print(f"Validation samples: {len(val_ds)}")

    train_loader = DataLoader(
        train_ds, batch_size=args.batch_size, shuffle=True,
        num_workers=args.num_workers, pin_memory=True, drop_last=True,
    )
    val_loader = DataLoader(
        val_ds, batch_size=args.batch_size, shuffle=False,
        num_workers=args.num_workers, pin_memory=True,
    )

    # ---- Model, loss, optimiser, scheduler ---------------------------------
    model = MineSpotSegFormer(
        in_channels=MineSpotSegFormer.NUM_CHANNELS,
        num_classes=MineSpotSegFormer.NUM_CLASSES,
    ).to(device)

    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Model parameters: {total_params:,} total, {trainable_params:,} trainable")

    criterion = DiceBCELoss(smooth=1.0, bce_weight=0.5)
    optimizer = AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = CosineAnnealingWarmRestarts(optimizer, T_0=10, T_mult=2, eta_min=1e-6)

    # ---- Training loop -----------------------------------------------------
    best_val_iou = 0.0
    patience_counter = 0

    print(f"\nStarting training for {args.epochs} epochs...")
    print("-" * 80)

    for epoch in range(1, args.epochs + 1):
        t0 = time.time()

        train_loss, train_metrics = train_one_epoch(
            model, train_loader, criterion, optimizer, device,
        )
        val_loss, val_metrics = validate(model, val_loader, criterion, device)

        scheduler.step()

        elapsed = time.time() - t0
        val_iou = val_metrics.get("mean_iou", 0.0)

        print(
            f"Epoch {epoch:3d}/{args.epochs} | "
            f"train_loss={train_loss:.4f}  val_loss={val_loss:.4f} | "
            f"train_iou={train_metrics.get('mean_iou', 0):.4f}  "
            f"val_iou={val_iou:.4f} | "
            f"val_f1={val_metrics.get('mean_f1', 0):.4f} | "
            f"lr={optimizer.param_groups[0]['lr']:.2e} | "
            f"{elapsed:.1f}s"
        )

        # -- Checkpointing --
        if val_iou > best_val_iou:
            best_val_iou = val_iou
            patience_counter = 0
            best_path = output_dir / "minespot_segformer_best.pt"
            torch.save(model.state_dict(), best_path)
            print(f"  -> New best model saved (val_iou={val_iou:.4f})")
        else:
            patience_counter += 1

        # -- Early stopping --
        if patience_counter >= args.patience:
            print(f"\nEarly stopping after {epoch} epochs (no improvement for "
                  f"{args.patience} epochs).")
            break

    # ---- Save final model --------------------------------------------------
    final_path = output_dir / "minespot_segformer_final.pt"
    torch.save(model.state_dict(), final_path)
    print(f"\nFinal model saved to {final_path}")
    print(f"Best validation IoU: {best_val_iou:.4f}")
    print("Training complete.")


if __name__ == "__main__":
    main()
