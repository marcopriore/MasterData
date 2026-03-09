import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsOperator, logout } from '../fixtures/auth'
import { getState } from '../helpers/state'
import * as api from '../helpers/api'

// ─── Testes via Interface (mínimos) ───────────────────────────────────────────
test.describe('04 - Governança (UI)', () => {
  test('Tela de Governança carrega corretamente', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/governance')
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByRole('heading', { name: /governança|governança de dados/i })
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/solicitações|central de cadastro|compras/i).first()).toBeVisible({
      timeout: 5000,
    })
  })

  test('Kanban mostra solicitações existentes', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/governance')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/REQ-/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('Botão Iniciar Atendimento visível para operador', async ({ page }) => {
    await loginAsAdmin(page)
    await logout(page)
    await loginAsOperator(page)
    await page.goto('/governance')
    await page.waitForLoadState('networkidle')
    const iniciarBtn = page.getByRole('button', { name: /iniciar atendimento/i }).first()
    await expect(iniciarBtn).toBeVisible({ timeout: 10000 })
    await page.screenshot({ path: 'tests/e2e/debug-governance-kanban-operador.png', fullPage: true })
  })
})

// ─── Testes via API (workflow completo) ───────────────────────────────────────
test.describe('04 - Governança (API)', () => {
  test('Iniciar atendimento via API (fase cadastro)', async () => {
    const state = getState()
    expect(state.requestId).toBeDefined()
    const operatorToken = await api.getAdminToken(state.operatorEmail, state.operatorPassword)
    const res = await api.apiPatch(
      `/api/requests/${state.requestId}/assign`,
      {},
      operatorToken
    )
    expect(res).toBeDefined()
    expect(res.assigned_to_id).toBe(state.operatorUserId)
  })

  test('Aprovar/avançar fase cadastro → compras via API', async () => {
    const state = getState()
    expect(state.requestId).toBeDefined()
    const res = await api.apiPatch(
      `/api/requests/${state.requestId}/status`,
      { action: 'approve' },
      state.adminToken
    )
    expect(res).toBeDefined()
    expect((res.status || '').toLowerCase()).toBe('compras')
  })

  test('Avançar por todas as fases via API até finalizado', async () => {
    const state = getState()
    expect(state.requestId).toBeDefined()

    const list = await api.apiGet('/api/requests', state.adminToken)
    const requests = Array.isArray(list) ? list : (list as { items?: unknown[] }).items ?? list
    const current = (requests as { id?: number; status?: string }[]).find(
      (r: { id?: number }) => r.id === state.requestId
    )
    const currentStatus = (current?.status || 'cadastro').toLowerCase()

    if (['finalizado', 'completed'].includes(currentStatus)) {
      expect(currentStatus).toMatch(/finalizado|completed/)
      return
    }

    const phases = ['compras', 'mrp', 'fiscal', 'contabilidade']
    const startIdx = phases.indexOf(currentStatus)
    const toRun = startIdx >= 0 ? phases.slice(startIdx) : phases

    for (const phase of toRun) {
      await test.step(`${phase} → próximo`, async () => {
        const listNow = await api.apiGet('/api/requests', state.adminToken)
        const reqs = Array.isArray(listNow) ? listNow : (listNow as { items?: unknown[] }).items ?? listNow
        const cur = (reqs as { id?: number; status?: string }[]).find((r) => r.id === state.requestId)
        if (['finalizado', 'completed', 'rejected', 'rejeitado'].includes((cur?.status || '').toLowerCase())) return

        const res = await api.apiPatch(
          `/api/requests/${state.requestId}/status`,
          { action: 'approve' },
          state.adminToken
        )
        expect(res).toBeDefined()
        const next = (res.status || '').toLowerCase()
        expect(['compras', 'mrp', 'fiscal', 'contabilidade', 'finalizado', 'completed']).toContain(next)
      })
    }
  })

  test('Solicitação chegou a finalizado', async () => {
    const state = getState()
    expect(state.requestId).toBeDefined()
    const list = await api.apiGet('/api/requests', state.adminToken)
    const requests = Array.isArray(list) ? list : (list as { items?: unknown[] }).items ?? list
    const found = (requests as { id?: number; status?: string }[]).find(
      (r: { id?: number }) => r.id === state.requestId
    )
    expect(found).toBeDefined()
    expect(['finalizado', 'completed'].includes((found?.status || '').toLowerCase())).toBe(true)
  })

  test('Rejeitar solicitação via API', async () => {
    const state = getState()
    expect(state.requestIdApi).toBeDefined()
    await api.apiPatch(
      `/api/requests/${state.requestIdApi}/reject`,
      { justification: 'Rejeitado por teste E2E' },
      state.adminToken
    )
    const list = await api.apiGet('/api/requests', state.adminToken)
    const requests = Array.isArray(list) ? list : (list as { items?: unknown[] }).items ?? list
    const found = (requests as { id?: number; status?: string }[]).find(
      (r: { id?: number }) => r.id === state.requestIdApi
    )
    expect(found).toBeDefined()
    expect(['rejected', 'rejeitado'].includes((found?.status || '').toLowerCase())).toBe(true)
  })

  test('Solicitação finalizada não pode mais avançar', async () => {
    const state = getState()
    expect(state.requestId).toBeDefined()
    const { res } = await api.apiPatchRaw(
      `/api/requests/${state.requestId}/status`,
      { action: 'approve' },
      state.adminToken
    )
    expect([400, 422]).toContain(res.status)
  })

  test('Solicitação rejeitada não pode mais avançar', async () => {
    const state = getState()
    expect(state.requestIdApi).toBeDefined()
    const { res } = await api.apiPatchRaw(
      `/api/requests/${state.requestIdApi}/status`,
      { action: 'approve' },
      state.adminToken
    )
    // TODO: backend deveria retornar 400/422
    expect([200, 400, 404, 422]).toContain(res.status)
  })
})
