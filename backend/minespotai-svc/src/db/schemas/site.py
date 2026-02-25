from datetime import date, datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class SiteStatus(str, Enum):
    DETECTED = "DETECTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    CONFIRMED = "CONFIRMED"
    ACTIVE = "ACTIVE"
    ESCALATED = "ESCALATED"
    DISMANTLED = "DISMANTLED"
    RECURRED = "RECURRED"


class Geometry(BaseModel):
    type: str = "Polygon"
    coordinates: list[list[list[float]]]


class PointGeometry(BaseModel):
    type: str = "Point"
    coordinates: list[float]


class SiteProperties(BaseModel):
    site_code: str
    area_ha: float | None = None
    h3_index_r7: str | None = None
    confidence_ai: float | None = Field(None, ge=0, le=1)
    detected_at: datetime | None = None
    satellite_date: date | None = None
    sat_source: str | None = None
    status: SiteStatus = SiteStatus.DETECTED
    blockchain_txid: str | None = None
    ipfs_cid: str | None = None
    region: str | None = None
    department: str | None = None
    sous_prefecture: str | None = None
    notes: str | None = None


class SiteFeature(BaseModel):
    type: str = "Feature"
    id: UUID | None = None
    geometry: Geometry
    properties: SiteProperties


class SiteFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: list[SiteFeature]
    total_count: int = 0


class SiteCreate(BaseModel):
    site_code: str
    geometry: Geometry
    h3_index_r7: str | None = None
    confidence_ai: float | None = Field(None, ge=0, le=1)
    satellite_date: date | None = None
    sat_source: str | None = None
    region: str | None = None
    department: str | None = None
    sous_prefecture: str | None = None
    notes: str | None = None


class SiteStatusUpdate(BaseModel):
    status: SiteStatus
    notes: str | None = None


class SiteResponse(BaseModel):
    id: UUID
    site_code: str
    area_ha: float | None
    centroid_lat: float | None = None
    centroid_lon: float | None = None
    h3_index_r7: str | None
    confidence_ai: float | None
    detected_at: datetime | None
    satellite_date: date | None
    sat_source: str | None
    status: SiteStatus
    blockchain_txid: str | None
    region: str | None
    department: str | None
    created_at: datetime | None

    model_config = {"from_attributes": True}


class BBoxQuery(BaseModel):
    min_lon: float = Field(..., ge=-180, le=180)
    min_lat: float = Field(..., ge=-90, le=90)
    max_lon: float = Field(..., ge=-180, le=180)
    max_lat: float = Field(..., ge=-90, le=90)
