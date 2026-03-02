"""
Dashboard router — v1.9

Prefix : /api/dashboard
Tags   : ["Dashboard"]

Endpoints
─────────────────────────────────────────────────────────────────────────────
  GET  /api/dashboard/stats   Aggregated KPIs for the home screen
"""

from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from deps import get_db
from orm_models import MaterialRequestORM

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

_URGENCY_LABELS = {
    "low":    "Baixa",
    "medium": "Média",
    "high":   "Alta",
}

# Canonical display name for any status that might exist in legacy data.
# Keys are lower-cased for case-insensitive lookup.
_STATUS_CANONICAL: dict[str, str] = {
    # English legacy → Portuguese canonical
    "pending":    "Triagem",
    "approved":   "Finalizado",
    "rejected":   "Finalizado",
    # Lowercase variants of workflow step names
    "triagem":    "Triagem",
    "fiscal":     "Fiscal",
    "master":     "Master",
    "pendente":   "Pendente",
    "finalizado": "Finalizado",
    "compras":    "Triagem",
}


def _canonical_status(raw: str) -> str:
    """Return the canonical display name for a status value.

    Falls back to title-casing the raw value so at least capitalisation is
    consistent for any new steps added to the workflow later.
    """
    return _STATUS_CANONICAL.get((raw or "").strip().lower(), (raw or "").strip().title())


def _recent_activity(row: MaterialRequestORM) -> dict:
    return {
        "id": row.id,
        "requester": row.requester,
        "cost_center": row.cost_center,
        "urgency": row.urgency,
        "status": row.status,
        "generated_description": row.generated_description,
        "pdm_id": row.pdm_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.get(
    "/stats",
    summary="KPIs agregados para a tela de Início",
    response_description="Totais, agrupamentos por status/urgência e atividade recente",
)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Returns four aggregated datasets consumed by the home dashboard:

    - **total_requests** – total row count in `material_requests`
    - **by_status**      – `[{ name, value }]` grouped by `status`
    - **by_urgency**     – `[{ name, value }]` grouped by `urgency`
    - **recent_activities** – last 5 requests ordered by `created_at DESC`
    """

    # ── Total ──────────────────────────────────────────────────────────────────
    total: int = db.query(func.count(MaterialRequestORM.id)).scalar() or 0

    # ── By status ──────────────────────────────────────────────────────────────
    # Fetch raw counts from the DB, then merge any case/spelling variants into
    # their canonical name so the chart never shows duplicate slices.
    status_rows = (
        db.query(MaterialRequestORM.status, func.count(MaterialRequestORM.id))
        .group_by(MaterialRequestORM.status)
        .all()
    )
    merged: dict[str, int] = defaultdict(int)
    for raw_status, count in status_rows:
        merged[_canonical_status(raw_status)] += count
    by_status = [
        {"name": name, "value": total}
        for name, total in sorted(merged.items())
    ]

    # ── By urgency ─────────────────────────────────────────────────────────────
    urgency_rows = (
        db.query(MaterialRequestORM.urgency, func.count(MaterialRequestORM.id))
        .group_by(MaterialRequestORM.urgency)
        .order_by(MaterialRequestORM.urgency)
        .all()
    )
    by_urgency = [
        {"name": _URGENCY_LABELS.get(u, u), "value": c}
        for u, c in urgency_rows
    ]

    # ── Recent activities ──────────────────────────────────────────────────────
    recent_rows = (
        db.query(MaterialRequestORM)
        .order_by(MaterialRequestORM.created_at.desc())
        .limit(5)
        .all()
    )
    recent_activities = [_recent_activity(r) for r in recent_rows]

    return {
        "total_requests": total,
        "by_status": by_status,
        "by_urgency": by_urgency,
        "recent_activities": recent_activities,
    }
