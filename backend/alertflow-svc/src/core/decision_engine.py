"""
DecisionEngine — Moteur de decision autonome pour GeoMiner.

Algorithme en 4 phases :
    Phase 1 : Evaluation de la situation (score criticite, impact, tendances)
    Phase 2 : Generation d'options (surveillance, escalade, demantelement, etc.)
    Phase 3 : Optimisation multi-criteres (scoring ponderation)
    Phase 4 : Prise de decision finale et execution

Adapte au contexte GeoMiner :
    - anomalies = sites miniers detectes
    - decisions = escalade / demantelement / surveillance renforcee

Auteur : Ge O'Miner / AlertFlow
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

import structlog

logger = structlog.get_logger(service="alertflow-svc", module="decision_engine")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql://geominer:geominer2026@postgres:5432/geominerdb",
)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class SituationType(str, Enum):
    """Types de situations detectees."""
    NEW_SITE = "NEW_SITE"
    SITE_EXPANSION = "SITE_EXPANSION"
    WATER_CONTAMINATION = "WATER_CONTAMINATION"
    DEFORESTATION = "DEFORESTATION"
    RECURRENCE = "RECURRENCE"
    MULTIPLE_ALERTS = "MULTIPLE_ALERTS"


class DecisionType(str, Enum):
    """Types de decisions possibles."""
    SURVEILLANCE_RENFORCEE = "SURVEILLANCE_RENFORCEE"
    ESCALADE_AUTORITES = "ESCALADE_AUTORITES"
    INTERVENTION_PROGRAMMEE = "INTERVENTION_PROGRAMMEE"
    INTERVENTION_IMMEDIATE = "INTERVENTION_IMMEDIATE"
    DEMANTELEMENT = "DEMANTELEMENT"
    FERMETURE_SITE = "FERMETURE_SITE"
    ALERTE_COMMUNAUTE = "ALERTE_COMMUNAUTE"
    INVESTIGATION_TERRAIN = "INVESTIGATION_TERRAIN"


class DecisionStatus(str, Enum):
    """Statuts d'une decision."""
    PROPOSED = "PROPOSED"
    APPROVED = "APPROVED"
    EXECUTING = "EXECUTING"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class UrgencyLevel(str, Enum):
    """Niveaux d'urgence."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class SituationAssessment:
    """Evaluation d'une situation (Phase 1)."""
    situation_id: str = ""
    situation_type: SituationType = SituationType.NEW_SITE
    criticality_score: float = 0.0
    impact_score: float = 0.0
    trend_score: float = 0.0
    urgency: UrgencyLevel = UrgencyLevel.LOW
    overall_score: float = 0.0
    factors: dict = field(default_factory=dict)
    assessed_at: str = ""


@dataclass
class DecisionOption:
    """Option de decision generee (Phase 2)."""
    option_id: str = ""
    decision_type: DecisionType = DecisionType.SURVEILLANCE_RENFORCEE
    description: str = ""
    estimated_cost: float = 0.0
    estimated_time_hours: float = 0.0
    success_probability: float = 0.0
    risk_level: float = 0.0
    resources_required: list[str] = field(default_factory=list)
    multi_criteria_score: float = 0.0


@dataclass
class Decision:
    """Decision finale prise (Phase 4)."""
    decision_id: str = ""
    situation_id: str = ""
    site_id: str = ""
    chosen_option: DecisionOption | None = None
    alternatives: list[DecisionOption] = field(default_factory=list)
    status: DecisionStatus = DecisionStatus.PROPOSED
    rationale: str = ""
    decided_at: str = ""
    decided_by: str = "system"
    execution_deadline: str = ""
    metadata: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Poids des criteres d'optimisation
# ---------------------------------------------------------------------------

CRITERIA_WEIGHTS = {
    "success_probability": 0.30,
    "cost_efficiency": 0.20,
    "time_efficiency": 0.15,
    "risk_minimization": 0.20,
    "resource_availability": 0.15,
}


# ---------------------------------------------------------------------------
# DecisionEngine
# ---------------------------------------------------------------------------

