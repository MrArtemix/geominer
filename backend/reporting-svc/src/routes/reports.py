"""
Routes de generation de rapports et indicateurs Ge O'Miner.

Metriques de synthese, generation de PDF, contribution aux ODD
(Objectifs de Developpement Durable), et exports CSV.
"""

from __future__ import annotations

import io
import uuid
from datetime import datetime, timedelta, timezone

import matplotlib
matplotlib.use("Agg")  # Backend non-interactif pour la generation de graphiques
import matplotlib.pyplot as plt
import pandas as pd
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle
from sqlalchemy import text
from sqlalchemy.orm import Session

from src.config import settings
from src.main import get_db, minio_client

logger = structlog.get_logger("reporting.reports")

router = APIRouter(prefix="/reports", tags=["rapports"])


# ---------------------------------------------------------------------------
# Schemas Pydantic
# ---------------------------------------------------------------------------

class SummaryMetrics(BaseModel):
    """Metriques de synthese pour le tableau de bord."""
    period_days: int
    total_sites: int
    active_sites: int
    dismantled_sites: int
    total_alerts: int
    critical_alerts: int
    gold_estim_ton: float
    formalized_miners: int


class PDFGenerationResponse(BaseModel):
    """Reponse apres generation d'un rapport PDF."""
    report_id: str
    filename: str
    presigned_url: str
    expires_in_seconds: int


class ODDContribution(BaseModel):
    """Score de contribution aux Objectifs de Developpement Durable."""
    odd_number: int
    odd_name: str
    score: float = Field(..., ge=0, le=100, description="Score de contribution (0-100)")
    description: str


class ODDReport(BaseModel):
    """Rapport complet de contribution aux ODD."""
    contributions: list[ODDContribution]
    overall_score: float
    computed_at: datetime


# ---------------------------------------------------------------------------
# Helpers - Requetes de metriques
# ---------------------------------------------------------------------------

def _compute_summary(db: Session, period_days: int) -> dict:
    """Calculer les metriques de synthese pour une periode donnee."""
    since = datetime.now(timezone.utc) - timedelta(days=period_days)

    # Statistiques des sites miniers
    sites_row = db.execute(
        text("""
            SELECT
                COUNT(*) AS total_sites,
                COUNT(*) FILTER (WHERE status = 'active') AS active_sites,
                COUNT(*) FILTER (WHERE status = 'dismantled') AS dismantled_sites
            FROM mining_sites
            WHERE created_at >= :since
        """),
        {"since": since},
    ).fetchone()

    # Statistiques des alertes
    alerts_row = db.execute(
        text("""
            SELECT
                COUNT(*) AS total_alerts,
                COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical_alerts
            FROM alerts
            WHERE created_at >= :since
        """),
        {"since": since},
    ).fetchone()

    # Estimation de la production d'or (en tonnes)
    gold_row = db.execute(
        text("""
            SELECT COALESCE(SUM(quantity_grams), 0) / 1000000.0 AS gold_estim_ton
            FROM gold_transactions
            WHERE created_at >= :since AND is_legal = true
        """),
        {"since": since},
    ).fetchone()

    # Nombre de mineurs formalises
    miners_row = db.execute(
        text("""
            SELECT COUNT(*) AS formalized_miners
            FROM miners_registry
            WHERE status = 'APPROVED' AND created_at >= :since
        """),
        {"since": since},
    ).fetchone()

    return {
        "period_days": period_days,
        "total_sites": sites_row.total_sites if sites_row else 0,
        "active_sites": sites_row.active_sites if sites_row else 0,
        "dismantled_sites": sites_row.dismantled_sites if sites_row else 0,
        "total_alerts": alerts_row.total_alerts if alerts_row else 0,
        "critical_alerts": alerts_row.critical_alerts if alerts_row else 0,
        "gold_estim_ton": round(float(gold_row.gold_estim_ton) if gold_row else 0.0, 4),
        "formalized_miners": miners_row.formalized_miners if miners_row else 0,
    }


