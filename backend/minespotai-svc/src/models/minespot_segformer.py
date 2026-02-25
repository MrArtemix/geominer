"""
MineSpot SegFormer - SegFormer-B4 adapted for mining site detection.

Input:  12 channels (Sentinel-2 B2-B8A-B11-B12 + SAR VV/VH + NDVI/NDWI/BSI/NBI)
Output: 2 classes (background, mining_site)
Patch size: 256x256
"""

from typing import List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------

class OverlapPatchEmbed(nn.Module):
    """Overlapping patch embedding used in Mix Transformer (MiT)."""

    def __init__(self, patch_size: int = 7, stride: int = 4,
                 in_channels: int = 3, embed_dim: int = 64):
        super().__init__()
        self.proj = nn.Conv2d(
            in_channels, embed_dim,
            kernel_size=patch_size, stride=stride,
            padding=patch_size // 2,
        )
        self.norm = nn.LayerNorm(embed_dim)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, int, int]:
        x = self.proj(x)
        B, C, H, W = x.shape
        x = x.flatten(2).transpose(1, 2)  # (B, N, C)
        x = self.norm(x)
        return x, H, W


class EfficientSelfAttention(nn.Module):
    """Efficient self-attention with spatial-reduction ratio."""

    def __init__(self, dim: int, num_heads: int = 8, sr_ratio: int = 1,
                 qkv_bias: bool = True, attn_drop: float = 0.0,
                 proj_drop: float = 0.0):
        super().__init__()
        self.num_heads = num_heads
        self.head_dim = dim // num_heads
        self.scale = self.head_dim ** -0.5

        self.q = nn.Linear(dim, dim, bias=qkv_bias)
        self.kv = nn.Linear(dim, dim * 2, bias=qkv_bias)
        self.attn_drop = nn.Dropout(attn_drop)
        self.proj = nn.Linear(dim, dim)
        self.proj_drop = nn.Dropout(proj_drop)

        self.sr_ratio = sr_ratio
        if sr_ratio > 1:
            self.sr = nn.Conv2d(dim, dim, kernel_size=sr_ratio, stride=sr_ratio)
            self.sr_norm = nn.LayerNorm(dim)

    def forward(self, x: torch.Tensor, H: int, W: int) -> torch.Tensor:
        B, N, C = x.shape
        q = self.q(x).reshape(B, N, self.num_heads, self.head_dim).permute(0, 2, 1, 3)

        if self.sr_ratio > 1:
            x_ = x.permute(0, 2, 1).reshape(B, C, H, W)
            x_ = self.sr(x_).reshape(B, C, -1).permute(0, 2, 1)
            x_ = self.sr_norm(x_)
            kv = self.kv(x_).reshape(B, -1, 2, self.num_heads, self.head_dim).permute(2, 0, 3, 1, 4)
        else:
            kv = self.kv(x).reshape(B, -1, 2, self.num_heads, self.head_dim).permute(2, 0, 3, 1, 4)

        k, v = kv[0], kv[1]
        attn = (q @ k.transpose(-2, -1)) * self.scale
        attn = attn.softmax(dim=-1)
        attn = self.attn_drop(attn)
        x = (attn @ v).transpose(1, 2).reshape(B, N, C)
        x = self.proj(x)
        x = self.proj_drop(x)
        return x


class MixFFN(nn.Module):
    """Mix Feed-Forward Network with depth-wise convolution."""

    def __init__(self, in_features: int, hidden_features: Optional[int] = None,
                 out_features: Optional[int] = None, drop: float = 0.0):
        super().__init__()
        out_features = out_features or in_features
        hidden_features = hidden_features or in_features
        self.fc1 = nn.Linear(in_features, hidden_features)
        self.dwconv = nn.Conv2d(
            hidden_features, hidden_features,
            kernel_size=3, padding=1, groups=hidden_features,
        )
        self.act = nn.GELU()
        self.fc2 = nn.Linear(hidden_features, out_features)
        self.drop = nn.Dropout(drop)

    def forward(self, x: torch.Tensor, H: int, W: int) -> torch.Tensor:
        B, N, C = x.shape
        x = self.fc1(x)
        x = x.transpose(1, 2).reshape(B, -1, H, W)
        x = self.dwconv(x)
        x = x.flatten(2).transpose(1, 2)
        x = self.act(x)
        x = self.drop(x)
        x = self.fc2(x)
        x = self.drop(x)
        return x


