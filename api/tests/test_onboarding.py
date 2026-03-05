"""Testes do fluxo de onboarding de novo tenant."""
import uuid
import pytest

from tests.conftest import client, auth_headers


class TestOnboarding:
    """Testa o fluxo completo de onboarding de novo tenant."""

    slug = f"teste-{uuid.uuid4().hex[:8]}"
    tenant_id_criado = None

    def test_onboarding_cria_tenant_com_sucesso(self, token_master):
        resp = client.post(
            "/admin/tenants/onboarding",
            json={
                "tenant_name": "Tenant de Testes",
                "tenant_slug": self.slug,
                "admin_name": "Admin Teste",
                "admin_email": f"admin-{self.slug}@teste.com",
                "temp_password": "Teste@1234",
            },
            headers=auth_headers(token_master),
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["success"] is True
        assert data["tenant_id"] is not None
        TestOnboarding.tenant_id_criado = data["tenant_id"]

    def test_onboarding_criou_admin(self, token_master):
        assert TestOnboarding.tenant_id_criado is not None
        switch = client.post(
            "/admin/auth/switch-tenant",
            json={"tenant_id": TestOnboarding.tenant_id_criado},
            headers=auth_headers(token_master),
        )
        assert switch.status_code == 200
        token_new = switch.json()["access_token"]

        users = client.get(
            "/admin/users",
            headers=auth_headers(token_new),
        ).json()
        emails = [u["email"] for u in users]
        assert f"admin-{self.slug}@teste.com" in emails

    def test_onboarding_criou_roles(self, token_master):
        assert TestOnboarding.tenant_id_criado is not None
        switch = client.post(
            "/admin/auth/switch-tenant",
            json={"tenant_id": TestOnboarding.tenant_id_criado},
            headers=auth_headers(token_master),
        )
        assert switch.status_code == 200
        token_new = switch.json()["access_token"]

        roles = client.get(
            "/admin/roles",
            headers=auth_headers(token_new),
        ).json()
        role_names = [r["name"] for r in roles]
        for expected in ["ADMIN", "SOLICITANTE", "TRIAGEM", "FISCAL", "MRP"]:
            assert expected in role_names

    def test_onboarding_criou_field_dictionary(self, token_master):
        assert TestOnboarding.tenant_id_criado is not None
        switch = client.post(
            "/admin/auth/switch-tenant",
            json={"tenant_id": TestOnboarding.tenant_id_criado},
            headers=auth_headers(token_master),
        )
        assert switch.status_code == 200
        token_new = switch.json()["access_token"]

        resp = client.get(
            "/api/fields",
            headers=auth_headers(token_new),
        )
        assert resp.status_code == 200
        fields = resp.json()
        assert len(fields) == 31

    def test_admin_do_novo_tenant_consegue_logar(self):
        resp = client.post(
            "/admin/auth/login",
            json={
                "email": f"admin-{self.slug}@teste.com",
                "password": "Teste@1234",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["user"]["tenant_id"] == TestOnboarding.tenant_id_criado

    def test_slug_duplicado_retorna_400(self, token_master):
        resp = client.post(
            "/admin/tenants/onboarding",
            json={
                "tenant_name": "Duplicado",
                "tenant_slug": self.slug,
                "admin_name": "Admin",
                "admin_email": "outro@teste.com",
            },
            headers=auth_headers(token_master),
        )
        assert resp.status_code == 400

    def test_nao_master_nao_pode_fazer_onboarding(
        self, token_admin_empresa_demo
    ):
        resp = client.post(
            "/admin/tenants/onboarding",
            json={
                "tenant_name": "Invasao",
                "tenant_slug": "invasao-123",
                "admin_name": "Hacker",
                "admin_email": "hacker@teste.com",
            },
            headers=auth_headers(token_admin_empresa_demo),
        )
        assert resp.status_code == 403
