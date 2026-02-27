"""
Script d'entrainement pour MineSpot SegFormer.

Utilise PyTorch avec un Dataset augmente, la perte DiceFocalLoss,
l'optimiseur AdamW avec CosineAnnealingWarmRestarts, early stopping
sur le F1 de validation, et integration MLflow complete.

Usage:
    python train.py \
        --data-dir /data/prepared \
        --output-dir /models \
        --epochs 15 \
        --batch-size 8 \
        --lr 3e-4 \
        --device cuda
"""

from __future__ import annotations

import argparse
import os
import random
import sys
import time
from pathlib import Path
from typing import Dict, List, Tuple

import matplotlib
matplotlib.use("Agg")  # Backend non-interactif pour la generation d'images
import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingWarmRestarts
from torch.utils.data import DataLoader, Dataset
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Import du modele et de la perte depuis le projet
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODELS_SRC = PROJECT_ROOT / "backend" / "minespotai-svc" / "src"
if str(MODELS_SRC) not in sys.path:
    sys.path.insert(0, str(MODELS_SRC))

from models.minespot_segformer import MineSpotSegFormer, DiceFocalLoss  # noqa: E402

# MLflow (optionnel, degrade gracieusement si absent)
try:
    import mlflow
    import mlflow.pytorch
    from mlflow.tracking import MlflowClient
    MLFLOW_AVAILABLE = True
except ImportError:
    MLFLOW_AVAILABLE = False


# ---------------------------------------------------------------------------
# Dataset avec augmentation
# ---------------------------------------------------------------------------

class MiningPatchDataset(Dataset):
    """
    Charge les patches image et masque ``.npy`` produits par ``prepare_dataset.py``.

    Augmentations appliquees en mode entrainement:
        - Retournement horizontal aleatoire
        - Retournement vertical aleatoire
        - Rotation aleatoire (0, 90, 180, 270 degres)
        - Cutout 32x32 (masquage aleatoire d'une region)

    Disposition attendue du repertoire::

        root/
            images/
                patch_00000.npy  # (C, H, W) float32
                ...
            masks/
                patch_00000.npy  # (H, W) uint8
                ...
    """

    def __init__(self, root: str, augment: bool = False) -> None:
        self.root = Path(root)
        self.img_dir = self.root / "images"
        self.msk_dir = self.root / "masks"
        self.augment = augment

        self.files = sorted(self.img_dir.glob("*.npy"))
        if not self.files:
            raise FileNotFoundError(f"Aucun fichier .npy trouve dans {self.img_dir}")

    def __len__(self) -> int:
        return len(self.files)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        img_path = self.files[idx]
        msk_path = self.msk_dir / img_path.name

        image = np.load(img_path).astype(np.float32)   # (C, H, W)
        mask = np.load(msk_path).astype(np.int64)       # (H, W)

        # Remplacement des NaN par 0
        image = np.nan_to_num(image, nan=0.0)

        if self.augment:
            image, mask = self._apply_augmentations(image, mask)

        return torch.from_numpy(image.copy()), torch.from_numpy(mask.copy())

    def _apply_augmentations(
        self, image: np.ndarray, mask: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        """Appliquer les augmentations aleatoires sur le patch."""
        # Retournement horizontal aleatoire
        if random.random() > 0.5:
            image = np.flip(image, axis=2)
            mask = np.flip(mask, axis=1)

        # Retournement vertical aleatoire
        if random.random() > 0.5:
            image = np.flip(image, axis=1)
            mask = np.flip(mask, axis=0)

        # Rotation aleatoire (0, 90, 180, 270 degres)
        k = random.randint(0, 3)
        if k > 0:
            image = np.rot90(image, k=k, axes=(1, 2))
            mask = np.rot90(mask, k=k, axes=(0, 1))

        # Cutout 32x32 : masquer une region aleatoire de l'image
        _, h, w = image.shape
        cutout_size = 32
        if h > cutout_size and w > cutout_size:
            cy = random.randint(0, h - cutout_size)
            cx = random.randint(0, w - cutout_size)
            image[:, cy:cy + cutout_size, cx:cx + cutout_size] = 0.0

        return image, mask


# ---------------------------------------------------------------------------
# Metriques
# ---------------------------------------------------------------------------

@torch.no_grad()
def compute_metrics(
    logits: torch.Tensor,
    targets: torch.Tensor,
    num_classes: int = 2,
) -> Dict[str, float]:
    """
    Calculer IoU, F1, precision, recall par classe et retourner un dict plat.

    Args:
        logits: (B, C, H, W)
        targets: (B, H, W)
        num_classes: Nombre de classes.

    Returns:
        Dict avec cles comme ``iou_0``, ``f1_1``, ``precision_1``, etc.
        Inclut aussi ``mean_iou`` et ``mean_f1``.
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
# Boucle d'entrainement
# ---------------------------------------------------------------------------

def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: str,
) -> Tuple[float, Dict[str, float]]:
    """Executer une epoque d'entrainement, retourner la perte moyenne et les metriques."""
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
    """Executer la validation, retourner la perte moyenne et les metriques."""
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
# Generation des visualisations
# ---------------------------------------------------------------------------

def generate_confusion_matrix(
    model: nn.Module,
    loader: DataLoader,
    device: str,
    output_path: Path,
    num_classes: int = 2,
) -> None:
    """Generer et sauvegarder la matrice de confusion sur le jeu de validation."""
    model.eval()
    confusion = np.zeros((num_classes, num_classes), dtype=np.int64)

    with torch.no_grad():
        for images, masks in loader:
            images = images.to(device)
            preds = model(images).argmax(dim=1).cpu().numpy()
            targets = masks.numpy()

            for t, p in zip(targets.ravel(), preds.ravel()):
                confusion[t, p] += 1

    # Normalisation par ligne pour les pourcentages
    row_sums = confusion.sum(axis=1, keepdims=True)
    confusion_norm = confusion / np.maximum(row_sums, 1)

    fig, ax = plt.subplots(figsize=(8, 6))
    im = ax.imshow(confusion_norm, cmap="Blues", vmin=0, vmax=1)

    class_names = ["Arriere-plan", "Site minier"]
    ax.set_xticks(range(num_classes))
    ax.set_yticks(range(num_classes))
    ax.set_xticklabels(class_names)
    ax.set_yticklabels(class_names)
    ax.set_xlabel("Prediction")
    ax.set_ylabel("Verite terrain")
    ax.set_title("Matrice de confusion")

    # Afficher les valeurs dans chaque cellule
    for i in range(num_classes):
        for j in range(num_classes):
            text = f"{confusion[i, j]}\n({confusion_norm[i, j]:.1%})"
            ax.text(j, i, text, ha="center", va="center",
                    color="white" if confusion_norm[i, j] > 0.5 else "black")

    fig.colorbar(im)
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)
    print(f"Matrice de confusion sauvegardee: {output_path}")


