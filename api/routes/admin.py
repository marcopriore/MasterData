"""
Admin router — Gestão de Usuários e Acessos (v1.8)

Prefix  : /admin
Tags    : ["Admin – Roles", "Admin – Users", "Auth"]

Endpoints
─────────────────────────────────────────────────────────────────────────────
Roles
  GET    /admin/roles                  List all roles with permissions
  GET    /admin/roles/{role_id}        Get a single role
  POST   /admin/roles                  Create a new role
  PATCH  /admin/roles/{role_id}        Update role name / permissions
  DELETE /admin/roles/{role_id}        Delete role (blocked if users assigned)

Users
  GET    /admin/users                  List users (filterable by role / status)
  GET    /admin/users/{user_id}        Get a single user
  POST   /admin/users                  Create user with hashed password
  PUT    /admin/users/{user_id}        Full update of user data and role
  PATCH  /admin/users/{user_id}        Partial update
  PATCH  /admin/users/{user_id}/password   Change password (requires current)
  PATCH  /admin/users/{user_id}/preferences  Update theme / language
  DELETE /admin/users/{user_id}        Soft-delete (deactivate)

Auth
  POST   /admin/auth/login             Credential check → user + role payload
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from deps import get_db
from orm_models import RoleORM, UserORM
from security import create_access_token, hash_password, verify_password
from models import (
    LoginRequest,
    RoleCreate,
    RoleUpdate,
    UserCreate,
    UserPasswordChange,
    UserPreferences,
    UserUpdate,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


# ─── Serialisers ──────────────────────────────────────────────────────────────

def _role_to_dict(r: RoleORM) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "role_type": getattr(r, "role_type", "sistema"),
        "permissions": r.permissions or {},
        "user_count": len(r.users) if r.users is not None else 0,
    }


def _user_to_dict(u: UserORM) -> dict:
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "role_id": u.role_id,
        "role_name": u.role.name if u.role else None,
        "role_type": getattr(u.role, "role_type", "sistema") if u.role else "sistema",
        "role_permissions": u.role.permissions if u.role else {},
        "is_active": u.is_active,
        "preferences": u.preferences or {"theme": "light", "language": "pt"},
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


def _load_user(user_id: int, db: Session) -> UserORM:
    """Fetch a user with its role eagerly loaded, or raise 404."""
    row = (
        db.query(UserORM)
        .options(joinedload(UserORM.role))
        .filter(UserORM.id == user_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    return row


def _load_role(role_id: int, db: Session) -> RoleORM:
    row = (
        db.query(RoleORM)
        .options(joinedload(RoleORM.users))
        .filter(RoleORM.id == role_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil não encontrado")
    return row


# ═══════════════════════════════════════════════════════════════════════════════
# ROLES
# ═══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/roles",
    summary="Lista todos os perfis de acesso",
    response_description="Array de perfis com suas permissões e contagem de usuários",
)
def list_roles(db: Session = Depends(get_db)):
    """
    Retorna todos os perfis cadastrados (ADMIN, SOLICITANTE, TRIAGEM, FISCAL, MASTER, MRP, …)
    com o conjunto de flags de permissão e o número de usuários vinculados.
    """
    rows = (
        db.query(RoleORM)
        .options(joinedload(RoleORM.users))
        .order_by(RoleORM.id)
        .all()
    )
    return [_role_to_dict(r) for r in rows]


@router.get(
    "/roles/{role_id}",
    summary="Detalha um perfil de acesso",
)
def get_role(role_id: int, db: Session = Depends(get_db)):
    return _role_to_dict(_load_role(role_id, db))


@router.post(
    "/roles",
    status_code=status.HTTP_201_CREATED,
    summary="Cria um novo perfil de acesso",
)
def create_role(payload: RoleCreate, db: Session = Depends(get_db)):
    """
    O `name` é automaticamente convertido para maiúsculas.
    As `permissions` são flags booleanas; omita para usar os padrões (todos False
    exceto `can_submit_request`).
    """
    name_upper = payload.name.strip().upper()
    if db.query(RoleORM).filter(RoleORM.name == name_upper).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Perfil '{name_upper}' já existe",
        )
    row = RoleORM(
        name=name_upper,
        role_type=payload.role_type,
        permissions=payload.permissions.model_dump(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _role_to_dict(_load_role(row.id, db))


@router.patch(
    "/roles/{role_id}",
    summary="Atualiza nome e/ou permissões de um perfil",
)
def update_role(role_id: int, payload: RoleUpdate, db: Session = Depends(get_db)):
    row = _load_role(role_id, db)
    if payload.role_type is not None:
        row.role_type = payload.role_type
    if payload.name is not None:
        new_name = payload.name.strip().upper()
        conflict = (
            db.query(RoleORM)
            .filter(RoleORM.name == new_name, RoleORM.id != role_id)
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Perfil '{new_name}' já existe",
            )
        row.name = new_name
    if payload.permissions is not None:
        row.permissions = payload.permissions.model_dump()
    db.commit()
    db.refresh(row)
    return _role_to_dict(_load_role(row.id, db))


@router.delete(
    "/roles/{role_id}",
    summary="Remove um perfil de acesso",
)
def delete_role(role_id: int, db: Session = Depends(get_db)):
    """
    Bloqueado se houver usuários vinculados ao perfil.
    Reatribua-os antes de excluir.
    """
    row = _load_role(role_id, db)
    if db.query(UserORM).filter(UserORM.role_id == role_id).count() > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não é possível excluir: existem usuários vinculados a este perfil. Reatribua-os primeiro.",
        )
    db.delete(row)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# USERS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/users",
    summary="Lista todos os usuários com seus perfis",
    response_description="Array de usuários com dados completos de perfil",
)
def list_users(
    role_id: Optional[int] = Query(None, description="Filtrar por perfil"),
    is_active: Optional[bool] = Query(None, description="Filtrar por status (ativo/inativo)"),
    search: Optional[str] = Query(None, description="Busca por nome ou e-mail (case-insensitive)"),
    db: Session = Depends(get_db),
):
    """
    Retorna todos os usuários com seus respectivos perfis de acesso.
    Suporta filtros opcionais por `role_id`, `is_active` e texto livre (`search`).
    """
    q = db.query(UserORM).options(joinedload(UserORM.role)).order_by(UserORM.id)
    if role_id is not None:
        q = q.filter(UserORM.role_id == role_id)
    if is_active is not None:
        q = q.filter(UserORM.is_active == is_active)
    if search:
        term = f"%{search.strip().lower()}%"
        q = q.filter(
            UserORM.name.ilike(term) | UserORM.email.ilike(term)
        )
    return [_user_to_dict(u) for u in q.all()]


@router.get(
    "/users/{user_id}",
    summary="Detalha um usuário",
)
def get_user(user_id: int, db: Session = Depends(get_db)):
    return _user_to_dict(_load_user(user_id, db))


@router.post(
    "/users",
    status_code=status.HTTP_201_CREATED,
    summary="Cria novo usuário com senha criptografada",
)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    """
    A senha é recebida em texto plano e armazenada como hash bcrypt.
    O campo `role_id` deve referenciar um perfil existente.
    """
    if db.query(UserORM).filter(UserORM.email == payload.email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"E-mail '{payload.email}' já está cadastrado",
        )
    role = db.query(RoleORM).filter(RoleORM.id == payload.role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil não encontrado")

    row = UserORM(
        name=payload.name.strip(),
        email=payload.email.lower().strip(),
        hashed_password=hash_password(payload.password),
        role_id=payload.role_id,
        is_active=True,
        preferences=payload.preferences.model_dump(),
        created_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _user_to_dict(_load_user(row.id, db))


@router.put(
    "/users/{user_id}",
    summary="Atualiza dados e perfil do usuário (substituição completa)",
)
def replace_user(user_id: int, payload: UserCreate, db: Session = Depends(get_db)):
    """
    Substitui todos os campos editáveis do usuário.
    Para atualizações parciais use `PATCH /admin/users/{user_id}`.
    A senha é re-hasheada se fornecida.
    """
    row = _load_user(user_id, db)

    # E-mail uniqueness check (excluding self)
    conflict = (
        db.query(UserORM)
        .filter(UserORM.email == payload.email.lower().strip(), UserORM.id != user_id)
        .first()
    )
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-mail já está em uso por outro usuário",
        )

    role = db.query(RoleORM).filter(RoleORM.id == payload.role_id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil não encontrado")

    row.name = payload.name.strip()
    row.email = payload.email.lower().strip()
    row.hashed_password = hash_password(payload.password)
    row.role_id = payload.role_id
    row.preferences = payload.preferences.model_dump()
    db.commit()
    db.refresh(row)
    return _user_to_dict(_load_user(row.id, db))


@router.patch(
    "/users/{user_id}",
    summary="Atualização parcial de dados e/ou perfil",
)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)):
    """
    Todos os campos são opcionais. Apenas os campos enviados são alterados.
    """
    row = _load_user(user_id, db)

    if payload.name is not None:
        row.name = payload.name.strip()

    if payload.email is not None:
        new_email = payload.email.lower().strip()
        conflict = (
            db.query(UserORM)
            .filter(UserORM.email == new_email, UserORM.id != user_id)
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="E-mail já está em uso por outro usuário",
            )
        row.email = new_email

    if payload.role_id is not None:
        role = db.query(RoleORM).filter(RoleORM.id == payload.role_id).first()
        if not role:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil não encontrado")
        row.role_id = payload.role_id

    if payload.is_active is not None:
        row.is_active = payload.is_active

    if payload.preferences is not None:
        row.preferences = payload.preferences.model_dump()

    db.commit()
    db.refresh(row)
    return _user_to_dict(_load_user(row.id, db))


@router.patch(
    "/users/{user_id}/password",
    summary="Altera a senha do usuário",
)
def change_password(
    user_id: int,
    payload: UserPasswordChange,
    db: Session = Depends(get_db),
):
    """
    Requer a senha atual para confirmar a identidade.
    A nova senha é armazenada como hash bcrypt.
    """
    row = db.query(UserORM).filter(UserORM.id == user_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    if not verify_password(payload.current_password, row.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha atual incorreta",
        )
    row.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "message": "Senha alterada com sucesso"}


@router.patch(
    "/users/{user_id}/preferences",
    summary="Atualiza preferências de interface (tema e idioma)",
)
def update_preferences(
    user_id: int,
    payload: UserPreferences,
    db: Session = Depends(get_db),
):
    row = db.query(UserORM).filter(UserORM.id == user_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    row.preferences = payload.model_dump()
    db.commit()
    return {"ok": True, "preferences": row.preferences}


@router.delete(
    "/users/{user_id}",
    summary="Desativa um usuário (soft-delete)",
)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    """
    Não remove o registro do banco — apenas define `is_active = false`.
    Isso preserva o histórico de solicitações vinculadas ao usuário.
    Use `PATCH /admin/users/{id}` com `is_active: true` para reativar.
    """
    row = db.query(UserORM).filter(UserORM.id == user_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    row.is_active = False
    db.commit()
    return {"ok": True, "message": "Usuário desativado"}


# ═══════════════════════════════════════════════════════════════════════════════
# AUTH
# ═══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/auth/login",
    summary="Autenticação por e-mail e senha",
    response_description="Dados do usuário autenticado com perfil e permissões",
)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """
    Valida as credenciais e retorna os dados completos do usuário,
    incluindo o perfil e todas as flags de permissão.

    > **Nota:** JWT será adicionado na v1.9. Por ora o frontend deve
    > armazenar o objeto `user` em contexto/sessão.
    """
    row = (
        db.query(UserORM)
        .options(joinedload(UserORM.role))
        .filter(UserORM.email == payload.email.lower().strip())
        .first()
    )
    if not row or not verify_password(payload.password, row.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha inválidos",
        )
    if not row.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conta desativada. Entre em contato com o administrador.",
        )
    role_name = row.role.name if row.role else "SOLICITANTE"
    role_type = getattr(row.role, "role_type", "sistema") if row.role else "sistema"
    return {
        "ok": True,
        "user": _user_to_dict(row),
        "access_token": create_access_token(row.id, role_name, role_type),
    }
