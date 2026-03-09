import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../fixtures/auth'
import { getState } from '../helpers/state'
import * as api from '../helpers/api'

const EXPECTED_ROLES = ['ADMIN', 'CADASTRO', 'COMPRAS', 'MRP', 'FISCAL', 'CONTABILIDADE']

// ─── Testes via Interface ─────────────────────────────────────────────────────
test.describe('07 - Perfis de Acesso (UI)', () => {
  test('Tela Perfis de Acesso carrega corretamente', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/roles')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', { name: /Perfis de Acesso/i })
    ).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/ADMIN|CADASTRO|COMPRAS/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('Roles do onboarding estão presentes', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/roles')
    await page.waitForLoadState('networkidle')

    for (const name of EXPECTED_ROLES) {
      await expect(page.getByRole('main').getByText(name, { exact: true })).toBeVisible({ timeout: 5000 })
    }
  })
})

// ─── Testes via API ───────────────────────────────────────────────────────────
test.describe('07 - Perfis de Acesso (API)', () => {
  let createdRoleId: number

  test('Listar roles via API', async () => {
    const state = getState()
    const roles = await api.apiGet('/admin/roles', state.adminToken)
    const list = Array.isArray(roles) ? roles : (roles as { items?: unknown[] }).items ?? (roles as { data?: unknown[] }).data ?? []
    expect(list.length).toBeGreaterThanOrEqual(6)
  })

  test('Criar novo perfil de acesso', async () => {
    const state = getState()
    const res = await api.apiPost(
      '/admin/roles',
      {
        name: 'TESTE_E2E',
        role_type: 'operacional',
        permissions: {
          can_view_pdm: true,
          can_submit_request: true,
          can_approve: false,
          can_reject: false,
          can_edit_pdm: false,
          can_view_workflows: false,
          can_edit_workflows: false,
          can_manage_users: false,
          can_view_logs: false,
          can_manage_fields: false,
          can_view_database: true,
          can_manage_roles: false,
          can_manage_value_dictionary: false,
          can_standardize: false,
          can_bulk_import: false,
        },
      },
      state.adminToken
    ) as { id: number; name: string }
    expect(res.id).toBeDefined()
    expect(res.name).toBe('TESTE_E2E')
    createdRoleId = res.id
  })

  test('Editar perfil de acesso', async () => {
    expect(createdRoleId).toBeDefined()
    const state = getState()
    const updated = await api.apiPatch(
      `/admin/roles/${createdRoleId}`,
      { name: 'TESTE_E2E_EDITADO' },
      state.adminToken
    ) as { name: string }
    expect(updated.name).toBe('TESTE_E2E_EDITADO')

    const fetched = await api.apiGet(`/admin/roles/${createdRoleId}`, state.adminToken) as { name: string }
    expect(fetched.name).toBe('TESTE_E2E_EDITADO')
  })

  test('Não permite criar role com nome duplicado', async () => {
    const state = getState()
    const res = await fetch(`${api.API_URL}/admin/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.adminToken}`,
      },
      body: JSON.stringify({
        name: 'TESTE_E2E_EDITADO',
        role_type: 'operacional',
        permissions: { can_view_pdm: true, can_submit_request: true },
      }),
    })
    expect([400, 409]).toContain(res.status)
  })

  test('Permissões granulares funcionam', async () => {
    expect(createdRoleId).toBeDefined()
    const state = getState()
    const role = await api.apiGet(`/admin/roles/${createdRoleId}`, state.adminToken) as { permissions?: Record<string, boolean> }
    expect(role.permissions?.can_view_pdm).toBe(true)
    expect(role.permissions?.can_submit_request).toBe(true)

    await api.apiPatch(
      `/admin/roles/${createdRoleId}`,
      {
        permissions: {
          ...role.permissions,
          can_edit_pdm: true,
        },
      },
      state.adminToken
    )
    const after = await api.apiGet(`/admin/roles/${createdRoleId}`, state.adminToken) as { permissions?: Record<string, boolean> }
    expect(after.permissions?.can_edit_pdm).toBe(true)
  })

  test('Não permite deletar role em uso', async () => {
    const state = getState()
    const roleId = state.operatorRoleId
    expect(roleId).toBeDefined()
    const res = await fetch(`${api.API_URL}/admin/roles/${roleId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${state.adminToken}` },
    })
    expect([400, 403]).toContain(res.status)
  })
})
