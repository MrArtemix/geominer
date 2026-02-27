"""
Routes de decision pour AlertFlow.

Endpoints :
    POST /decisions/evaluate - Evaluer une situation et generer des options
    POST /decisions/execute  - Executer une decision
    GET  /decisions/history  - Historique des decisions
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import structlog
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..core.decision_engine import (
    DecisionStatus,
    DecisionType,
    UrgencyLevel,
    get_decision_engine,
)
from ..core.distribution import get_load_balancer

logger = structlog.get_logger(service="alertflow-svc")


# ---------------------------------------------------------------------------
# Schemas Pydantic
# ---------------------------------------------------------------------------

class SiteDataInput(BaseModel):
    """Donnees du site pour l'evaluation."""
    confidence_ai: float = Field(0.5, ge=0, le=1, description="Score de confiance IA")
    area_ha: float = Field(1.0, ge=0, description="Superficie en hectares")
    status: str = Field("DETECTED", description="Statut du site")
    is_protected_zone: bool = Field(False, description="Zone protegee")
    distance_forest_m: float = Field(5000, ge=0, description="Distance foret (m)")
    distance_water_m: float = Field(5000, ge=0, description="Distance cours d'eau (m)")


class AlertInput(BaseModel):
    """Alerte associee au site."""
    alert_type: str
    severity: str = "MEDIUM"
    message: str | None = None


class SensorDataInput(BaseModel):
    """Donnees capteurs."""
    mercury: float = Field(0.0, ge=0, description="Mercure (ug/L)")
    turbidity: float = Field(0.0, ge=0, description="Turbidite (NTU)")
    ph: float = Field(7.0, ge=0, le=14, description="pH")
    dissolved_oxygen: float = Field(8.0, ge=0, description="Oxygene dissous (mg/L)")


class EvaluateRequest(BaseModel):
    """Requete d'evaluation de situation."""
    site_id: str = Field(..., description="Identifiant du site")
    site_data: SiteDataInput
    alerts: list[AlertInput] = Field(default_factory=list)
    sensor_data: SensorDataInput | None = None


class DecisionOptionResponse(BaseModel):
    """Reponse d'une option de decision."""
    option_id: str
    decision_type: str
    description: str
    estimated_cost: float
    estimated_time_hours: float
    success_probability: float
    risk_level: float
    resources_required: list[str]
    multi_criteria_score: float


class AssessmentResponse(BaseModel):
    """Reponse de l'evaluation de situation."""
    situation_id: str
    situation_type: str
    criticality_score: float
    impact_score: float
    trend_score: float
    urgency: str
    overall_score: float
    factors: dict


class EvaluateResponse(BaseModel):
    """Reponse complete d'evaluation avec options."""
    assessment: AssessmentResponse
    options: list[DecisionOptionResponse]
    recommended_decision: str
    rationale: str


class ExecuteRequest(BaseModel):
    """Requete d'execution de decision."""
    site_id: str = Field(..., description="Identifiant du site")
    site_data: SiteDataInput
    alerts: list[AlertInput] = Field(default_factory=list)
    sensor_data: SensorDataInput | None = None
    force_decision_type: str | None = Field(
        None, description="Forcer un type de decision specifique"
    )


class ExecuteResponse(BaseModel):
    """Reponse d'execution de decision."""
    decision_id: str
    situation_id: str
    site_id: str
    decision_type: str
    status: str
    rationale: str
    decided_at: str
    decided_by: str
    metadata: dict


class DecisionHistoryItem(BaseModel):
    """Element de l'historique des decisions."""
    decision_id: str
    situation_id: str
    site_id: str
    decision_type: str
    status: str
    rationale: str
    decided_at: str
    decided_by: str
    metadata: dict