def generate_sample_predictions(
    model: nn.Module,
    loader: DataLoader,
    device: str,
    output_path: Path,
    num_samples: int = 4,
) -> None:
    """Generer et sauvegarder des exemples de predictions visuelles."""
    model.eval()
    images_list, masks_list, preds_list = [], [], []

    with torch.no_grad():
        for images, masks in loader:
            images = images.to(device)
            logits = model(images)
            probs = F.softmax(logits, dim=1)[:, 1].cpu().numpy()
            preds = logits.argmax(dim=1).cpu().numpy()

            for i in range(images.shape[0]):
                if len(images_list) >= num_samples:
                    break
                # Utiliser les 3 premieres bandes comme pseudo-RGB
                rgb = images[i, :3].cpu().numpy().transpose(1, 2, 0)
                rgb = (rgb - rgb.min()) / (rgb.max() - rgb.min() + 1e-10)
                images_list.append(rgb)
                masks_list.append(masks[i].numpy())
                preds_list.append(preds[i])

            if len(images_list) >= num_samples:
                break

    n = len(images_list)
    if n == 0:
        return

    fig, axes = plt.subplots(n, 3, figsize=(12, 4 * n))
    if n == 1:
        axes = axes[np.newaxis, :]

    for i in range(n):
        axes[i, 0].imshow(images_list[i])
        axes[i, 0].set_title("Image (pseudo-RGB)")
        axes[i, 0].axis("off")

        axes[i, 1].imshow(masks_list[i], cmap="Reds", vmin=0, vmax=1)
        axes[i, 1].set_title("Verite terrain")
        axes[i, 1].axis("off")

        axes[i, 2].imshow(preds_list[i], cmap="Reds", vmin=0, vmax=1)
        axes[i, 2].set_title("Prediction")
        axes[i, 2].axis("off")

    fig.suptitle("Exemples de predictions", fontsize=14)
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)
    print(f"Exemples de predictions sauvegardes: {output_path}")


