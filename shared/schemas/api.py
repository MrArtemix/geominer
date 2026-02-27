"""
Schemas Pydantic partages pour les API Ge O'Miner.

Ce module definit les schemas de validation pour les requetes
et reponses des microservices.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


# --- Enums ---


class SiteStatus(str, Enum):
    """Statuts possibles d'un site minier."""

    DETECTED = "DETECTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    CONFIRMED = "CONFIRMED"
    ACTIVE = "ACTIVE"
    ESCALATED = "ESCALATED"
    DISMANTLED = "DISMANTLED"
    RECURRED = "RECURRED"


class AlertSeverity(str, Enum):
    """Niveaux de severite des alertes."""

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


# --- Schemas Site Minier ---


class SiteCreateSchema(BaseModel):
    """Schema de creation d'un site minier detecte."""

    site_code: str = Field(
        ...,
        min_length=3,
        max_length=50,
        description="Code unique du site minier",
    )
    geometry: dict[str, Any] = Field(
        ...,
        description="Geometrie GeoJSON du site (Polygon ou Point)",
    )
    h3_index_r7: str | None = Field(
        default=None,
        description="Index H3 resolution 7 du centroide",
    )
    confidence_ai: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Score de confiance du modele IA (entre 0 et 1)",
    )
    satellite_date: datetime | None = Field(
        default=None,
        description="Date de l'image satellite source",
    )
    sat_source: str | None = Field(
        default=None,
        description="Source satellite (Sentinel-2, Landsat-8, etc.)",
    )
    region: str | None = Field(
        default=None,
        description="Region administrative",
    )
    department: str | None = Field(
        default=None,
        description="Departement administratif",
    )
    sous_prefecture: str | None = Field(
        default=None,
        description="Sous-prefecture administrative",
    )
    notes: str | None = Field(
        default=None,
        max_length=2000,
        description="Notes supplementaires",
    )

    @field_validator("confidence_ai")
    @classmethod
    def valider_confiance(cls, v: float | None) -> float | None:
        """Valide que le score de confiance est dans l'intervalle [0, 1]."""
        if v is not None and not (0.0 <= v <= 1.0):
            raise ValueError("Le score de confiance doit etre entre 0 et 1")
        return v

    @field_validator("geometry")
    @classmethod
    def valider_geometrie(cls, v: dict[str, Any]) -> dict[str, Any]:
        """Valide la structure GeoJSON minimale."""
        if "type" not in v or "coordinates" not in v:
            raise ValueError(
                "La geometrie doit contenir 'type' et 'coordinates'"
            )
        types_valides = {"Point", "Polygon", "MultiPolygon"}
        if v["type"] not in types_valides:
            raise ValueError(
                f"Type de geometrie invalide: {v['type']}. "
                f"Types acceptes: {types_valides}"
            )
        return v

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "site_code": "SITE-CI-2026-0042",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-5.556, 7.539],
                                [-5.554, 7.539],
                                [-5.554, 7.541],
                                [-5.556, 7.541],
                                [-5.556, 7.539],
                            ]
                        ],
                    },
                    "h3_index_r7": "871f24a5dffffff",
                    "confidence_ai": 0.87,
                    "satellite_date": "2026-02-10T00:00:00",
                    "sat_source": "Sentinel-2",
                    "region": "Bounkani",
                    "department": "Bouna",
                    "sous_prefecture": "Doropo",
                    "notes": "Zone deboisee recente detectee par IA",
                }
            ]
        }
    }


class SiteUpdateSchema(BaseModel):
    """Schema de mise a jour d'un site minier."""

    status: SiteStatus | None = Field(
        default=None,
        description="Nouveau statut du site",
    )
    notes: str | None = Field(
        default=None,
        max_length=2000,
        description="Notes mises a jour",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "status": "CONFIRMED",
                    "notes": "Confirme par inspection terrain le 2026-02-20",
                }
            ]
        }
    }


# --- Schema Alerte ---


class AlertCreateSchema(BaseModel):
    """Schema de creation d'une alerte."""

    alert_type: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Type d'alerte (DEFORESTATION, WATER_QUALITY, INTRUSION, etc.)",
    )
    severity: AlertSeverity = Field(
        ...,
        description="Severite de l'alerte",
    )
    title: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Titre de l'alerte",
    )
    message: str | None = Field(
        default=None,
        max_length=5000,
        description="Message detaille de l'alerte",
    )
    site_id: str | None = Field(
        default=None,
        description="Identifiant du site minier associe",
    )
    sensor_id: str | None = Field(
        default=None,
        description="Identifiant du capteur IoT source",
    )
    metadata: dict[str, Any] | None = Field(
        default=None,
        description="Metadonnees supplementaires",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "alert_type": "WATER_QUALITY",
                    "severity": "HIGH",
                    "title": "Taux de mercure eleve - Riviere Comoe",
                    "message": "Le capteur AQ-007 a detecte un taux de mercure "
                    "de 0.15 mg/L, depassant le seuil critique de 0.01 mg/L.",
                    "site_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                    "sensor_id": "AQ-007",
                    "metadata": {
                        "threshold_exceeded": True,
                        "value": 0.15,
                        "threshold": 0.01,
                        "unit": "mg/L",
                    },
                }
            ]
        }
    }