class TransformerBlock(nn.Module):
    """Single transformer block for the MiT encoder."""

    def __init__(self, dim: int, num_heads: int, sr_ratio: int = 1,
                 mlp_ratio: float = 4.0, drop: float = 0.0,
                 attn_drop: float = 0.0):
        super().__init__()
        self.norm1 = nn.LayerNorm(dim)
        self.attn = EfficientSelfAttention(
            dim, num_heads=num_heads, sr_ratio=sr_ratio,
            attn_drop=attn_drop, proj_drop=drop,
        )
        self.norm2 = nn.LayerNorm(dim)
        self.mlp = MixFFN(
            in_features=dim,
            hidden_features=int(dim * mlp_ratio),
            drop=drop,
        )

    def forward(self, x: torch.Tensor, H: int, W: int) -> torch.Tensor:
        x = x + self.attn(self.norm1(x), H, W)
        x = x + self.mlp(self.norm2(x), H, W)
        return x


# ---------------------------------------------------------------------------
# Mix Transformer Encoder (MiT-B4)
# ---------------------------------------------------------------------------

class MiTEncoder(nn.Module):
    """
    Mix Transformer Encoder, B4 variant.

    Stage configs (B4):
        embed_dims  = [64, 128, 320, 512]
        num_heads   = [1, 2, 5, 8]
        depths      = [3, 8, 27, 3]
        sr_ratios   = [8, 4, 2, 1]
    """

    def __init__(self, in_channels: int = 12,
                 embed_dims: Tuple[int, ...] = (64, 128, 320, 512),
                 num_heads: Tuple[int, ...] = (1, 2, 5, 8),
                 depths: Tuple[int, ...] = (3, 8, 27, 3),
                 sr_ratios: Tuple[int, ...] = (8, 4, 2, 1),
                 mlp_ratio: float = 4.0,
                 drop_rate: float = 0.0,
                 attn_drop_rate: float = 0.0):
        super().__init__()
        self.num_stages = len(embed_dims)

        patch_sizes = [7, 3, 3, 3]
        strides = [4, 2, 2, 2]

        for i in range(self.num_stages):
            in_ch = in_channels if i == 0 else embed_dims[i - 1]
            patch_embed = OverlapPatchEmbed(
                patch_size=patch_sizes[i], stride=strides[i],
                in_channels=in_ch, embed_dim=embed_dims[i],
            )
            blocks = nn.ModuleList([
                TransformerBlock(
                    dim=embed_dims[i], num_heads=num_heads[i],
                    sr_ratio=sr_ratios[i], mlp_ratio=mlp_ratio,
                    drop=drop_rate, attn_drop=attn_drop_rate,
                )
                for _ in range(depths[i])
            ])
            norm = nn.LayerNorm(embed_dims[i])
            setattr(self, f"patch_embed{i + 1}", patch_embed)
            setattr(self, f"blocks{i + 1}", blocks)
            setattr(self, f"norm{i + 1}", norm)

    def forward(self, x: torch.Tensor) -> List[torch.Tensor]:
        features = []
        B = x.shape[0]
        for i in range(self.num_stages):
            patch_embed = getattr(self, f"patch_embed{i + 1}")
            blocks = getattr(self, f"blocks{i + 1}")
            norm = getattr(self, f"norm{i + 1}")

            x, H, W = patch_embed(x)
            for blk in blocks:
                x = blk(x, H, W)
            x = norm(x)
            x = x.reshape(B, H, W, -1).permute(0, 3, 1, 2)
            features.append(x)
        return features


# ---------------------------------------------------------------------------
# SegFormer Decode Head
# ---------------------------------------------------------------------------

class SegFormerDecodeHead(nn.Module):
    """All-MLP decode head for SegFormer."""

    def __init__(self, embed_dims: Tuple[int, ...] = (64, 128, 320, 512),
                 decoder_dim: int = 768, num_classes: int = 2):
        super().__init__()
        self.linear_layers = nn.ModuleList([
            nn.Sequential(
                nn.Conv2d(dim, decoder_dim, kernel_size=1),
                nn.BatchNorm2d(decoder_dim),
                nn.ReLU(inplace=True),
            )
            for dim in embed_dims
        ])
        self.fuse = nn.Sequential(
            nn.Conv2d(decoder_dim * len(embed_dims), decoder_dim, kernel_size=1),
            nn.BatchNorm2d(decoder_dim),
            nn.ReLU(inplace=True),
        )
        self.classifier = nn.Conv2d(decoder_dim, num_classes, kernel_size=1)

    def forward(self, features: List[torch.Tensor]) -> torch.Tensor:
        target_size = features[0].shape[2:]  # highest-resolution feature map
        aligned = []
        for feat, linear in zip(features, self.linear_layers):
            x = linear(feat)
            x = F.interpolate(x, size=target_size, mode="bilinear", align_corners=False)
            aligned.append(x)
        x = torch.cat(aligned, dim=1)
        x = self.fuse(x)
        x = self.classifier(x)
        return x


