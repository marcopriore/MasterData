"""
Dashboard router — v1.9 / v2.0

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
from orm_models import MaterialRequestORM, WorkflowConfigORM

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

_URGENCY_LABELS = {
    "low":    "Baixa",
    "medium": "Média",
    "high":   "Alta",
}

# Fallback for legacy/unknown statuses not in WorkflowConfig
_LEGACY_CANONICAL: dict[str, str] = {
    "pending":    "Triagem",
    "approved":   "Finalizado",
    "rejected":   "Finalizado",
    "compras":    "Triagem",
}


def _build_status_canonical_map(db: Session) -> dict[str, str]:
    """
    Build a case-insensitive map from raw status → canonical display name
    using WorkflowConfig. Uses step_name as the canonical form (e.g. 'Fiscal')
    so the pie chart never shows duplicate slices for 'fiscal', 'FISCAL', etc.
    """
    rows = (
        db.query(WorkflowConfigORM.step_name, WorkflowConfigORM.status_key)
        .filter(WorkflowConfigORM.is_active == True)
        .distinct()
        .all()
    )
    m: dict[str, str] = dict(_LEGACY_CANONICAL)
    for step_name, status_key in rows:
        display = (step_name or "").strip() or (status_key or "").strip().title()
        if not display:
            continue
        for raw in (step_name, status_key):
            if raw is None:
                continue
            s = (raw or "").strip()
            if s:
                m[s.lower()] = display
    return m


def _canonical_status(raw: str, canonical_map: dict[str, str]) -> str:
    """Return the canonical display name for a status value."""
    key = (raw or "").strip().lower()
    return canonical_map.get(key, (raw or "").strip().title())


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
    # their canonical name (from WorkflowConfig) so the chart never shows
    # duplicate slices for 'fiscal', 'FISCAL', 'Fiscal', etc.
    canonical_map = _build_status_canonical_map(db)
    status_rows = (
        db.query(MaterialRequestORM.status, func.count(MaterialRequestORM.id))
        .group_by(MaterialRequestORM.status)
        .all()
    )
    merged: dict[str, int] = defaultdict(int)
    for raw_status, count in status_rows:
        merged[_canonical_status(raw_status, canonical_map)] += count
    by_status = [
        {"name": name, "value": cnt}
        for name, cnt in sorted(merged.items())
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