# --- Schema Lecture Capteur ---


class SensorReadingSchema(BaseModel):
    """Schema pour une lecture de capteur IoT AquaGuard."""

    sensor_id: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Identifiant unique du capteur",
    )
    parameter: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Parametre mesure (pH, turbidity, mercury, etc.)",
    )
    value: float = Field(
        ...,
        description="Valeur mesuree",
    )
    unit: str = Field(
        ...,
        min_length=1,
        max_length=20,
        description="Unite de mesure",
    )
    timestamp: datetime = Field(
        ...,
        description="Horodatage de la mesure",
    )
    battery: float | None = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Niveau de batterie du capteur (pourcentage)",
    )
    lat: float | None = Field(
        default=None,
        ge=-90.0,
        le=90.0,
        description="Latitude du capteur",
    )
    lon: float | None = Field(
        default=None,
        ge=-180.0,
        le=180.0,
        description="Longitude du capteur",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "sensor_id": "AQ-007",
                    "parameter": "mercury",
                    "value": 0.15,
                    "unit": "mg/L",
                    "timestamp": "2026-02-25T14:30:00Z",
                    "battery": 78.5,
                    "lat": 7.539,
                    "lon": -5.556,
                }
            ]
        }
    }


# --- Schema Transaction Or ---


class GoldTransactionSchema(BaseModel):
    """Schema pour une transaction d'or tracee sur la blockchain."""

    site_id: str = Field(
        ...,
        description="Identifiant du site minier d'origine",
    )
    from_entity: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Entite source de la transaction",
    )
    to_entity: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Entite destinataire de la transaction",
    )
    quantity_grams: float = Field(
        ...,
        gt=0,
        description="Quantite d'or en grammes (doit etre positive)",
    )
    is_legal: bool = Field(
        ...,
        description="Indique si la transaction provient d'une source legale",
    )
    h3_index: str | None = Field(
        default=None,
        description="Index H3 de la zone de transaction",
    )
    metadata: dict[str, Any] | None = Field(
        default=None,
        description="Metadonnees supplementaires de la transaction",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "site_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                    "from_entity": "Cooperative Miniere de Doropo",
                    "to_entity": "Comptoir National de l'Or - Abidjan",
                    "quantity_grams": 245.8,
                    "is_legal": True,
                    "h3_index": "871f24a5dffffff",
                    "metadata": {
                        "purity_percent": 92.3,
                        "lot_number": "LOT-2026-0078",
                        "transport_method": "vehicule_blinde",
                    },
                }
            ]
        }
    }


# --- Schema Enregistrement Mineur ---


class MinerRegisterSchema(BaseModel):
    """Schema d'enregistrement d'un mineur artisanal."""

    full_name: str = Field(
        ...,
        min_length=2,
        max_length=255,
        description="Nom complet du mineur",
    )
    national_id: str = Field(
        ...,
        min_length=5,
        max_length=50,
        description="Numero de piece d'identite nationale",
    )
    phone: str | None = Field(
        default=None,
        max_length=20,
        description="Numero de telephone",
    )
    zone_polygon: dict[str, Any] | None = Field(
        default=None,
        description="Zone de travail autorisee (geometrie GeoJSON)",
    )
    registered_by: str | None = Field(
        default=None,
        description="Identifiant de l'agent ayant enregistre le mineur",
    )

    @field_validator("zone_polygon")
    @classmethod
    def valider_zone(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        """Valide la geometrie de la zone si fournie."""
        if v is not None:
            if "type" not in v or "coordinates" not in v:
                raise ValueError(
                    "La zone doit contenir 'type' et 'coordinates'"
                )
        return v

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "full_name": "Kouame Yao Jean-Baptiste",
                    "national_id": "CI-2024-78452163",
                    "phone": "+225 07 89 12 34 56",
                    "zone_polygon": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-5.560, 7.535],
                                [-5.550, 7.535],
                                [-5.550, 7.545],
                                [-5.560, 7.545],
                                [-5.560, 7.535],
                            ]
                        ],
                    },
                    "registered_by": "agent-terrain-001",
                }
            ]
        }
    }
