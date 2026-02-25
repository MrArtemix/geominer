from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

router = APIRouter(prefix="/infer", tags=["inference"])


class InferenceRequest(BaseModel):
    image_path: str | None = None
    bbox: str | None = None
    satellite_date: str | None = None
    sat_source: str = "Sentinel-2"


class InferenceResult(BaseModel):
    site_code: str | None = None
    confidence: float
    geometry: dict | None = None
    area_ha: float | None = None
    status: str = "DETECTED"


@router.post("", response_model=list[InferenceResult])
async def run_inference(request: InferenceRequest):
    """Placeholder pour l'inference IA MineSpot SegFormer.

    Ce endpoint sera connecte au modele SegFormer-B4 une fois
    les poids entraines disponibles.
    """
    return [
        InferenceResult(
            site_code="PLACEHOLDER",
            confidence=0.0,
            geometry=None,
            area_ha=None,
            status="DETECTED",
        )
    ]


@router.post("/patch")
async def infer_patch(file: UploadFile = File(...)):
    """Inference sur un patch satellite unique (256x256).

    Placeholder - sera implemente avec le modele SegFormer.
    """
    if not file.filename:
        raise HTTPException(400, "No file provided")

    return {
        "filename": file.filename,
        "status": "placeholder",
        "message": "Model inference not yet available. Upload accepted.",
    }
