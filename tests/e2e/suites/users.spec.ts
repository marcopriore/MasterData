import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../fixtures/auth'
import { getState } from '../helpers/state'
import * as api from '../helpers/api'

// ─── Testes via Interface ─────────────────────────────────────────────────────
test.describe('08 - Gestão de Usuários (UI)', () => {
  test('Tela Gestão de Usuários carrega corretamente', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/users')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', { name: /Gestão de Usuários/i })
    ).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Admin|Operador|@/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('Usuários do setup estão presentes', async ({ page }) => {
    const state = getState()
    await loginAsAdmin(page)
    await page.goto('/admin/users')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/Admin E2E|admin\.e2e\./i).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/Operador E2E|operador\.e2e\./i).first()).toBeVisible({ timeout: 5000 })
  })
})

// ─── Testes via API ───────────────────────────────────────────────────────────
test.describe('08 - Gestão de Usuários (API)', () => {
  let createdUserId: number
  let createdUserEmail: string
  let createdUserPassword: string

  test('Listar usuários via API', async () => {
    const state = getState()
    const users = await api.apiGet('/admin/users', state.adminToken)
    const list = Array.isArray(users) ? users : (users as { items?: unknown[] }).items ?? (users as { data?: unknown[] }).data ?? []
    expect(list.length).toBeGreaterThanOrEqual(6)
  })

  test('Criar novo usuário', async () => {
    const state = getState()
    const email = `user.teste.${state.RUN_ID}@test.com`
    const password = 'Senha@123456'
    const res = await api.apiPost(
      '/admin/users',
      {
        name: 'User Teste E2E',
        email,
        password,
        role_id: state.operatorRoleId,
      },
      state.adminToken
    ) as { id: number; name: string; email: string; role_id: number }
    expect(res.id).toBeDefined()
    expect(res.name).toBe('User Teste E2E')
    expect(res.email).toBe(email)
    expect(res.role_id).toBe(state.operatorRoleId)
    createdUserId = res.id
    createdUserEmail = email
    createdUserPassword = password
  })

  test('Editar nome do usuário', async () => {
    expect(createdUserId).toBeDefined()
    const state = getState()
    await api.apiPatch(
      `/admin/users/${createdUserId}`,
      { name: 'User Teste Editado' },
      state.adminToken
    )
    const fetched = await api.apiGet(`/admin/users/${createdUserId}`, state.adminToken) as { name: string }
    expect(fetched.name).toBe('User Teste Editado')
  })

  test('Mudar perfil de acesso do usuário', async () => {
    expect(createdUserId).toBeDefined()
    const state = getState()
    const comprasRoleId = state.comprasRoleId
    if (!comprasRoleId) {
      const roles = await api.apiGet('/admin/roles', state.adminToken) as { id: number; name: string }[]
      const compras = (Array.isArray(roles) ? roles : []).find((r) => (r.name || '').toUpperCase() === 'COMPRAS')
      if (!compras) {
        test.skip(true, 'Role COMPRAS não encontrada')
        return
      }
      await api.apiPatch(
        `/admin/users/${createdUserId}`,
        { role_id: compras.id },
        state.adminToken
      )
      const fetched = await api.apiGet(`/admin/users/${createdUserId}`, state.adminToken) as { role_id: number }
      expect(fetched.role_id).toBe(compras.id)
      return
    }
    await api.apiPatch(
      `/admin/users/${createdUserId}`,
      { role_id: comprasRoleId },
      state.adminToken
    )
    const fetched = await api.apiGet(`/admin/users/${createdUserId}`, state.adminToken) as { role_id: number }
    expect(fetched.role_id).toBe(comprasRoleId)
  })

  test('Inativar usuário', async () => {
    expect(createdUserId).toBeDefined()
    const state = getState()
    await api.apiPatch(
      `/admin/users/${createdUserId}`,
      { is_active: false },
      state.adminToken
    )
    const fetched = await api.apiGet(`/admin/users/${createdUserId}`, state.adminToken) as { is_active: boolean }
    expect(fetched.is_active).toBe(false)
  })

  test('Usuário inativo não consegue fazer login', async () => {
    expect(createdUserEmail).toBeDefined()
    expect(createdUserPassword).toBeDefined()
    const res = await fetch(`${api.API_URL}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: createdUserEmail,
        password: createdUserPassword,
      }),
    })
    expect([401, 403]).toContain(res.status)
  })

  test('Criar usuário com email duplicado retorna erro', async () => {
    const state = getState()
    const res = await fetch(`${api.API_URL}/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${state.adminToken}`,
      },
      body: JSON.stringify({
        name: 'Outro User',
        email: state.adminEmail,
        password: 'Senha@123456',
        role_id: state.operatorRoleId,
      }),
    })
    expect([400, 409]).toContain(res.status)
  })

  test('Exportar usuários via API', async () => {
    const state = getState()
    const res = await fetch(`${api.API_URL}/admin/users/export`, {
      headers: { Authorization: `Bearer ${state.adminToken}` },
    })
    expect(res.status).toBe(200)
  })
})
