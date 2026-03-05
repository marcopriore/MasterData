"""Testes de autenticação (login, JWT, /auth/me)."""
import jwt as pyjwt
import pytest

# Import client and helpers from conftest (pytest auto-discovers conftest)
# Use pytest fixtures or module-level client
from tests.conftest import client, get_token, auth_headers


class TestLogin:
    def test_login_master_sucesso(self):
        resp = client.post(
            "/admin/auth/login",
            json={"email": "master@masterdata.com", "password": "Master@1234"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["is_master"] is True
        assert data["user"]["tenant_id"] == 1

    def test_login_admin_empresa_demo(self):
        resp = client.post(
            "/admin/auth/login",
            json={"email": "admin@empresa-demo.com", "password": "Admin@1234"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["is_master"] is False
        assert data["user"]["tenant_id"] == 2

    def test_login_senha_errada(self):
        resp = client.post(
            "/admin/auth/login",
            json={"email": "master@masterdata.com", "password": "senhaerrada"},
        )
        assert resp.status_code == 401

    def test_login_email_inexistente(self):
        resp = client.post(
            "/admin/auth/login",
            json={"email": "naoexiste@teste.com", "password": "qualquer"},
        )
        assert resp.status_code == 401

    def test_jwt_contem_claims_corretos(self):
        token = get_token("master@masterdata.com", "Master@1234")
        payload = pyjwt.decode(token, options={"verify_signature": False})
        assert "tenant_id" in payload
        assert "is_master" in payload
        assert "master_viewing" in payload
        assert payload["is_master"] is True

    def test_acesso_sem_token_retorna_401(self):
        resp = client.get("/admin/users")
        assert resp.status_code == 401


class TestAuthMe:
    def test_me_retorna_dados_corretos(self, token_master):
        resp = client.get(
            "/admin/auth/me",
            headers=auth_headers(token_master),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "master@masterdata.com"
        assert data["is_master"] is True


class TestRateLimit:
    """Testes de rate limiting — executados por último (ordem alfabética)."""

    def test_rate_limit_login(self):
        """Deve retornar 429 após 10 tentativas de login por minuto, com Retry-After."""
        for _ in range(10):
            client.post(
                "/admin/auth/login",
                json={"email": "teste@teste.com", "password": "errada"},
            )
        resp = client.post(
            "/admin/auth/login",
            json={"email": "teste@teste.com", "password": "errada"},
        )
        assert resp.status_code == 429
        assert any(k.lower() == "retry-after" for k in resp.headers)