# ---------------------------------------------------------------------------
# Point d'entree principal
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Entrainement MineSpot SegFormer")
    parser.add_argument("--data-dir", required=True,
                        help="Repertoire racine avec sous-dossiers train/val/test")
    parser.add_argument("--output-dir", default="./checkpoints",
                        help="Repertoire de sauvegarde des poids")
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--device", default=None,
                        help="Peripherique (defaut: detection automatique)")
    parser.add_argument("--patience", type=int, default=5,
                        help="Patience pour l'arret premature (epoques)")
    parser.add_argument("--num-workers", type=int, default=4)

    args = parser.parse_args()

    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Peripherique: {device}")

    data_root = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # ---- Integration MLflow ------------------------------------------------
    if MLFLOW_AVAILABLE:
        mlflow.set_experiment("MineSpot-CI")
        mlflow.start_run()
        mlflow.log_params({
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "lr": args.lr,
            "weight_decay": args.weight_decay,
            "patience": args.patience,
            "device": device,
            "loss": "DiceFocalLoss",
            "model": "MineSpotSegFormer-B4",
            "augmentations": "flip_h,flip_v,rot90,cutout32",
        })
        print("MLflow: experience 'MineSpot-CI' initialisee")
    else:
        print("MLflow non disponible, entrainement sans tracking")

    # ---- Jeux de donnees et chargeurs --------------------------------------
    train_ds = MiningPatchDataset(data_root / "train", augment=True)
    val_ds = MiningPatchDataset(data_root / "val", augment=False)

    print(f"Echantillons d'entrainement : {len(train_ds)}")
    print(f"Echantillons de validation  : {len(val_ds)}")

    train_loader = DataLoader(
        train_ds, batch_size=args.batch_size, shuffle=True,
        num_workers=args.num_workers, pin_memory=True, drop_last=True,
    )
    val_loader = DataLoader(
        val_ds, batch_size=args.batch_size, shuffle=False,
        num_workers=args.num_workers, pin_memory=True,
    )

    # ---- Modele, perte, optimiseur, scheduler ------------------------------
    model = MineSpotSegFormer(
        in_channels=MineSpotSegFormer.NUM_CHANNELS,
        num_classes=MineSpotSegFormer.NUM_CLASSES,
    ).to(device)

    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Parametres du modele: {total_params:,} total, {trainable_params:,} entrainables")

    criterion = DiceFocalLoss(dice_weight=0.5, gamma=2.0, alpha=0.5)
    optimizer = AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = CosineAnnealingWarmRestarts(optimizer, T_0=10, T_mult=2, eta_min=1e-6)

    # ---- Boucle d'entrainement ---------------------------------------------
    best_val_f1 = 0.0
    patience_counter = 0
    history: Dict[str, List[float]] = {
        "train_loss": [], "val_loss": [],
        "train_f1": [], "val_f1": [],
        "train_iou": [], "val_iou": [],
    }

    print(f"\nDemarrage de l'entrainement pour {args.epochs} epoques...")
    print("-" * 80)

    for epoch in range(1, args.epochs + 1):
        t0 = time.time()

        train_loss, train_metrics = train_one_epoch(
            model, train_loader, criterion, optimizer, device,
        )
        val_loss, val_metrics = validate(model, val_loader, criterion, device)

        scheduler.step()

        elapsed = time.time() - t0
        val_f1 = val_metrics.get("mean_f1", 0.0)
        val_iou = val_metrics.get("mean_iou", 0.0)
        train_f1 = train_metrics.get("mean_f1", 0.0)
        train_iou = train_metrics.get("mean_iou", 0.0)

        # Sauvegarder l'historique
        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)
        history["train_f1"].append(train_f1)
        history["val_f1"].append(val_f1)
        history["train_iou"].append(train_iou)
        history["val_iou"].append(val_iou)

        # Logger les metriques dans MLflow
        if MLFLOW_AVAILABLE:
            mlflow.log_metrics({
                "train_loss": train_loss,
                "val_loss": val_loss,
                "train_f1": train_f1,
                "val_f1": val_f1,
                "train_iou": train_iou,
                "val_iou": val_iou,
                "train_precision_1": train_metrics.get("precision_1", 0.0),
                "val_precision_1": val_metrics.get("precision_1", 0.0),
                "train_recall_1": train_metrics.get("recall_1", 0.0),
                "val_recall_1": val_metrics.get("recall_1", 0.0),
                "lr": optimizer.param_groups[0]["lr"],
            }, step=epoch)

        print(
            f"Epoque {epoch:3d}/{args.epochs} | "
            f"train_loss={train_loss:.4f}  val_loss={val_loss:.4f} | "
            f"train_f1={train_f1:.4f}  val_f1={val_f1:.4f} | "
            f"val_iou={val_iou:.4f} | "
            f"lr={optimizer.param_groups[0]['lr']:.2e} | "
            f"{elapsed:.1f}s"
        )

        # -- Sauvegarde du meilleur modele (base sur val_f1) --
        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            patience_counter = 0
            best_path = output_dir / "best_f1.pth"
            torch.save(model.state_dict(), best_path)
            print(f"  -> Nouveau meilleur modele sauvegarde (val_f1={val_f1:.4f})")

            # Enregistrer le modele dans MLflow Model Registry
            if MLFLOW_AVAILABLE:
                mlflow.pytorch.log_model(
                    model,
                    artifact_path="model",
                    registered_model_name="MineSpotSegFormer",
                )
                mlflow.log_metric("best_val_f1", best_val_f1, step=epoch)
        else:
            patience_counter += 1

        # -- Arret premature --
        if patience_counter >= args.patience:
            print(f"\nArret premature apres {epoch} epoques (pas d'amelioration depuis "
                  f"{args.patience} epoques).")
            break

    # ---- Sauvegarder le modele final ---------------------------------------
    final_path = output_dir / "minespot_segformer_final.pt"
    torch.save(model.state_dict(), final_path)
    print(f"\nModele final sauvegarde: {final_path}")
    print(f"Meilleur F1 de validation: {best_val_f1:.4f}")

    # ---- Generation des visualisations -------------------------------------
    print("\nGeneration des visualisations...")

    # Matrice de confusion
    cm_path = output_dir / "confusion_matrix.png"
    generate_confusion_matrix(model, val_loader, device, cm_path)

    # Exemples de predictions
    sp_path = output_dir / "sample_predictions.png"
    generate_sample_predictions(model, val_loader, device, sp_path)

    # Logger les artefacts dans MLflow
    if MLFLOW_AVAILABLE:
        if cm_path.exists():
            mlflow.log_artifact(str(cm_path))
        if sp_path.exists():
            mlflow.log_artifact(str(sp_path))

    # ---- Transition vers Production si meilleur que le modele actuel -------
    if MLFLOW_AVAILABLE:
        try:
            client = MlflowClient()
            model_name = "MineSpotSegFormer"

            # Recuperer la version actuelle en Production
            production_versions = client.get_latest_versions(
                model_name, stages=["Production"]
            )

            current_prod_f1 = 0.0
            if production_versions:
                prod_run = client.get_run(production_versions[0].run_id)
                current_prod_f1 = float(
                    prod_run.data.metrics.get("best_val_f1", 0.0)
                )

            # Transiter vers Production si meilleur F1
            if best_val_f1 > current_prod_f1:
                latest_versions = client.get_latest_versions(
                    model_name, stages=["None"]
                )
                if latest_versions:
                    new_version = latest_versions[0].version
                    client.transition_model_version_stage(
                        name=model_name,
                        version=new_version,
                        stage="Production",
                        archive_existing_versions=True,
                    )
                    print(
                        f"Modele v{new_version} transite en Production "
                        f"(F1={best_val_f1:.4f} > {current_prod_f1:.4f})"
                    )
            else:
                print(
                    f"Modele non promu en Production "
                    f"(F1={best_val_f1:.4f} <= Production F1={current_prod_f1:.4f})"
                )
        except Exception as e:
            print(f"Avertissement: echec de la transition MLflow: {e}")

        mlflow.end_run()

    print("Entrainement termine.")


if __name__ == "__main__":
    main()