def _parse_period(period: str) -> int:
    """Parser une chaine de periode (ex: '30d', '7d', '90d') en nombre de jours."""
    period = period.strip().lower()
    if period.endswith("d"):
        try:
            return int(period[:-1])
        except ValueError:
            pass
    raise HTTPException(
        status_code=400,
        detail=f"Format de periode invalide : '{period}'. Utiliser le format NNd (ex: 30d).",
    )


# ---------------------------------------------------------------------------
# GET /reports/summary - Metriques de synthese
# ---------------------------------------------------------------------------

@router.get("/summary", response_model=SummaryMetrics)
async def get_summary(
    period: str = Query("30d", description="Periode de calcul (ex: 7d, 30d, 90d)"),
    db: Session = Depends(get_db),
):
    """
    Obtenir les metriques de synthese pour le tableau de bord.

    Retourne le nombre de sites, alertes, estimation de production d'or
    et le nombre de mineurs formalises pour la periode specifiee.
    """
    period_days = _parse_period(period)
    metrics = _compute_summary(db, period_days)

    logger.info("metriques_synthese_calculees", period_days=period_days)

    return SummaryMetrics(**metrics)


# ---------------------------------------------------------------------------
# POST /reports/generate/pdf - Generation de rapport PDF
# ---------------------------------------------------------------------------

