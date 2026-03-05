"""
Dashboard router — v1.9

Prefix : /api/dashboard
Tags   : ["Dashboard"]

Endpoints
─────────────────────────────────────────────────────────────────────────────
  GET  /api/dashboard/stats   Aggregated KPIs for the home screen (role-filtered)
"""

from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from deps import get_current_user_optional, get_db
from orm_models import MaterialRequestORM, PDMOrm, UserORM

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
    "mrp":        "MRP",
    "pendente":   "MRP",
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


# ─── Endpoint ──────────────────────────────────────────────────────────────────

@router.get(
    "/stats",
    summary="KPIs agregados para a tela de Início",
    response_description="Totais, agrupamentos por status/urgência e atividade recente",
)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: UserORM | None = Depends(get_current_user_optional),
):
    """
    Returns aggregated datasets for the home dashboard.

    When authenticated, data is filtered by role:
    - **ADMIN**       : all data
    - **SOLICITANTE** : requests created by the user (user_id match)
    - **TRIAGEM/FISCAL/MASTER/MRP** (role_type=etapa): status == role name

    When unauthenticated, returns all data (legacy behavior).

    Response includes: total_requests, by_status, by_urgency, recent_activities,
    pdm_count, user_count, section_title ("Atividade Recente" or "Minhas Solicitações").
    """
    # Build base query with optional role-based filter
    base = db.query(MaterialRequestORM)
    role_name = current_user.role.name.upper() if (current_user and current_user.role) else None
    role_type = current_user.role.role_type if (current_user and current_user.role) else None

    if role_name == "ADMIN":
        pass  # no filter
    elif role_name == "SOLICITANTE" and current_user:
        base = base.filter(MaterialRequestORM.user_id == current_user.id)
    elif role_type == "etapa" and current_user and current_user.role and role_name:
        base = base.filter(func.lower(MaterialRequestORM.status) == role_name.lower())

    # ── Total ──────────────────────────────────────────────────────────────────
    total: int = base.with_entities(func.count(MaterialRequestORM.id)).scalar() or 0

    # ── By status ──────────────────────────────────────────────────────────────
    status_rows = (
        base.with_entities(MaterialRequestORM.status, func.count(MaterialRequestORM.id))
        .group_by(MaterialRequestORM.status)
        .all()
    )
    merged: dict[str, int] = defaultdict(int)
    for raw_status, count in status_rows:
        merged[_canonical_status(raw_status)] += count
    by_status = [
        {"name": name, "value": val}
        for name, val in sorted(merged.items())
    ]

    # ── By urgency ─────────────────────────────────────────────────────────────
    urgency_rows = (
        base.with_entities(MaterialRequestORM.urgency, func.count(MaterialRequestORM.id))
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
        base.order_by(MaterialRequestORM.created_at.desc())
        .limit(5)
        .all()
    )
    recent_activities = [_recent_activity(r) for r in recent_rows]

    # ── PDMs and users (always total) ──────────────────────────────────────────
    pdm_count: int = db.query(func.count(PDMOrm.id)).scalar() or 0
    user_count: int = (
        db.query(func.count(UserORM.id)).filter(UserORM.is_active).scalar() or 0
    )

    section_title = (
        "Minha Fila" if role_type == "etapa"
        else "Minhas Solicitações" if role_name == "SOLICITANTE"
        else "Atividade Recente"
    )
    show_user_count = role_name == "ADMIN" if role_name else True  # unauthenticated: legacy (show all)

    return {
        "total_requests": total,
        "by_status": by_status,
        "by_urgency": by_urgency,
        "recent_activities": recent_activities,
        "pdm_count": pdm_count,
        "user_count": user_count,
        "section_title": section_title,
        "show_user_count": show_user_count,
    }