# ---------------------------------------------------------------------------
# MineSpotSegFormer
# ---------------------------------------------------------------------------

class MineSpotSegFormer(nn.Module):
    """
    SegFormer-B4 adapted for mining site detection from satellite imagery.

    Channels (12):
        0-5: Sentinel-2 optical bands (B2, B3, B4, B8, B8A, B11, B12)
              -> actually 7 optical but we list B2,B3,B4,B8,B8A,B11,B12 = 7
              Recount: B2, B8A, B11, B12 = 4 core + B3, B4, B8 implicit
              for indices. We accept 12-channel stacked input:
              [B2, B3, B4, B8, B8A, B11, B12, VV, VH, NDVI, NDWI, BSI]
              (NBI can replace one or be the 12th, adjust as needed)
        6-7:  SAR (VV, VH)
        8-11: Spectral indices (NDVI, NDWI, BSI, NBI)

    Classes (2):
        0 - background
        1 - mining_site
    """

    NUM_CHANNELS = 12
    NUM_CLASSES = 2
    PATCH_SIZE = 256

    def __init__(self, in_channels: int = 12, num_classes: int = 2,
                 decoder_dim: int = 768):
        super().__init__()
        self.encoder = MiTEncoder(in_channels=in_channels)
        embed_dims = (64, 128, 320, 512)
        self.decode_head = SegFormerDecodeHead(
            embed_dims=embed_dims,
            decoder_dim=decoder_dim,
            num_classes=num_classes,
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (B, 12, 256, 256) input tensor.
        Returns:
            logits: (B, 2, 256, 256) raw logits.
        """
        features = self.encoder(x)
        logits = self.decode_head(features)
        logits = F.interpolate(
            logits, size=x.shape[2:], mode="bilinear", align_corners=False,
        )
        return logits


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def load_model(
    weights_path: str,
    device: Optional[str] = None,
    in_channels: int = 12,
    num_classes: int = 2,
) -> MineSpotSegFormer:
    """
    Instantiate MineSpotSegFormer and load saved weights.

    Args:
        weights_path: Path to a ``.pt`` or ``.pth`` state-dict file.
        device: Target device string (e.g. ``"cuda:0"``).  When *None* the
                function picks CUDA if available, else CPU.
        in_channels: Number of input channels (default 12).
        num_classes: Number of output classes (default 2).

    Returns:
        Model in eval mode on the requested device.
    """
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    model = MineSpotSegFormer(in_channels=in_channels, num_classes=num_classes)
    state_dict = torch.load(weights_path, map_location=device, weights_only=True)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()
    return model


@torch.no_grad()
def predict(
    model: MineSpotSegFormer,
    image_tensor: torch.Tensor,
) -> torch.Tensor:
    """
    Run inference on a single image tensor.

    Args:
        model: A loaded MineSpotSegFormer in eval mode.
        image_tensor: (1, C, H, W) or (C, H, W) float tensor, already
                      normalised to the expected range.

    Returns:
        mask: (H, W) integer tensor with class indices (0 = background,
              1 = mining_site).
    """
    if image_tensor.ndim == 3:
        image_tensor = image_tensor.unsqueeze(0)

    device = next(model.parameters()).device
    image_tensor = image_tensor.to(device)

    logits = model(image_tensor)  # (1, 2, H, W)
    mask = logits.argmax(dim=1).squeeze(0)  # (H, W)
    return mask.cpu()


def postprocess_mask(
    mask: np.ndarray,
    threshold: float = 0.5,
    min_area: int = 100,
    transform=None,
) -> List[dict]:
    """
    Convert a raster prediction mask into a list of GeoJSON-like polygon
    features, filtering out small detections.

    Args:
        mask: 2-D numpy array of probabilities **or** class indices.
              If float values are detected the array is binarised with
              *threshold*.
        threshold: Probability threshold when *mask* contains floats.
        min_area: Minimum polygon area in pixels.  Polygons smaller than
                  this are discarded.
        transform: Affine transform (from rasterio) to map pixel
                   coordinates to CRS coordinates.  When *None* pixel
                   coordinates are used.

    Returns:
        List of dicts with ``geometry`` (Shapely-compatible mapping) and
        ``properties`` keys.
    """
    from rasterio.features import shapes
    from shapely.geometry import shape

    if mask.dtype in (np.float32, np.float64):
        binary = (mask >= threshold).astype(np.uint8)
    else:
        binary = (mask > 0).astype(np.uint8)

    polygons = []
    for geom, value in shapes(binary, transform=transform):
        if value == 0:
            continue
        poly = shape(geom)
        if poly.area < min_area:
            continue
        polygons.append({
            "geometry": geom,
            "properties": {
                "class": "mining_site",
                "area_px": poly.area,
            },
        })

    return polygons
