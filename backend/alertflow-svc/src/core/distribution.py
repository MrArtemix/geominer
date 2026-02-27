"""
DistributionSystem — Systeme de distribution de requetes et load balancing.

Composants :
    - RequestType : types de requetes (IMAGE_ANALYSIS, REAL_TIME_DETECTION, etc.)
    - ServerNode : noeud serveur avec metriques de charge
    - DistributionSystem : routing intelligent avec cache et circuit breaker
    - AdaptiveLoadBalancer : load balancer avec apprentissage par feedback

Auteur : Ge O'Miner / AlertFlow
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import structlog

logger = structlog.get_logger(service="alertflow-svc", module="distribution")


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class RequestType(str, Enum):
    """Types de requetes pour le routing."""
    IMAGE_ANALYSIS = "IMAGE_ANALYSIS"
    REAL_TIME_DETECTION = "REAL_TIME_DETECTION"
    BATCH_PROCESSING = "BATCH_PROCESSING"
    DATABASE_QUERY = "DATABASE_QUERY"
    GEO_SPATIAL = "GEO_SPATIAL"
    MACHINE_LEARNING = "MACHINE_LEARNING"


class NodeStatus(str, Enum):
    """Statut d'un noeud serveur."""
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    UNHEALTHY = "UNHEALTHY"
    CIRCUIT_OPEN = "CIRCUIT_OPEN"


# ---------------------------------------------------------------------------
# Timeouts adaptatifs par priorite
# ---------------------------------------------------------------------------

PRIORITY_TIMEOUTS: dict[str, float] = {
    "CRITICAL": 5.0,
    "HIGH": 10.0,
    "MEDIUM": 30.0,
    "LOW": 60.0,
}

# Retry configuration
MAX_RETRIES: int = 3
RETRY_BASE_DELAY: float = 1.0  # secondes
RETRY_MAX_DELAY: float = 30.0  # secondes

# Circuit breaker
CIRCUIT_FAILURE_THRESHOLD: int = 5
CIRCUIT_RECOVERY_TIMEOUT: float = 60.0  # secondes


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class ServerNode:
    """Noeud serveur avec metriques de charge."""
    node_id: str
    host: str
    port: int
    service_name: str
    status: NodeStatus = NodeStatus.HEALTHY
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    active_connections: int = 0
    max_connections: int = 100
    avg_response_time_ms: float = 0.0
    request_count: int = 0
    error_count: int = 0
    last_health_check: float = 0.0
    capabilities: list[str] = field(default_factory=list)
    weight: float = 1.0
    # Circuit breaker
    consecutive_failures: int = 0
    circuit_opened_at: float = 0.0

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"

    @property
    def load_score(self) -> float:
        """Score de charge (0-1, plus bas = moins charge)."""
        cpu_factor = self.cpu_usage / 100.0
        mem_factor = self.memory_usage / 100.0
        conn_factor = self.active_connections / max(self.max_connections, 1)
        return (cpu_factor * 0.4 + mem_factor * 0.3 + conn_factor * 0.3)

    @property
    def is_available(self) -> bool:
        """Verifier si le noeud est disponible pour recevoir des requetes."""
        if self.status == NodeStatus.CIRCUIT_OPEN:
            # Verifier si le timeout de recovery est ecoule
            if time.time() - self.circuit_opened_at > CIRCUIT_RECOVERY_TIMEOUT:
                self.status = NodeStatus.DEGRADED
                self.consecutive_failures = 0
                return True
            return False
        return self.status in (NodeStatus.HEALTHY, NodeStatus.DEGRADED)

    @property
    def error_rate(self) -> float:
        """Taux d'erreur (0-1)."""
        if self.request_count == 0:
            return 0.0
        return self.error_count / self.request_count


@dataclass
class RouteResult:
    """Resultat du routing d'une requete."""
    node: ServerNode
    request_type: RequestType
    priority: str
    timeout: float
    attempt: int = 1
    cached: bool = False


# ---------------------------------------------------------------------------
# DistributionSystem
# ---------------------------------------------------------------------------

