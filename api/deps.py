from typing import Annotated, Generator

from fastapi import Depends, Header
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from db import SessionLocal, SessionLocalAdmin
from orm_models import UserORM
from security import decode_access_token


def set_tenant_in_session(session: Session, tenant_id: int, is_master: bool = False) -> None:
    """Configura o contexto de tenant na sessão PostgreSQL para RLS."""
    if is_master and tenant_id == -1:
        # Master vendo tudo — bypass total do RLS
        session.execute(text("SET LOCAL app.is_master = 'true'"))
        session.execute(text("SET LOCAL app.tenant_id = '-1'"))
    else:
        # Qualquer usuário (inclusive master chaveado) vê apenas o tenant
        session.execute(text("SET LOCAL app.is_master = 'false'"))
        session.execute(text(f"SET LOCAL app.tenant_id = '{tenant_id}'"))


def get_db_for_tenant(
    tenant_id: int,
    is_master: bool = False,
) -> Generator[Session, None, None]:
    """Cria sessão de banco com tenant_id configurado para RLS."""
    db = SessionLocal()
    try:
        set_tenant_in_session(db, tenant_id, is_master)
        yield db
    finally:
        db.close()


def get_db_raw() -> Generator[Session, None, None]:
    """Sessão admin (postgres, sem RLS) — usada para auth (login, get_current_user)."""
    if SessionLocalAdmin is None:
        raise RuntimeError("DATABASE_URL não definido — SessionLocalAdmin indisponível")
    db = SessionLocalAdmin()
    try:
        yield db
    finally:
        db.close()


def get_current_user_optional(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db_raw),
) -> UserORM | None:
    """
    Extract and validate user from JWT in Authorization: Bearer <token>.
    Uses sessão sem RLS (get_db_raw) para buscar usuário por id.
    Returns UserORM if valid, None if missing/invalid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        return None
    user = (
        db.query(UserORM)
        .options(joinedload(UserORM.role), joinedload(UserORM.tenant))
        .filter(UserORM.id == user_id, UserORM.is_active)
        .first()
    )
    return user


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db_raw),
) -> UserORM:
    """
    Extract and validate user from JWT. Raises HTTP 401 if missing/invalid.
    Uses sessão sem RLS para buscar usuário.
    """
    from fastapi import HTTPException
    user = get_current_user_optional(authorization=authorization, db=db)
    if user is None:
        raise HTTPException(status_code=401, detail="Autenticação necessária")
    return user


def get_db(
    authorization: Annotated[str | None, Header()] = None,
    current_user: UserORM | None = Depends(get_current_user_optional),
) -> Generator[Session, None, None]:
    """
    Sessão com contexto de tenant para RLS.
    Se há usuário logado: aplica tenant_id e is_master conforme JWT (master_viewing).
    Se não há (ex: login): retorna sessão sem tenant (get_db_raw).
    """
    if current_user is None:
        yield from get_db_raw()
        return
    role_is_master = bool(current_user.role and (current_user.role.name or "").upper() == "MASTER")
    tenant_id = current_user.tenant_id
    is_master_bypass = False
    if authorization and authorization.startswith("Bearer "):
        payload = decode_access_token(authorization[7:].strip())
        if payload:
            jwt_tenant = payload.get("tenant_id")
            master_viewing = payload.get("master_viewing", False)
            jwt_is_master = payload.get("is_master", False)
            if jwt_is_master and master_viewing:
                tenant_id = jwt_tenant if jwt_tenant is not None else current_user.tenant_id
                is_master_bypass = False
            elif jwt_is_master and not master_viewing:
                tenant_id = -1
                is_master_bypass = True
            else:
                tenant_id = jwt_tenant if jwt_tenant is not None else current_user.tenant_id
                is_master_bypass = False
        else:
            is_master_bypass = role_is_master
            if role_is_master:
                tenant_id = -1
    else:
        is_master_bypass = role_is_master
        if role_is_master:
            tenant_id = -1
    yield from get_db_for_tenant(tenant_id=tenant_id, is_master=is_master_bypass)


def get_db_always_raw() -> Generator[Session, None, None]:
    """Sessão admin (postgres, sem RLS) — usado em auth, switch-tenant, tenants."""
    yield from get_db_raw()


def get_admin_user(
    current_user: UserORM = Depends(get_current_user),
) -> UserORM:
    """Require authenticated user with ADMIN role."""
    from fastapi import HTTPException
    if not current_user.role or current_user.role.name.upper() != "ADMIN":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
    return current_user


def get_user_with_standardize(
    current_user: UserORM = Depends(get_current_user),
) -> UserORM:
    """Require authenticated user with can_standardize permission."""
    from fastapi import HTTPException
    perms = current_user.role.permissions if current_user.role else {}
    if not perms.get("can_standardize", False):
        raise HTTPException(status_code=403, detail="Permissão can_standardize necessária")
    return current_user


def get_user_with_bulk_import(
    current_user: UserORM = Depends(get_current_user),
) -> UserORM:
    """Require authenticated user with can_bulk_import permission."""
    from fastapi import HTTPException
    perms = current_user.role.permissions if current_user.role else {}
    if not perms.get("can_bulk_import", False):
        raise HTTPException(status_code=403, detail="Permissão can_bulk_import necessária")
    return current_user


def get_user_with_view_database(
    current_user: UserORM = Depends(get_current_user),
) -> UserORM:
    """Require authenticated user with can_view_database permission."""
    from fastapi import HTTPException
    perms = current_user.role.permissions if current_user.role else {}
    if not perms.get("can_view_database", False):
        raise HTTPException(status_code=403, detail="Permissão can_view_database necessária")
    return current_user


def get_user_with_edit_pdm(
    current_user: UserORM = Depends(get_current_user),
) -> UserORM:
    """Require authenticated user with can_edit_pdm permission."""
    from fastapi import HTTPException
    perms = current_user.role.permissions if current_user.role else {}
    if not perms.get("can_edit_pdm", False):
        raise HTTPException(status_code=403, detail="Permissão can_edit_pdm necessária")
    return current_user


def get_user_with_manage_users(
    current_user: UserORM = Depends(get_current_user),
) -> UserORM:
    """Require authenticated user with can_manage_users permission."""
    from fastapi import HTTPException
    perms = current_user.role.permissions if current_user.role else {}
    if not perms.get("can_manage_users", False):
        raise HTTPException(status_code=403, detail="Permissão can_manage_users necessária")
    return current_user


def get_user_with_view_logs(
    current_user: UserORM = Depends(get_current_user),
) -> UserORM:
    """Require authenticated user with can_view_logs permission."""
    from fastapi import HTTPException
    perms = current_user.role.permissions if current_user.role else {}
    if not perms.get("can_view_logs", False):
        raise HTTPException(status_code=403, detail="Permissão can_view_logs necessária")
    return current_user


def require_master(
    current_user: UserORM = Depends(get_current_user),
) -> UserORM:
    """Require MASTER role — apenas o dono do sistema pode realizar a operação."""
    from fastapi import HTTPException
    is_master = bool(current_user.role and (current_user.role.name or "").upper() == "MASTER")
    if not is_master:
        raise HTTPException(
            status_code=403,
            detail="Apenas o usuário Master pode realizar esta operação.",
        )
    return current_user