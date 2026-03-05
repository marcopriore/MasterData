"""Testes do switch de tenant do MASTER."""
import pytest

from tests.conftest import client, auth_headers


class TestMasterSwitch:
    def test_master_ve_dados_tenant1(self, token_master):
        resp = client.get(
            "/api/database/materials",
            headers=auth_headers(token_master),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 20

    def test_master_chaveado_ve_dados_tenant2(
        self, token_master_viewing_empresa_demo
    ):
        resp = client.get(
            "/api/database/materials",
            headers=auth_headers(token_master_viewing_empresa_demo),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_master_chaveado_ve_usuarios_tenant2(
        self, token_master_viewing_empresa_demo
    ):
        resp = client.get(
            "/admin/users",
            headers=auth_headers(token_master_viewing_empresa_demo),
        )
        assert resp.status_code == 200
        users = resp.json()
        emails = [u["email"] for u in users]
        assert "admin@empresa-demo.com" in emails
        assert "master@masterdata.com" not in emails

    def test_switch_back_restaura_tenant1(self, token_master):
        switch_resp = client.post(
            "/admin/auth/switch-tenant",
            json={"tenant_id": 2},
            headers=auth_headers(token_master),
        )
        assert switch_resp.status_code == 200
        token_t2 = switch_resp.json()["access_token"]

        back_resp = client.get(
            "/admin/auth/switch-tenant/back",
            headers=auth_headers(token_t2),
        )
        assert back_resp.status_code == 200
        token_back = back_resp.json()["access_token"]

        resp = client.get(
            "/api/database/materials",
            headers=auth_headers(token_back),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 20