class DistributionSystem:
    """
    Systeme de distribution de requetes avec :
        - Routing intelligent base sur le type de requete
        - Cache de routes recentes
        - Circuit breaker par noeud
    """

    def __init__(self) -> None:
        self._nodes: dict[str, ServerNode] = {}
        self._route_cache: dict[str, RouteResult] = {}
        self._cache_ttl: float = 30.0  # secondes
        self._cache_timestamps: dict[str, float] = {}

        # Mapping type de requete → services capables
        self._service_routing: dict[RequestType, list[str]] = {
            RequestType.IMAGE_ANALYSIS: ["minespotai-svc"],
            RequestType.REAL_TIME_DETECTION: ["minespotai-svc"],
            RequestType.BATCH_PROCESSING: ["minespotai-svc", "pipeline-svc"],
            RequestType.DATABASE_QUERY: ["api-gateway"],
            RequestType.GEO_SPATIAL: ["minespotai-svc", "api-gateway"],
            RequestType.MACHINE_LEARNING: ["minespotai-svc"],
        }

    def register_node(self, node: ServerNode) -> None:
        """Enregistrer un noeud serveur."""
        self._nodes[node.node_id] = node
        logger.info(
            "node.registered",
            node_id=node.node_id,
            service=node.service_name,
            url=node.url,
        )

    def unregister_node(self, node_id: str) -> None:
        """Retirer un noeud serveur."""
        if node_id in self._nodes:
            del self._nodes[node_id]
            logger.info("node.unregistered", node_id=node_id)

    def route_request(
        self,
        request_type: RequestType,
        priority: str = "MEDIUM",
    ) -> RouteResult | None:
        """
        Router une requete vers le meilleur noeud disponible.

        Parametres
        ----------
        request_type : RequestType
            Type de requete a router.
        priority : str
            Priorite de la requete (CRITICAL, HIGH, MEDIUM, LOW).

        Retourne
        --------
        result : RouteResult | None
            Resultat du routing, ou None si aucun noeud disponible.
        """
        # Verifier le cache
        cache_key = f"{request_type.value}:{priority}"
        if cache_key in self._route_cache:
            ts = self._cache_timestamps.get(cache_key, 0)
            if time.time() - ts < self._cache_ttl:
                cached_result = self._route_cache[cache_key]
                if cached_result.node.is_available:
                    cached_result.cached = True
                    return cached_result

        # Trouver les services compatibles
        compatible_services = self._service_routing.get(request_type, [])
        if not compatible_services:
            logger.warning(
                "routing.no_compatible_service",
                request_type=request_type.value,
            )
            return None

        # Filtrer les noeuds disponibles et compatibles
        available_nodes = [
            node for node in self._nodes.values()
            if node.is_available
            and node.service_name in compatible_services
        ]

        if not available_nodes:
            logger.warning(
                "routing.no_available_nodes",
                request_type=request_type.value,
                compatible_services=compatible_services,
            )
            return None

        # Selectionner le meilleur noeud (lowest load score)
        best_node = min(available_nodes, key=lambda n: n.load_score)

        # Timeout adaptatif par priorite
        timeout = PRIORITY_TIMEOUTS.get(priority, 30.0)

        result = RouteResult(
            node=best_node,
            request_type=request_type,
            priority=priority,
            timeout=timeout,
        )

        # Mettre en cache
        self._route_cache[cache_key] = result
        self._cache_timestamps[cache_key] = time.time()

        logger.info(
            "request.routed",
            node_id=best_node.node_id,
            request_type=request_type.value,
            load_score=best_node.load_score,
        )

        return result

    def report_success(self, node_id: str, response_time_ms: float) -> None:
        """Rapporter le succes d'une requete pour mise a jour des metriques."""
        node = self._nodes.get(node_id)
        if not node:
            return

        node.request_count += 1
        node.consecutive_failures = 0

        # Moyenne mobile exponentielle du temps de reponse
        alpha = 0.3
        node.avg_response_time_ms = (
            alpha * response_time_ms
            + (1 - alpha) * node.avg_response_time_ms
        )

        if node.status == NodeStatus.DEGRADED:
            node.status = NodeStatus.HEALTHY

    def report_failure(self, node_id: str) -> None:
        """Rapporter l'echec d'une requete et activer le circuit breaker si necessaire."""
        node = self._nodes.get(node_id)
        if not node:
            return

        node.request_count += 1
        node.error_count += 1
        node.consecutive_failures += 1

        if node.consecutive_failures >= CIRCUIT_FAILURE_THRESHOLD:
            node.status = NodeStatus.CIRCUIT_OPEN
            node.circuit_opened_at = time.time()
            logger.warning(
                "circuit_breaker.opened",
                node_id=node_id,
                failures=node.consecutive_failures,
            )

    def get_nodes_status(self) -> list[dict]:
        """Retourner le statut de tous les noeuds."""
        return [
            {
                "node_id": node.node_id,
                "service": node.service_name,
                "url": node.url,
                "status": node.status.value,
                "load_score": round(node.load_score, 4),
                "cpu_usage": node.cpu_usage,
                "memory_usage": node.memory_usage,
                "active_connections": node.active_connections,
                "avg_response_time_ms": round(node.avg_response_time_ms, 2),
                "error_rate": round(node.error_rate, 4),
                "is_available": node.is_available,
            }
            for node in self._nodes.values()
        ]


