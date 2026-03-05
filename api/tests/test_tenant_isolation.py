"""Testes de isolamento multi-tenant (RLS)."""
import pytest

from tests.conftest import client, auth_headers


class TestIsolamentoMateriais:
    """Materiais da base de dados devem ser filtrados por tenant."""

    def test_tenant1_ve_seus_materiais(self, token_admin_masterdata):
        resp = client.get(
            "/api/database/materials",
            headers=auth_headers(token_admin_masterdata),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 20

    def test_tenant2_nao_ve_materiais_do_tenant1(self, token_admin_empresa_demo):
        resp = client.get(
            "/api/database/materials",
            headers=auth_headers(token_admin_empresa_demo),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0

    def test_tenant2_nao_ve_pdm_do_tenant1(self, token_admin_empresa_demo):
        resp = client.get(
            "/api/pdm",
            headers=auth_headers(token_admin_empresa_demo),
        )
        assert resp.status_code == 200
        pdms = resp.json()
        assert len(pdms) == 0


class TestIsolamentoUsuarios:
    """Usuários devem ser filtrados por tenant."""

    def test_tenant1_ve_apenas_seus_usuarios(self, token_admin_masterdata):
        resp = client.get(
            "/admin/users",
            headers=auth_headers(token_admin_masterdata),
        )
        assert resp.status_code == 200
        users = resp.json()
        emails = [u["email"] for u in users]
        assert "admin@empresa-demo.com" not in emails
        assert "solicitante@empresa-demo.com" not in emails

    def test_tenant2_ve_apenas_seus_usuarios(self, token_admin_empresa_demo):
        resp = client.get(
            "/admin/users",
            headers=auth_headers(token_admin_empresa_demo),
        )
        assert resp.status_code == 200
        users = resp.json()
        emails = [u["email"] for u in users]
        assert "master@masterdata.com" not in emails
        assert "admin@masterdata.com" not in emails
        assert "admin@empresa-demo.com" in emails


class TestIsolamentoRoles:
    """Roles devem ser isoladas por tenant (IDs não devem se sobrepor)."""

    def test_roles_isoladas_por_tenant(
        self, token_admin_masterdata, token_admin_empresa_demo
    ):
        resp1 = client.get(
            "/admin/roles",
            headers=auth_headers(token_admin_masterdata),
        )
        resp2 = client.get(
            "/admin/roles",
            headers=auth_headers(token_admin_empresa_demo),
        )
        assert resp1.status_code == 200
        assert resp2.status_code == 200
        ids_tenant1 = {r["id"] for r in resp1.json()}
        ids_tenant2 = {r["id"] for r in resp2.json()}
        assert ids_tenant1.isdisjoint(ids_tenant2), (
            "Roles de tenants diferentes estão se sobrepondo!"
        )
