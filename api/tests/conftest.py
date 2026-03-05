"""
Fixtures compartilhadas entre todos os testes.

Os testes usam o banco de dados de desenvolvimento (seed já executado).
Nunca mockar o banco — testar o comportamento real com RLS.
"""
import os
import pytest
from fastapi.testclient import TestClient

# Configura URLs de banco para testes (usa dev/seed)
os.environ.setdefault(
    "APP_DATABASE_URL",
    "postgresql+psycopg://mdm_app:mdm_app_pass@localhost:5432/masterdata",
)
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/masterdata",
)

from main import app

client = TestClient(app)


# ─── Helpers de autenticação ───────────────────────────────────────────────────

def get_token(email: str, password: str) -> str:
    """Faz login e retorna o access_token."""
    resp = client.post(
        "/admin/auth/login",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 200, f"Login falhou para {email}: {resp.text}"
    return resp.json()["access_token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ─── Tokens fixos dos usuários do seed ──────────────────────────────────────────

@pytest.fixture(scope="session")
def token_master():
    return get_token("master@masterdata.com", "Master@1234")


@pytest.fixture(scope="session")
def token_admin_masterdata():
    return get_token("admin@masterdata.com", "Admin@1234")


@pytest.fixture(scope="session")
def token_admin_empresa_demo():
    return get_token("admin@empresa-demo.com", "Admin@1234")


@pytest.fixture(scope="session")
def token_master_viewing_empresa_demo(token_master):
    """Token do MASTER chaveado para Empresa Demo (tenant_id=2)."""
    resp = client.post(
        "/admin/auth/switch-tenant",
        json={"tenant_id": 2},
        headers=auth_headers(token_master),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture(scope="session")
def http_client():
    return client


@pytest.fixture(autouse=True)
def reset_limiter():
    """Limpa o rate limit storage entre testes para evitar que testes de rate limit
    esgotem o limite e quebrem fixtures (token_master, etc.) que dependem de login."""
    from limiter import limiter

    try:
        limiter.reset()
    except (NotImplementedError, AttributeError):
        storage = getattr(limiter, "_storage", None)
        if storage is not None and hasattr(storage, "storage"):
            storage.storage.clear()
    yield
    try:
        limiter.reset()
    except (NotImplementedError, AttributeError):
        pass