# ---------------------------------------------------------------------------
# AdaptiveLoadBalancer
# ---------------------------------------------------------------------------

class AdaptiveLoadBalancer:
    """
    Load balancer adaptatif avec apprentissage par feedback.

    Ajuste les poids des noeuds en fonction des performances
    observees (temps de reponse, erreurs) via un facteur de
    feedback exponentiel.
    """

    def __init__(self, distribution: DistributionSystem) -> None:
        self._distribution = distribution
        self._feedback_history: list[dict] = []
        self._learning_rate: float = 0.1

    def select_node(
        self,
        request_type: RequestType,
        priority: str = "MEDIUM",
    ) -> RouteResult | None:
        """
        Selectionner le meilleur noeud en combinant le score de charge
        et les poids adaptatifs.
        """
        result = self._distribution.route_request(request_type, priority)
        if result:
            result.node.active_connections += 1
        return result

    def release_node(self, node_id: str) -> None:
        """Liberer une connexion sur un noeud."""
        nodes = self._distribution._nodes
        if node_id in nodes:
            nodes[node_id].active_connections = max(
                0, nodes[node_id].active_connections - 1
            )

    def record_feedback(
        self,
        node_id: str,
        success: bool,
        response_time_ms: float,
        request_type: RequestType,
    ) -> None:
        """
        Enregistrer le feedback d'une requete et ajuster les poids.

        Parametres
        ----------
        node_id : str
            Identifiant du noeud.
        success : bool
            Si la requete a reussi.
        response_time_ms : float
            Temps de reponse en millisecondes.
        request_type : RequestType
            Type de requete.
        """
        if success:
            self._distribution.report_success(node_id, response_time_ms)
        else:
            self._distribution.report_failure(node_id)

        self.release_node(node_id)

        # Ajuster le poids du noeud
        node = self._distribution._nodes.get(node_id)
        if node:
            if success:
                # Augmenter le poids pour les noeuds performants
                perf_factor = max(0.5, 1.0 - response_time_ms / 5000.0)
                node.weight = min(
                    2.0,
                    node.weight + self._learning_rate * perf_factor,
                )
            else:
                # Diminuer le poids pour les noeuds en erreur
                node.weight = max(
                    0.1,
                    node.weight - self._learning_rate * 2,
                )

        # Garder l'historique (borne)
        self._feedback_history.append({
            "node_id": node_id,
            "success": success,
            "response_time_ms": response_time_ms,
            "request_type": request_type.value,
            "timestamp": time.time(),
        })
        if len(self._feedback_history) > 10000:
            self._feedback_history = self._feedback_history[-5000:]

    async def execute_with_retry(
        self,
        request_type: RequestType,
        priority: str,
        execute_fn: Any,
    ) -> Any:
        """
        Executer une requete avec retry exponentiel.

        Parametres
        ----------
        request_type : RequestType
            Type de requete.
        priority : str
            Priorite.
        execute_fn : callable(node_url: str, timeout: float) -> result
            Fonction asynchrone a executer.

        Retourne
        --------
        result : Any
            Resultat de l'execution.

        Raises
        ------
        RuntimeError
            Si toutes les tentatives echouent.
        """
        last_error = None

        for attempt in range(1, MAX_RETRIES + 1):
            route = self.select_node(request_type, priority)
            if route is None:
                raise RuntimeError(
                    f"Aucun noeud disponible pour {request_type.value}"
                )

            node_id = route.node.node_id
            start = time.time()

            try:
                result = await execute_fn(route.node.url, route.timeout)
                elapsed_ms = (time.time() - start) * 1000
                self.record_feedback(
                    node_id, True, elapsed_ms, request_type
                )
                return result

            except Exception as e:
                elapsed_ms = (time.time() - start) * 1000
                self.record_feedback(
                    node_id, False, elapsed_ms, request_type
                )
                last_error = e

                # Retry avec backoff exponentiel
                if attempt < MAX_RETRIES:
                    delay = min(
                        RETRY_BASE_DELAY * (2 ** (attempt - 1)),
                        RETRY_MAX_DELAY,
                    )
                    logger.warning(
                        "request.retry",
                        attempt=attempt,
                        delay=delay,
                        error=str(e)[:200],
                    )
                    await asyncio.sleep(delay)

        raise RuntimeError(
            f"Echec apres {MAX_RETRIES} tentatives : {last_error}"
        )

    def get_stats(self) -> dict:
        """Retourner les statistiques du load balancer."""
        total = len(self._feedback_history)
        successes = sum(1 for f in self._feedback_history if f["success"])
        avg_rt = 0.0
        if total > 0:
            avg_rt = sum(
                f["response_time_ms"] for f in self._feedback_history
            ) / total

        return {
            "total_requests": total,
            "success_rate": round(successes / max(total, 1), 4),
            "avg_response_time_ms": round(avg_rt, 2),
            "nodes": self._distribution.get_nodes_status(),
        }


