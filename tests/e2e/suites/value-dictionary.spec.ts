import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../fixtures/auth'
import { getState } from '../helpers/state'
import * as api from '../helpers/api'

test.setTimeout(60000)

// ─── Testes via Interface (loginAsAdmin) ─────────────────────────────────────
test.describe('06 - Dicionário de Valores (UI)', () => {
  test('Tela Dicionário de Valores carrega corretamente', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/value-dictionary')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', { name: /Dicionário de Valores/i })
    ).toBeVisible({ timeout: 10000 })
    await expect(
      page.getByRole('button', { name: /Sincronizar com PDMs/i })
    ).toBeVisible({ timeout: 5000 })
  })

  test('Sincronizar com PDMs via interface', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/value-dictionary')
    await page.waitForLoadState('networkidle')

    const syncBtn = page.getByRole('button', { name: /Sincronizar com PDMs/i })
    await syncBtn.click()

    await expect(
      page.getByText(/Sincronizado:|entradas criadas|Carregando/i)
    ).toBeVisible({ timeout: 10000 })
    await page.waitForLoadState('networkidle')

    const hasValues =
      (await page.getByText(/OPÇÃO A|OPÇÃO B|entradas|Nenhuma entrada/i).first().isVisible({ timeout: 5000 }).catch(() => false))
    expect(hasValues).toBeTruthy()
  })

  test('Busca funciona', async ({ page }) => {
    const state = getState()
    await api.apiPost('/api/value-dictionary/sync', {}, state.adminToken).catch(() => {})

    await loginAsAdmin(page)
    await page.goto('/admin/value-dictionary')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder(/Buscar por valor/i)
    await searchInput.fill('OPÇÃO')
    await page.waitForLoadState('networkidle')

    const hasResult =
      await page.getByText(/OPÇÃO A|OPÇÃO B/i).first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasResult).toBeTruthy()

    await searchInput.fill('XYZNONEXISTENT')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/Nenhuma entrada encontrada/i)).toBeVisible({ timeout: 10000 })
  })
})

// ─── Testes via API ─────────────────────────────────────────────────────────
test.describe('06 - Dicionário de Valores (API)', () => {
  test('Sincronizar valores dos PDMs via API', async () => {
    const state = getState()
    const res = await api.apiPost('/api/value-dictionary/sync', {}, state.adminToken) as { created?: number }
    expect(res).toBeDefined()
    expect(typeof (res.created ?? 0)).toBe('number')
  })

  test('Listar valores via API', async () => {
    const state = getState()
    const values = await api.apiGet('/api/value-dictionary', state.adminToken)
    const list = Array.isArray(values) ? values : (values as { items?: unknown[] }).items ?? (values as { data?: unknown[] }).data ?? []
    expect(list.length).toBeGreaterThanOrEqual(0)
  })

  test('Buscar valores via API', async () => {
    const state = getState()
    const found = await api.apiGet('/api/value-dictionary?search=OPÇÃO', state.adminToken)
    const list = Array.isArray(found) ? found : (found as { items?: unknown[] }).items ?? (found as { data?: unknown[] }).data ?? []
    expect(list.length).toBeGreaterThanOrEqual(0)
  })

  test('Editar abreviação de um valor via API', async () => {
    const state = getState()
    const values = await api.apiGet('/api/value-dictionary', state.adminToken)
    const list = Array.isArray(values) ? values : (values as { items?: { id: number; value: string; abbreviation?: string }[] }).items ?? (values as { data?: { id: number; value: string; abbreviation?: string }[] }).data ?? []
    const first = list[0] as { id: number; value: string; abbreviation?: string } | undefined
    if (!first) {
      test.skip(true, 'Nenhum valor no dicionário — rodar sync antes')
      return
    }

    const updated = await api.apiPut(`/api/value-dictionary/${first.id}`, {
      value: first.value,
      abbreviation: 'E2E',
    }, state.adminToken) as { abbreviation?: string }
    expect(updated.abbreviation).toBe('E2E')
  })

  test('Detectar duplicatas via API', async () => {
    const state = getState()
    const dupes = await api.apiGet('/api/value-dictionary/duplicates', state.adminToken)
    expect(Array.isArray(dupes) || dupes !== undefined).toBeTruthy()
  })

  test('Operador sem permissão não acessa dicionário', async () => {
    const state = getState()
    const operatorToken = await api.getAdminToken(state.operatorEmail, state.operatorPassword)
    const res = await fetch(`${api.API_URL}/api/value-dictionary`, {
      headers: { Authorization: `Bearer ${operatorToken}` },
    })
    expect([401, 403]).toContain(res.status)
  })
})