@router.post("/generate/pdf", response_model=PDFGenerationResponse)
async def generate_pdf_report(
    period: str = Query("30d", description="Periode du rapport"),
    db: Session = Depends(get_db),
):
    """
    Generer un rapport PDF complet avec KPIs et graphiques.

    Le PDF contient :
    - Titre et date de generation
    - Tableau des indicateurs cles de performance (KPIs)
    - Graphique en barres : sites par statut
    - Graphique en ligne : tendance mensuelle des detections

    Le rapport est stocke dans MinIO et une URL pre-signee est retournee.
    """
    period_days = _parse_period(period)
    metrics = _compute_summary(db, period_days)
    now = datetime.now(timezone.utc)
    report_id = str(uuid.uuid4())[:8]
    filename = f"rapport_geominer_{now.strftime('%Y%m%d_%H%M%S')}_{report_id}.pdf"

    # --- Creation du PDF avec ReportLab ---
    pdf_buffer = io.BytesIO()
    c = canvas.Canvas(pdf_buffer, pagesize=A4)
    width, height = A4

    # Titre
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(width / 2, height - 3 * cm, "Rapport Ge O'Miner")

    # Sous-titre avec date et periode
    c.setFont("Helvetica", 12)
    c.drawCentredString(
        width / 2,
        height - 4 * cm,
        f"Genere le {now.strftime('%d/%m/%Y a %H:%M')} - Periode : {period_days} jours",
    )

    # Ligne de separation
    c.setStrokeColor(colors.HexColor("#D4AF37"))  # Couleur or
    c.setLineWidth(2)
    c.line(2 * cm, height - 4.5 * cm, width - 2 * cm, height - 4.5 * cm)

    # Tableau des KPIs
    c.setFont("Helvetica-Bold", 14)
    c.drawString(2 * cm, height - 5.5 * cm, "Indicateurs Cles de Performance")

    table_data = [
        ["Indicateur", "Valeur"],
        ["Sites totaux", str(metrics["total_sites"])],
        ["Sites actifs", str(metrics["active_sites"])],
        ["Sites demantelees", str(metrics["dismantled_sites"])],
        ["Alertes totales", str(metrics["total_alerts"])],
        ["Alertes critiques", str(metrics["critical_alerts"])],
        ["Or estime (tonnes)", f"{metrics['gold_estim_ton']:.4f}"],
        ["Mineurs formalises", str(metrics["formalized_miners"])],
    ]

    table = Table(table_data, colWidths=[10 * cm, 5 * cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2C5530")),  # Vert emeraude fonce
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 11),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    table.wrapOn(c, width, height)
    table.drawOn(c, 2 * cm, height - 13 * cm)

    # --- Graphique 1 : Sites par statut (barres) ---
    fig1, ax1 = plt.subplots(figsize=(6, 3))
    statuts = ["Actifs", "Demantelees", "Autres"]
    autres = max(0, metrics["total_sites"] - metrics["active_sites"] - metrics["dismantled_sites"])
    valeurs = [metrics["active_sites"], metrics["dismantled_sites"], autres]
    couleurs_barres = ["#2C5530", "#8B4513", "#D4AF37"]  # Vert, brun, or

    ax1.bar(statuts, valeurs, color=couleurs_barres, edgecolor="black", linewidth=0.5)
    ax1.set_title("Sites par statut", fontsize=12, fontweight="bold")
    ax1.set_ylabel("Nombre de sites")
    for i, v in enumerate(valeurs):
        ax1.text(i, v + 0.3, str(v), ha="center", fontweight="bold")
    plt.tight_layout()

    chart1_buffer = io.BytesIO()
    fig1.savefig(chart1_buffer, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig1)
    chart1_buffer.seek(0)

    # Inserer le graphique 1 dans le PDF
    from reportlab.lib.utils import ImageReader
    img1 = ImageReader(chart1_buffer)
    c.drawImage(img1, 2 * cm, height - 22 * cm, width=14 * cm, height=7 * cm)

    # --- Graphique 2 : Tendance mensuelle des detections (ligne) ---
    # Recuperer les donnees mensuelles
    monthly_rows = db.execute(
        text("""
            SELECT
                DATE_TRUNC('month', created_at) AS mois,
                COUNT(*) AS nb_detections
            FROM mining_sites
            WHERE created_at >= :since
            GROUP BY DATE_TRUNC('month', created_at)
            ORDER BY mois
        """),
        {"since": now - timedelta(days=period_days)},
    ).fetchall()

    if monthly_rows:
        mois_labels = [r.mois.strftime("%b %Y") for r in monthly_rows]
        nb_detections = [r.nb_detections for r in monthly_rows]
    else:
        # Donnees par defaut si pas de resultats
        mois_labels = ["N/A"]
        nb_detections = [0]

    fig2, ax2 = plt.subplots(figsize=(6, 3))
    ax2.plot(
        mois_labels, nb_detections,
        marker="o", color="#D4AF37", linewidth=2,
        markerfacecolor="#2C5530", markeredgecolor="black", markersize=8,
    )
    ax2.set_title("Tendance mensuelle des detections", fontsize=12, fontweight="bold")
    ax2.set_ylabel("Detections")
    ax2.grid(True, alpha=0.3)
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()

    chart2_buffer = io.BytesIO()
    fig2.savefig(chart2_buffer, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig2)
    chart2_buffer.seek(0)

    # Nouvelle page pour le deuxieme graphique
    c.showPage()

    c.setFont("Helvetica-Bold", 14)
    c.drawString(2 * cm, height - 3 * cm, "Tendance Mensuelle des Detections")

    img2 = ImageReader(chart2_buffer)
    c.drawImage(img2, 2 * cm, height - 13 * cm, width=14 * cm, height=7 * cm)

    # Pied de page
    c.setFont("Helvetica-Oblique", 8)
    c.drawCentredString(
        width / 2, 2 * cm,
        f"Ge O'Miner - Rapport genere automatiquement le {now.strftime('%d/%m/%Y')} - Confidentiel",
    )

    c.save()
    pdf_buffer.seek(0)
    pdf_bytes = pdf_buffer.getvalue()

    # Stocker le PDF dans MinIO
    minio_client.put_object(
        bucket_name=settings.minio_bucket_reports,
        object_name=filename,
        data=io.BytesIO(pdf_bytes),
        length=len(pdf_bytes),
        content_type="application/pdf",
    )

    logger.info("rapport_pdf_genere", filename=filename, taille_octets=len(pdf_bytes))

    # Generer une URL pre-signee avec un TTL de 3600 secondes (1 heure)
    presigned_url = minio_client.presigned_get_object(
        bucket_name=settings.minio_bucket_reports,
        object_name=filename,
        expires=timedelta(seconds=3600),
    )

    return PDFGenerationResponse(
        report_id=report_id,
        filename=filename,
        presigned_url=presigned_url,
        expires_in_seconds=3600,
    )


# ---------------------------------------------------------------------------
# GET /reports/impact/ods - Contribution aux ODD
# ---------------------------------------------------------------------------

@router.get("/impact/ods", response_model=ODDReport)
async def get_odd_contributions(db: Session = Depends(get_db)):
    """
    Calculer les scores de contribution aux Objectifs de Developpement Durable.

    Objectifs evalues :
    - ODD 8  : Travail decent et croissance economique
    - ODD 10 : Inegalites reduites
    - ODD 12 : Consommation et production responsables
    - ODD 15 : Vie terrestre
    - ODD 16 : Paix, justice et institutions efficaces
    """
    # Recuperer les metriques necessaires pour le calcul
    # Nombre total de mineurs formalises
    miners_row = db.execute(
        text("SELECT COUNT(*) AS total FROM miners_registry WHERE status = 'APPROVED'")
    ).fetchone()
    total_formalized = miners_row.total if miners_row else 0

    # Nombre total de mineurs enregistres
    all_miners_row = db.execute(
        text("SELECT COUNT(*) AS total FROM miners_registry")
    ).fetchone()
    total_miners = all_miners_row.total if all_miners_row else 1  # Eviter division par zero

    # Sites demantelees
    sites_row = db.execute(
        text("""
            SELECT
                COUNT(*) AS total_sites,
                COUNT(*) FILTER (WHERE status = 'dismantled') AS dismantled_sites
            FROM mining_sites
        """)
    ).fetchone()
    total_sites = sites_row.total_sites if sites_row else 0
    dismantled_sites = sites_row.dismantled_sites if sites_row else 0

    # Alertes resolues
    alerts_row = db.execute(
        text("""
            SELECT
                COUNT(*) AS total_alerts,
                COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved_alerts
            FROM alerts
        """)
    ).fetchone()
    total_alerts = alerts_row.total_alerts if alerts_row else 0
    resolved_alerts = alerts_row.resolved_alerts if alerts_row else 0

    # Transactions legales vs totales
    tx_row = db.execute(
        text("""
            SELECT
                COUNT(*) AS total_tx,
                COUNT(*) FILTER (WHERE is_legal = true) AS legal_tx
            FROM gold_transactions
        """)
    ).fetchone()
    total_tx = tx_row.total_tx if tx_row else 0
    legal_tx = tx_row.legal_tx if tx_row else 0

    # --- Calcul des scores ODD (0-100) ---

    # ODD 8 : Travail decent - base sur le taux de formalisation des mineurs
    score_odd8 = min(100, round((total_formalized / max(total_miners, 1)) * 100, 1))

    # ODD 10 : Inegalites reduites - base sur l'acces equitable (formalized/total)
    score_odd10 = min(100, round((total_formalized / max(total_miners, 1)) * 90, 1))

    # ODD 12 : Production responsable - base sur le taux de transactions legales
    score_odd12 = min(100, round((legal_tx / max(total_tx, 1)) * 100, 1))

    # ODD 15 : Vie terrestre - base sur le taux de sites demantelees (remediation)
    score_odd15 = min(100, round((dismantled_sites / max(total_sites, 1)) * 100, 1))

    # ODD 16 : Paix et justice - base sur le taux de resolution des alertes
    score_odd16 = min(100, round((resolved_alerts / max(total_alerts, 1)) * 100, 1))

    contributions = [
        ODDContribution(
            odd_number=8,
            odd_name="Travail decent et croissance economique",
            score=score_odd8,
            description=(
                f"{total_formalized} mineurs formalises sur {total_miners} enregistres "
                f"({score_odd8}% de formalisation)."
            ),
        ),
        ODDContribution(
            odd_number=10,
            odd_name="Inegalites reduites",
            score=score_odd10,
            description=(
                f"Acces equitable a la formalisation : {score_odd10}% des mineurs "
                f"beneficient d'un statut legal."
            ),
        ),
        ODDContribution(
            odd_number=12,
            odd_name="Consommation et production responsables",
            score=score_odd12,
            description=(
                f"{legal_tx} transactions legales sur {total_tx} totales "
                f"({score_odd12}% de conformite)."
            ),
        ),
        ODDContribution(
            odd_number=15,
            odd_name="Vie terrestre",
            score=score_odd15,
            description=(
                f"{dismantled_sites} sites demantelees et remedies sur {total_sites} "
                f"({score_odd15}% de remediation)."
            ),
        ),
        ODDContribution(
            odd_number=16,
            odd_name="Paix, justice et institutions efficaces",
            score=score_odd16,
            description=(
                f"{resolved_alerts} alertes resolues sur {total_alerts} "
                f"({score_odd16}% de resolution)."
            ),
        ),
    ]

    # Score global (moyenne ponderee)
    scores = [c.score for c in contributions]
    overall_score = round(sum(scores) / len(scores), 1) if scores else 0.0

    logger.info(
        "indicateurs_odd_calcules",
        score_global=overall_score,
        odd_8=score_odd8,
        odd_10=score_odd10,
        odd_12=score_odd12,
        odd_15=score_odd15,
        odd_16=score_odd16,
    )

    return ODDReport(
        contributions=contributions,
        overall_score=overall_score,
        computed_at=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# GET /reports/export/csv - Export CSV des entites
# ---------------------------------------------------------------------------

@router.get("/export/csv")
async def export_csv(
    entity: str = Query(..., description="Entite a exporter : sites, alerts ou transactions"),
    db: Session = Depends(get_db),
):
    """
    Exporter les donnees d'une entite au format CSV.

    Entites disponibles :
    - sites : tous les sites miniers
    - alerts : toutes les alertes
    - transactions : toutes les transactions d'or
    """
    # Definir la requete SQL selon l'entite
    queries = {
        "sites": """
            SELECT id, site_code, name, status, latitude, longitude,
                   h3_index_r7, confidence, source, blockchain_txid,
                   created_at, updated_at
            FROM mining_sites
            ORDER BY created_at DESC
        """,
        "alerts": """
            SELECT id, type, severity, title, description,
                   status, created_at, resolved_at
            FROM alerts
            ORDER BY created_at DESC
        """,
        "transactions": """
            SELECT id, site_id, blockchain_txid, from_entity, to_entity,
                   quantity_grams, is_legal, created_at
            FROM gold_transactions
            ORDER BY created_at DESC
        """,
    }

    if entity not in queries:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Entite '{entity}' non reconnue. "
                f"Valeurs acceptees : sites, alerts, transactions."
            ),
        )

    # Executer la requete et convertir en DataFrame pandas
    rows = db.execute(text(queries[entity])).fetchall()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"Aucune donnee trouvee pour l'entite '{entity}'.",
        )

    # Convertir les resultats en DataFrame
    columns = rows[0]._fields if hasattr(rows[0], "_fields") else rows[0].keys()
    df = pd.DataFrame([dict(zip(columns, r)) for r in rows])

    # Generer le CSV en memoire
    csv_buffer = io.StringIO()
    df.to_csv(csv_buffer, index=False, encoding="utf-8")
    csv_buffer.seek(0)

    filename = f"export_{entity}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"

    logger.info("export_csv_genere", entite=entity, nb_lignes=len(df), filename=filename)

    return StreamingResponse(
        io.BytesIO(csv_buffer.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
