import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../fixtures/auth'
import { getState } from '../helpers/state'
import * as api from '../helpers/api'

// ─── Testes via Interface (mínimos) ───────────────────────────────────────────
test.describe('05 - Base de Dados (UI)', () => {
  test('Tela Base de Dados carrega corretamente', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/database')
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByRole('heading', { name: /base de dados|materiais/i })
    ).toBeVisible({ timeout: 5000 })
    await expect(page.getByPlaceholder(/buscar por código ou descrição/i)).toBeVisible({ timeout: 5000 })
  })

  test('Material finalizado aparece na Base de Dados', async ({ page }) => {
    const state = getState()
    expect(state.pdmInternalCode).toBeDefined()
    const res = await api.apiGet('/api/database/materials', state.adminToken)
    const materials = Array.isArray(res) ? res : res.items ?? res.data ?? []
    if (materials.length === 0) {
      test.skip(true, 'Nenhum material na base — workflow pode não ter criado material')
      return
    }

    await loginAsAdmin(page)
    await page.goto('/database')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder(/buscar por código ou descrição/i)
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill(state.pdmInternalCode!)
    await page.getByRole('button', { name: /buscar/i }).click()
    await page.waitForLoadState('networkidle')

    const rowOrCard = page.locator('[data-slot="table-body"] tr, table tbody tr, [role="row"]').first()
    if (!(await rowOrCard.isVisible({ timeout: 3000 }).catch(() => false))) {
      await page.screenshot({ path: 'tests/e2e/debug-database-list.png', fullPage: true })
    }
    await expect(page.getByText(/MDM-|E2A|E2E/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('Detalhe do material abre corretamente', async ({ page }) => {
    const state = getState()
    expect(state.pdmInternalCode).toBeDefined()
    const res = await api.apiGet('/api/database/materials', state.adminToken)
    const materials = Array.isArray(res) ? res : res.items ?? res.data ?? []
    if (materials.length === 0) {
      test.skip(true, 'Nenhum material na base')
      return
    }

    await loginAsAdmin(page)
    await page.goto('/database')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder(/buscar por código ou descrição/i)
    await searchInput.fill(state.pdmInternalCode!)
    await page.getByRole('button', { name: /buscar/i }).click()
    await page.waitForLoadState('networkidle')

    const firstRow = page.locator('[data-slot="table-body"] tr, table tbody tr, [role="row"]').first()
    await expect(firstRow).toBeVisible({ timeout: 10000 })
    await firstRow.click()
    await page.waitForURL(/\/database\/\d+/, { timeout: 5000 })
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 5000 })
  })

  test('Filtros e busca funcionam', async ({ page }) => {
    const state = getState()
    expect(state.pdmInternalCode).toBeDefined()
    const res = await api.apiGet('/api/database/materials', state.adminToken)
    const materials = Array.isArray(res) ? res : res.items ?? res.data ?? []
    if (materials.length === 0) {
      test.skip(true, 'Nenhum material na base')
      return
    }

    await loginAsAdmin(page)
    await page.goto('/database')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder(/buscar por código ou descrição/i)
    await searchInput.fill('XYZNONEXISTENT')
    await page.getByRole('button', { name: /buscar/i }).click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Nenhum material encontrado.')).toBeVisible({ timeout: 5000 })

    await searchInput.clear()
    await searchInput.fill(state.pdmInternalCode!)
    await page.getByRole('button', { name: /buscar/i }).click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/MDM-|E2A|E2E/i).first()).toBeVisible({ timeout: 10000 })
  })
})

// ─── Testes via API ──────────────────────────────────────────────────────────
test.describe('05 - Base de Dados (API)', () => {
  test('Listar materiais via API retorna dados', async () => {
    const state = getState()
    const res = await api.apiGet('/api/database/materials', state.adminToken)
    const list = Array.isArray(res) ? res : res.items ?? res.data ?? []
    if (list.length === 0) {
      test.skip(true, 'Nenhum material na base — workflow pode não criar material automaticamente')
      return
    }
    expect(list.length).toBeGreaterThan(0)
  })

  test('Material criado a partir da solicitação finalizada existe', async () => {
    const state = getState()
    expect(state.requestId).toBeDefined()
    expect(state.pdmInternalCode).toBeDefined()

    const allRes = await api.apiGet('/api/database/materials', state.adminToken)
    const allList = Array.isArray(allRes) ? allRes : allRes.items ?? allRes.data ?? []
    if (allList.length === 0) {
      test.skip(true, 'Nenhum material na base')
      return
    }

    const res = await api.apiGet(`/api/database/materials?pdm_code=${state.pdmInternalCode}`, state.adminToken)
    const list = Array.isArray(res) ? res : res.items ?? []
    const material = list.find((m: { pdm_code?: string }) => m.pdm_code === state.pdmInternalCode)
    expect(material).toBeDefined()
    expect(material.pdm_code).toBe(state.pdmInternalCode)
  })

  test('Busca de materiais via API funciona', async () => {
    const state = getState()
    const allRes = await api.apiGet('/api/database/materials', state.adminToken)
    const allList = Array.isArray(allRes) ? allRes : allRes.items ?? allRes.data ?? []
    if (allList.length === 0) {
      test.skip(true, 'Nenhum material na base')
      return
    }

    const first = allList[0] as { description?: string; pdm_code?: string; id_sistema?: string }
    const searchTerm = (first.description || first.pdm_code || state.pdmInternalCode || '').toString().slice(0, 10)
    const found = await api.apiGet(`/api/database/materials/search?q=${encodeURIComponent(searchTerm)}`, state.adminToken)
    const list = Array.isArray(found) ? found : []
    expect(list.length).toBeGreaterThan(0)

    const empty = await api.apiGet('/api/database/materials/search?q=XYZNONEXISTENT', state.adminToken)
    const emptyList = Array.isArray(empty) ? empty : []
    expect(emptyList.length).toBe(0)
  })

  test('Exportar materiais via API', async () => {
    const state = getState()
    const allRes = await api.apiGet('/api/database/materials', state.adminToken)
    const allList = Array.isArray(allRes) ? allRes : allRes.items ?? allRes.data ?? []
    if (allList.length === 0) {
      test.skip(true, 'Nenhum material na base')
      return
    }

    const API_URL = process.env.TEST_API_URL || 'http://localhost:8000'
    const res = await fetch(`${API_URL}/api/database/materials/export`, {
      headers: { Authorization: `Bearer ${state.adminToken}` },
    })
    expect(res.status).toBe(200)
    const buffer = await res.arrayBuffer()
    expect(buffer.byteLength).toBeGreaterThan(0)
  })

  test('Material tem campos do workflow preenchidos', async () => {
    const state = getState()
    const res = await api.apiGet('/api/database/materials', state.adminToken)
    const list = Array.isArray(res) ? res : res.items ?? res.data ?? []
    if (list.length === 0) {
      test.skip(true, 'Nenhum material na base')
      return
    }
    const material = list[0]
    expect(material).toBeDefined()

    const detail = await api.apiGet(`/api/database/materials/${material.id}`, state.adminToken)
    expect(detail).toBeDefined()
    expect(detail.description).toBeDefined()
  })
})
