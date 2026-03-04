from typing import Annotated, Generator

from fastapi import Depends, Header
from sqlalchemy.orm import Session, joinedload

from db import SessionLocal
from orm_models import UserORM
from security import decode_access_token


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user_optional(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> UserORM | None:
    """
    Extract and validate user from JWT in Authorization: Bearer <token>.
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
        .options(joinedload(UserORM.role))
        .filter(UserORM.id == user_id, UserORM.is_active == True)
        .first()
    )
    return user


def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> UserORM:
    """
    Extract and validate user from JWT. Raises HTTP 401 if missing/invalid.
    """
    from fastapi import HTTPException
    user = get_current_user_optional(authorization=authorization, db=db)
    if user is None:
        raise HTTPException(status_code=401, detail="Autenticação necessária")
    return user


def get_admin_user(
    current_user: UserORM = Depends(get_current_user),
) -> UserORM:
    """Require authenticated user with ADMIN role."""
    from fastapi import HTTPException
    if not current_user.role or current_user.role.name.upper() != "ADMIN":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
    return current_user