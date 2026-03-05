"""Helpers para registro de eventos de auditoria."""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from deps import set_tenant_in_session
from orm_models import RequestHistoryORM, SystemLogORM


def log_request_event(
    db: Session,
    request_id: int,
    user_id: int | None,
    event_type: str,
    message: str,
    tenant_id: int,
    event_data: dict | None = None,
    stage: str | None = None,
    is_master: bool = False,
) -> None:
    set_tenant_in_session(db, tenant_id, is_master=is_master)
    entry = RequestHistoryORM(
        request_id=request_id,
        user_id=user_id,
        tenant_id=tenant_id,
        event_type=event_type,
        message=message,
        event_data=event_data,
        stage=stage,
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.commit()


def log_system_event(
    db: Session,
    user_id: int | None,
    category: str,
    action: str,
    description: str,
    tenant_id: int,
    event_data: dict | None = None,
    ip_address: str | None = None,
    is_master: bool = False,
) -> None:
    set_tenant_in_session(db, tenant_id, is_master=is_master)
    entry = SystemLogORM(
        user_id=user_id,
        tenant_id=tenant_id,
        category=category,
        action=action,
        description=description,
        event_data=event_data,
        ip_address=ip_address,
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.commit()