# ---------------------------------------------------------------------------
# Instances singleton
# ---------------------------------------------------------------------------

_distribution: DistributionSystem | None = None
_balancer: AdaptiveLoadBalancer | None = None


def get_distribution_system() -> DistributionSystem:
    """Obtenir l'instance singleton du systeme de distribution."""
    global _distribution
    if _distribution is None:
        _distribution = DistributionSystem()
        _register_default_nodes(_distribution)
    return _distribution


def get_load_balancer() -> AdaptiveLoadBalancer:
    """Obtenir l'instance singleton du load balancer adaptatif."""
    global _balancer
    if _balancer is None:
        _balancer = AdaptiveLoadBalancer(get_distribution_system())
    return _balancer


def _register_default_nodes(dist: DistributionSystem) -> None:
    """Enregistrer les noeuds par defaut depuis la configuration."""
    default_nodes = [
        ServerNode(
            node_id="minespotai-1",
            host=os.getenv("MINESPOTAI_HOST", "minespotai-svc"),
            port=int(os.getenv("MINESPOTAI_PORT", "8001")),
            service_name="minespotai-svc",
            capabilities=["image_analysis", "ml_inference", "geo_spatial"],
        ),
        ServerNode(
            node_id="api-gateway-1",
            host=os.getenv("API_GATEWAY_HOST", "api-gateway"),
            port=int(os.getenv("API_GATEWAY_PORT", "8000")),
            service_name="api-gateway",
            capabilities=["database_query", "geo_spatial"],
        ),
        ServerNode(
            node_id="pipeline-1",
            host=os.getenv("PIPELINE_HOST", "pipeline-svc"),
            port=int(os.getenv("PIPELINE_PORT", "8010")),
            service_name="pipeline-svc",
            capabilities=["batch_processing"],
        ),
    ]

    for node in default_nodes:
        dist.register_node(node)
