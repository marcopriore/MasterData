"""
Engine e SessionLocal para a aplicação FastAPI.

Usa mdm_app (sem BYPASSRLS) para respeitar RLS.
Scripts admin (recreate_db, seed_data) usam postgres via engine próprio.
Endpoints de auth (login, /me, switch-tenant, tenants) usam SessionLocalAdmin (postgres).
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

_raw = os.getenv("DATABASE_URL", "")
DATABASE_URL = os.getenv(
    "APP_DATABASE_URL",
    _raw.replace("postgres:postgres@", "mdm_app:mdm_app_pass@") if _raw else "",
)
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL ou APP_DATABASE_URL não definido (crie api/.env)")

# Substitui host 'db' por 'localhost' para execução local fora do Docker
if "@db:" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("@db:", "@localhost:")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# Admin engine: postgres (BYPASSRLS) para auth/tenants sem RLS
_admin_url = os.getenv("DATABASE_URL", "")
if "@db:" in _admin_url:
    _admin_url = _admin_url.replace("@db:", "@localhost:")
if _admin_url:
    admin_engine = create_engine(_admin_url, pool_pre_ping=True)
    SessionLocalAdmin = sessionmaker(bind=admin_engine, autoflush=False, autocommit=False)
else:
    admin_engine = None
    SessionLocalAdmin = None


class Base(DeclarativeBase):
    pass