class DecisionHistoryResponse(BaseModel):
    """Reponse de l'historique des decisions."""
    decisions: list[DecisionHistoryItem]
    total: int


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/decisions", tags=["decisions"])


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_situation(request: EvaluateRequest) -> EvaluateResponse:
    """
    Evaluer une situation et generer des options de decision.

    Pipeline :
        Phase 1 → Evaluation (criticite, impact, tendances)
        Phase 2 → Generation d'options
        Phase 3 → Optimisation multi-criteres
    """
    engine = get_decision_engine()

    site_data = request.site_data.model_dump()
    alerts_data = [a.model_dump() for a in request.alerts]
    sensor_data = request.sensor_data.model_dump() if request.sensor_data else {}

    # Phase 1 : Evaluation
    assessment = engine.assess_situation(site_data, alerts_data, sensor_data)

    # Phase 2 + 3 : Generation et optimisation
    options = engine.generate_options(assessment)

    # Preparer la reponse
    assessment_resp = AssessmentResponse(
        situation_id=assessment.situation_id,
        situation_type=assessment.situation_type.value,
        criticality_score=assessment.criticality_score,
        impact_score=assessment.impact_score,
        trend_score=assessment.trend_score,
        urgency=assessment.urgency.value,
        overall_score=assessment.overall_score,
        factors=assessment.factors,
    )

    options_resp = [
        DecisionOptionResponse(
            option_id=o.option_id,
            decision_type=o.decision_type.value,
            description=o.description,
            estimated_cost=o.estimated_cost,
            estimated_time_hours=o.estimated_time_hours,
            success_probability=o.success_probability,
            risk_level=o.risk_level,
            resources_required=o.resources_required,
            multi_criteria_score=o.multi_criteria_score,
        )
        for o in options
    ]

    recommended = options[0].decision_type.value if options else "SURVEILLANCE_RENFORCEE"
    rationale = (
        f"Situation {assessment.situation_type.value} avec urgence "
        f"{assessment.urgency.value} (score global: {assessment.overall_score}). "
        f"Decision recommandee : {recommended}."
    )

    return EvaluateResponse(
        assessment=assessment_resp,
        options=options_resp,
        recommended_decision=recommended,
        rationale=rationale,
    )


@router.post("/execute", response_model=ExecuteResponse)
async def execute_decision(request: ExecuteRequest) -> ExecuteResponse:
    """
    Executer le pipeline complet d'evaluation et de decision.

    Phase 1 → Phase 2 → Phase 3 → Phase 4 (decision finale).
    """
    engine = get_decision_engine()

    site_data = request.site_data.model_dump()
    alerts_data = [a.model_dump() for a in request.alerts]
    sensor_data = request.sensor_data.model_dump() if request.sensor_data else {}

    # Pipeline complet
    decision = engine.evaluate_and_decide(
        site_data=site_data,
        alerts=alerts_data,
        sensor_data=sensor_data,
        site_id=request.site_id,
    )

    decision_type = "NONE"
    if decision.chosen_option:
        decision_type = decision.chosen_option.decision_type.value

    logger.info(
        "decision.executed",
        decision_id=decision.decision_id,
        site_id=request.site_id,
        decision_type=decision_type,
    )

    return ExecuteResponse(
        decision_id=decision.decision_id,
        situation_id=decision.situation_id,
        site_id=decision.site_id,
        decision_type=decision_type,
        status=decision.status.value,
        rationale=decision.rationale,
        decided_at=decision.decided_at,
        decided_by=decision.decided_by,
        metadata=decision.metadata,
    )


@router.get("/history", response_model=DecisionHistoryResponse)
async def get_decision_history(
    site_id: str | None = Query(None, description="Filtrer par site"),
    limit: int = Query(50, ge=1, le=500, description="Nombre max de resultats"),
) -> DecisionHistoryResponse:
    """
    Retourner l'historique des decisions.

    Peut etre filtre par site_id.
    """
    engine = get_decision_engine()

    history = engine.get_history(limit=limit, site_id=site_id)

    items = [DecisionHistoryItem(**h) for h in history]

    return DecisionHistoryResponse(
        decisions=items,
        total=len(items),
    )
