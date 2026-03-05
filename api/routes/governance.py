"""
Governance router — stats e indicadores de SLA.

Prefix : /api/governance
"""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from deps import get_current_user, get_db
from orm_models import MaterialRequestORM, RequestHistoryORM

router = APIRouter(prefix="/api/governance", tags=["Governance"])


@router.get(
    "/stats",
    summary="Estatísticas de governança e SLA",
)
def get_governance_stats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Retorna indicadores: em andamento, atrasadas, taxa de rejeição,
    tempo médio de ciclo e SLA por etapa.
    Filtrado por tenant (RLS) e por role (ADMIN/MASTER: tudo; SOLICITANTE: próprias; etapa: status).
    """
    base = db.query(MaterialRequestORM)
    role_name = current_user.role.name.upper() if (current_user and current_user.role) else ""
    role_type = current_user.role.role_type if (current_user and current_user.role) else "sistema"
    is_master = (
        role_name == "MASTER"
        or (current_user and getattr(current_user, "is_master", False))
    )
    if is_master or role_name == "ADMIN":
        pass  # vê tudo
    elif role_name == "SOLICITANTE":
        base = base.filter(MaterialRequestORM.user_id == current_user.id)
    elif role_type in ("etapa", "operacional") and role_name:
        base = base.filter(func.lower(MaterialRequestORM.status) == role_name.lower())
    total = base.count()

    status_finalizado = func.lower(MaterialRequestORM.status) == "finalizado"
    status_rejeitado = func.lower(MaterialRequestORM.status) == "rejeitado"
    aberto = ~status_finalizado & ~status_rejeitado

    em_andamento = base.filter(aberto).count()

    cinco_dias_atras = datetime.now(timezone.utc) - timedelta(days=5)
    atrasadas = base.filter(
        aberto,
        MaterialRequestORM.created_at < cinco_dias_atras,
    ).count()

    rejeitadas = base.filter(status_rejeitado).count()
    taxa_rejeicao = round((rejeitadas / total * 100), 1) if total > 0 else 0.0

    finalizadas = base.filter(status_finalizado).all()
    dias_ciclo: list[float] = []
    for r in finalizadas:
        last_evt = (
            db.query(RequestHistoryORM)
            .filter(RequestHistoryORM.request_id == r.id)
            .order_by(RequestHistoryORM.created_at.desc())
            .first()
        )
        end_time = last_evt.created_at if last_evt else r.created_at
        if r.created_at and end_time:
            delta = end_time - r.created_at
            dias_ciclo.append(delta.total_seconds() / 86400)
    tempo_medio = round(sum(dias_ciclo) / len(dias_ciclo), 1) if dias_ciclo else 0.0

    status_keys = ["cadastro", "compras", "mrp", "fiscal", "contabilidade"]
    sla_por_etapa: dict[str, float] = {}
    for status in status_keys:
        rows = base.filter(func.lower(MaterialRequestORM.status) == status).all()
        if rows:
            dias_etapa: list[float] = []
            for r in rows:
                last_evt = (
                    db.query(RequestHistoryORM)
                    .filter(RequestHistoryORM.request_id == r.id)
                    .order_by(RequestHistoryORM.created_at.desc())
                    .first()
                )
                end_time = last_evt.created_at if last_evt else r.created_at
                if r.created_at and end_time:
                    delta = end_time - r.created_at
                    dias_etapa.append(delta.total_seconds() / 86400)
            sla_por_etapa[status] = round(sum(dias_etapa) / len(dias_etapa), 1) if dias_etapa else 0.0
        else:
            sla_por_etapa[status] = 0.0

    return {
        "total": total,
        "em_andamento": em_andamento,
        "atrasadas": atrasadas,
        "taxa_rejeicao": taxa_rejeicao,
        "tempo_medio_ciclo": tempo_medio,
        "sla_por_etapa": sla_por_etapa,
    }