class DecisionEngine:
    """
    Moteur de decision autonome pour la gestion des sites miniers.

    Pipeline en 4 phases :
        1. Evaluer la situation → SituationAssessment
        2. Generer les options → list[DecisionOption]
        3. Optimiser (scoring multi-criteres)
        4. Decider et enregistrer → Decision
    """

    def __init__(self) -> None:
        self._decisions_history: list[Decision] = []

    # -----------------------------------------------------------------
    # Phase 1 : Evaluation de la situation
    # -----------------------------------------------------------------

    def assess_situation(
        self,
        site_data: dict,
        alerts: list[dict] | None = None,
        sensor_data: dict | None = None,
    ) -> SituationAssessment:
        """
        Evaluer la criticite d'une situation a partir des donnees du site,
        des alertes recentes et des donnees capteurs.

        Parametres
        ----------
        site_data : dict
            Donnees du site minier (confidence_ai, area_ha, status, etc.).
        alerts : list[dict] | None
            Alertes recentes associees au site.
        sensor_data : dict | None
            Donnees capteurs AquaGuard (mercury, turbidity, etc.).

        Retourne
        --------
        assessment : SituationAssessment
        """
        alerts = alerts or []
        sensor_data = sensor_data or {}

        # Score de criticite (0-100)
        criticality = self._compute_criticality(site_data, alerts, sensor_data)

        # Score d'impact (0-100)
        impact = self._compute_impact(site_data, sensor_data)

        # Score de tendance (0-100) : evolution dans le temps
        trend = self._compute_trend(site_data, alerts)

        # Determiner le type de situation
        situation_type = self._classify_situation(
            site_data, alerts, sensor_data
        )

        # Score global pondere
        overall = (
            criticality * 0.40
            + impact * 0.35
            + trend * 0.25
        )

        # Determiner l'urgence
        if overall > 80:
            urgency = UrgencyLevel.CRITICAL
        elif overall > 60:
            urgency = UrgencyLevel.HIGH
        elif overall > 40:
            urgency = UrgencyLevel.MEDIUM
        else:
            urgency = UrgencyLevel.LOW

        assessment = SituationAssessment(
            situation_id=str(uuid4()),
            situation_type=situation_type,
            criticality_score=round(criticality, 2),
            impact_score=round(impact, 2),
            trend_score=round(trend, 2),
            urgency=urgency,
            overall_score=round(overall, 2),
            factors={
                "confidence_ai": site_data.get("confidence_ai", 0),
                "area_ha": site_data.get("area_ha", 0),
                "alert_count": len(alerts),
                "has_water_contamination": any(
                    a.get("alert_type") == "WATER_CONTAMINATION"
                    for a in alerts
                ),
                "is_protected_zone": site_data.get("is_protected_zone", False),
                "status": site_data.get("status", "DETECTED"),
            },
            assessed_at=datetime.now(timezone.utc).isoformat(),
        )

        logger.info(
            "situation.assessed",
            situation_id=assessment.situation_id,
            type=situation_type.value,
            urgency=urgency.value,
            overall_score=assessment.overall_score,
        )

        return assessment

    def _compute_criticality(
        self,
        site_data: dict,
        alerts: list[dict],
        sensor_data: dict,
    ) -> float:
        """Calculer le score de criticite."""
        score = 0.0

        # Confiance IA du site
        confidence = float(site_data.get("confidence_ai", 0))
        score += confidence * 25.0

        # Nombre d'alertes recentes
        alert_count = len(alerts)
        score += min(alert_count * 5.0, 20.0)

        # Severite des alertes
        severity_weights = {"CRITICAL": 15, "HIGH": 10, "MEDIUM": 5, "LOW": 2}
        for alert in alerts:
            score += severity_weights.get(alert.get("severity", "LOW"), 0)
        score = min(score, 100.0)

        # Contamination eau (mercure)
        mercury = float(sensor_data.get("mercury", 0))
        if mercury > 1.0:
            score = min(score + 20.0, 100.0)

        # Zone protegee
        if site_data.get("is_protected_zone"):
            score = min(score + 15.0, 100.0)

        return min(score, 100.0)

    def _compute_impact(
        self,
        site_data: dict,
        sensor_data: dict,
    ) -> float:
        """Calculer le score d'impact environnemental et social."""
        score = 0.0

        # Surface du site
        area = float(site_data.get("area_ha", 0))
        score += min(area / 10.0 * 15.0, 25.0)

        # Contamination eau
        mercury = float(sensor_data.get("mercury", 0))
        turbidity = float(sensor_data.get("turbidity", 0))
        score += min(mercury * 15.0, 25.0)
        score += min(turbidity / 500.0 * 15.0, 15.0)

        # Proximite foret
        dist_forest = float(site_data.get("distance_forest_m", 5000))
        if dist_forest < 500:
            score += 20.0
        elif dist_forest < 1000:
            score += 10.0

        # Proximite cours d'eau
        dist_water = float(site_data.get("distance_water_m", 5000))
        if dist_water < 200:
            score += 15.0
        elif dist_water < 500:
            score += 8.0

        return min(score, 100.0)

    def _compute_trend(
        self,
        site_data: dict,
        alerts: list[dict],
    ) -> float:
        """Calculer le score de tendance (evolution)."""
        score = 50.0  # Baseline neutre

        # Statut du site
        status = site_data.get("status", "DETECTED")
        status_scores = {
            "DETECTED": 30,
            "UNDER_REVIEW": 40,
            "CONFIRMED": 50,
            "ACTIVE": 65,
            "ESCALATED": 80,
            "DISMANTLED": 20,
            "RECURRED": 90,
        }
        score = float(status_scores.get(status, 50))

        # Recurrence (aggrave la tendance)
        if status == "RECURRED":
            score = min(score + 10.0, 100.0)

        # Augmentation des alertes
        if len(alerts) > 5:
            score = min(score + 15.0, 100.0)

        return min(score, 100.0)

    def _classify_situation(
        self,
        site_data: dict,
        alerts: list[dict],
        sensor_data: dict,
    ) -> SituationType:
        """Classifier le type de situation."""
        status = site_data.get("status", "DETECTED")

        if status == "RECURRED":
            return SituationType.RECURRENCE

        water_alerts = [
            a for a in alerts
            if a.get("alert_type") == "WATER_CONTAMINATION"
        ]
        if water_alerts or float(sensor_data.get("mercury", 0)) > 1.0:
            return SituationType.WATER_CONTAMINATION

        defo_alerts = [
            a for a in alerts
            if a.get("alert_type") == "DEFORESTATION"
        ]
        if defo_alerts:
            return SituationType.DEFORESTATION

        if len(alerts) > 3:
            return SituationType.MULTIPLE_ALERTS

        if status in ("DETECTED", "UNDER_REVIEW"):
            return SituationType.NEW_SITE

        return SituationType.SITE_EXPANSION

    # -----------------------------------------------------------------
    # Phase 2 : Generation d'options
    # -----------------------------------------------------------------

    def generate_options(
        self,
        assessment: SituationAssessment,
    ) -> list[DecisionOption]:
        """
        Generer des options de decision en fonction de l'evaluation.

        Retourne une liste triee par score multi-criteres decroissant.
        """
        options: list[DecisionOption] = []

        urgency = assessment.urgency

        # Option 1 : Surveillance renforcee (toujours proposee)
        options.append(DecisionOption(
            option_id=str(uuid4()),
            decision_type=DecisionType.SURVEILLANCE_RENFORCEE,
            description=(
                "Augmenter la frequence de surveillance satellite "
                "et deployer des capteurs supplementaires."
            ),
            estimated_cost=500.0,
            estimated_time_hours=24.0,
            success_probability=0.70,
            risk_level=0.10,
            resources_required=["satellite_tasking", "sensor_deployment"],
        ))

        # Option 2 : Investigation terrain
        if urgency in (UrgencyLevel.MEDIUM, UrgencyLevel.HIGH, UrgencyLevel.CRITICAL):
            options.append(DecisionOption(
                option_id=str(uuid4()),
                decision_type=DecisionType.INVESTIGATION_TERRAIN,
                description=(
                    "Envoyer une equipe d'investigation sur le terrain "
                    "pour confirmer les observations satellite."
                ),
                estimated_cost=2000.0,
                estimated_time_hours=48.0,
                success_probability=0.85,
                risk_level=0.25,
                resources_required=["field_team", "transport", "equipment"],
            ))

        # Option 3 : Escalade aux autorites
        if urgency in (UrgencyLevel.HIGH, UrgencyLevel.CRITICAL):
            options.append(DecisionOption(
                option_id=str(uuid4()),
                decision_type=DecisionType.ESCALADE_AUTORITES,
                description=(
                    "Signaler le site aux autorites minieres et "
                    "forces de l'ordre pour intervention."
                ),
                estimated_cost=1000.0,
                estimated_time_hours=72.0,
                success_probability=0.75,
                risk_level=0.30,
                resources_required=["admin_liaison", "legal_documentation"],
            ))

        # Option 4 : Intervention programmee
        if urgency in (UrgencyLevel.HIGH, UrgencyLevel.CRITICAL):
            options.append(DecisionOption(
                option_id=str(uuid4()),
                decision_type=DecisionType.INTERVENTION_PROGRAMMEE,
                description=(
                    "Planifier une intervention coordonnee avec les "
                    "forces de l'ordre dans les 7 jours."
                ),
                estimated_cost=5000.0,
                estimated_time_hours=168.0,
                success_probability=0.80,
                risk_level=0.40,
                resources_required=[
                    "field_team", "law_enforcement", "legal_docs", "transport",
                ],
            ))

        # Option 5 : Intervention immediate
        if urgency == UrgencyLevel.CRITICAL:
            options.append(DecisionOption(
                option_id=str(uuid4()),
                decision_type=DecisionType.INTERVENTION_IMMEDIATE,
                description=(
                    "Declencher une intervention d'urgence immediate "
                    "en raison de la criticite de la situation."
                ),
                estimated_cost=10000.0,
                estimated_time_hours=12.0,
                success_probability=0.90,
                risk_level=0.50,
                resources_required=[
                    "rapid_response_team", "law_enforcement",
                    "helicopter", "medical_team",
                ],
            ))

        # Option 6 : Alerte communaute
        if assessment.situation_type == SituationType.WATER_CONTAMINATION:
            options.append(DecisionOption(
                option_id=str(uuid4()),
                decision_type=DecisionType.ALERTE_COMMUNAUTE,
                description=(
                    "Alerter les communautes en aval du risque de "
                    "contamination de l'eau."
                ),
                estimated_cost=300.0,
                estimated_time_hours=4.0,
                success_probability=0.95,
                risk_level=0.05,
                resources_required=["community_liaison", "sms_gateway"],
            ))

        # Phase 3 : Optimisation multi-criteres
        for option in options:
            option.multi_criteria_score = self._compute_multi_criteria_score(
                option, assessment
            )

        # Trier par score decroissant
        options.sort(key=lambda o: o.multi_criteria_score, reverse=True)

        logger.info(
            "options.generated",
            situation_id=assessment.situation_id,
            count=len(options),
            best_option=options[0].decision_type.value if options else "none",
        )

        return options

    # -----------------------------------------------------------------
    # Phase 3 : Optimisation multi-criteres
    # -----------------------------------------------------------------

    def _compute_multi_criteria_score(
        self,
        option: DecisionOption,
        assessment: SituationAssessment,
    ) -> float:
        """
        Calculer le score multi-criteres pour une option de decision.

        Criteres ponderes :
            - success_probability (30%)
            - cost_efficiency (20%)
            - time_efficiency (15%)
            - risk_minimization (20%)
            - resource_availability (15%)
        """
        # Probabilite de succes (0-1)
        success_score = option.success_probability

        # Efficacite cout (inverse normalise)
        max_cost = 15000.0
        cost_score = max(0, 1.0 - option.estimated_cost / max_cost)

        # Efficacite temps (inverse normalise)
        max_time = 200.0
        time_score = max(0, 1.0 - option.estimated_time_hours / max_time)

        # Minimisation du risque (inverse)
        risk_score = max(0, 1.0 - option.risk_level)

        # Disponibilite des ressources (heuristique)
        resource_score = max(0, 1.0 - len(option.resources_required) * 0.15)

        # Bonus d'adequation a l'urgence
        urgency_bonus = 0.0
        if assessment.urgency == UrgencyLevel.CRITICAL:
            if option.decision_type in (
                DecisionType.INTERVENTION_IMMEDIATE,
                DecisionType.DEMANTELEMENT,
            ):
                urgency_bonus = 0.15
        elif assessment.urgency == UrgencyLevel.HIGH:
            if option.decision_type in (
                DecisionType.ESCALADE_AUTORITES,
                DecisionType.INTERVENTION_PROGRAMMEE,
            ):
                urgency_bonus = 0.10

        # Score final pondere
        score = (
            success_score * CRITERIA_WEIGHTS["success_probability"]
            + cost_score * CRITERIA_WEIGHTS["cost_efficiency"]
            + time_score * CRITERIA_WEIGHTS["time_efficiency"]
            + risk_score * CRITERIA_WEIGHTS["risk_minimization"]
            + resource_score * CRITERIA_WEIGHTS["resource_availability"]
            + urgency_bonus
        )

        return round(min(score, 1.0), 4)

    # -----------------------------------------------------------------
    # Phase 4 : Prise de decision
    # -----------------------------------------------------------------

    def make_decision(
        self,
        assessment: SituationAssessment,
        options: list[DecisionOption],
        site_id: str = "",
    ) -> Decision:
        """
        Prendre la decision finale en selectionnant la meilleure option.

        Parametres
        ----------
        assessment : SituationAssessment
            Evaluation de la situation.
        options : list[DecisionOption]
            Options generees et triees par score.
        site_id : str
            Identifiant du site concerne.

        Retourne
        --------
        decision : Decision
        """
        if not options:
            logger.warning(
                "decision.no_options",
                situation_id=assessment.situation_id,
            )
            return Decision(
                decision_id=str(uuid4()),
                situation_id=assessment.situation_id,
                site_id=site_id,
                status=DecisionStatus.REJECTED,
                rationale="Aucune option de decision disponible.",
                decided_at=datetime.now(timezone.utc).isoformat(),
            )

        best_option = options[0]
        alternatives = options[1:]

        # Generer la justification
        rationale = (
            f"Decision {best_option.decision_type.value} selectionnee "
            f"avec un score multi-criteres de {best_option.multi_criteria_score:.3f}. "
            f"Situation classifiee comme {assessment.situation_type.value} "
            f"avec urgence {assessment.urgency.value} "
            f"(criticite={assessment.criticality_score}, "
            f"impact={assessment.impact_score}, "
            f"tendance={assessment.trend_score})."
        )

        decision = Decision(
            decision_id=str(uuid4()),
            situation_id=assessment.situation_id,
            site_id=site_id,
            chosen_option=best_option,
            alternatives=alternatives,
            status=DecisionStatus.PROPOSED,
            rationale=rationale,
            decided_at=datetime.now(timezone.utc).isoformat(),
            decided_by="system",
            metadata={
                "assessment_overall": assessment.overall_score,
                "urgency": assessment.urgency.value,
                "situation_type": assessment.situation_type.value,
                "options_count": len(options),
            },
        )

        self._decisions_history.append(decision)

        logger.info(
            "decision.made",
            decision_id=decision.decision_id,
            decision_type=best_option.decision_type.value,
            score=best_option.multi_criteria_score,
            urgency=assessment.urgency.value,
        )

        return decision

    # -----------------------------------------------------------------
    # Pipeline complet
    # -----------------------------------------------------------------

    def evaluate_and_decide(
        self,
        site_data: dict,
        alerts: list[dict] | None = None,
        sensor_data: dict | None = None,
        site_id: str = "",
    ) -> Decision:
        """
        Executer le pipeline complet d'evaluation et de decision.

        Phase 1 → Phase 2 → Phase 3 → Phase 4.
        """
        # Phase 1 : Evaluation
        assessment = self.assess_situation(site_data, alerts, sensor_data)

        # Phase 2 + 3 : Generation et optimisation
        options = self.generate_options(assessment)

        # Phase 4 : Decision
        decision = self.make_decision(assessment, options, site_id)

        return decision

    # -----------------------------------------------------------------
    # Historique
    # -----------------------------------------------------------------

    def get_history(
        self,
        limit: int = 50,
        site_id: str | None = None,
    ) -> list[dict]:
        """Retourner l'historique des decisions."""
        history = self._decisions_history

        if site_id:
            history = [d for d in history if d.site_id == site_id]

        history = sorted(
            history,
            key=lambda d: d.decided_at,
            reverse=True,
        )[:limit]

        return [
            {
                "decision_id": d.decision_id,
                "situation_id": d.situation_id,
                "site_id": d.site_id,
                "decision_type": (
                    d.chosen_option.decision_type.value
                    if d.chosen_option else "NONE"
                ),
                "status": d.status.value,
                "rationale": d.rationale,
                "decided_at": d.decided_at,
                "decided_by": d.decided_by,
                "metadata": d.metadata,
            }
            for d in history
        ]


# ---------------------------------------------------------------------------
# Instance singleton
# ---------------------------------------------------------------------------

_engine: DecisionEngine | None = None


def get_decision_engine() -> DecisionEngine:
    """Obtenir l'instance singleton du moteur de decision."""
    global _engine
    if _engine is None:
        _engine = DecisionEngine()
    return _engine
