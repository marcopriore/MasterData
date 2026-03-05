"""Password hashing utilities using passlib/bcrypt; JWT for API auth."""
import os
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET", "mdm-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 8


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(
    user_id: int,
    role_name: str,
    role_type: str = "sistema",
    permissions: dict | None = None,
    tenant_id: int | None = None,
    is_master: bool = False,
    master_viewing: bool = False,
    original_tenant_id: int | None = None,
) -> str:
    """Create a JWT for the authenticated user."""
    payload: dict = {
        "sub": str(user_id),
        "role": role_name,
        "role_type": role_type,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    if tenant_id is not None:
        payload["tenant_id"] = tenant_id
    payload["is_master"] = is_master
    payload["master_viewing"] = master_viewing
    if original_tenant_id is not None:
        payload["original_tenant_id"] = original_tenant_id
    if permissions is not None:
        payload["permissions"] = permissions
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    """Decode and validate JWT; returns payload or None if invalid."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
