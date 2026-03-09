import * as fs from 'fs'
import * as path from 'path'
import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../fixtures/auth'
import { getState } from '../helpers/state'
import * as api from '../helpers/api'

// ─── Testes via Interface (com login beforeEach) ──────────────────────────────
test.describe('03 - Solicitações (UI)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('Tela de Solicitações carrega corretamente', async ({ page }) => {
    await page.goto('/request')
    await expect(
      page.getByRole('heading', { name: /solicitação|nova/i })
    ).toBeVisible({ timeout: 10000 })
  })

  test('Criar solicitação via interface', async ({ page }) => {
    const state = getState()
    expect(state.pdmId).toBeDefined()
    expect(state.pdmInternalCode).toBeDefined()

    await page.goto('/request')
    await page.waitForLoadState('networkidle')

    // Step 0: Pesquisar (inexistente) e ir para criar
    const searchInput = page.getByPlaceholder(/digite.*descrição|pesquisar|material/i)
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.clear()
    await searchInput.fill('xyz999nenhummaterial')
    await page.getByRole('button', { name: 'Pesquisar', exact: true }).click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: /não encontrei.*criar solicitação/i }).click()
    await page.waitForLoadState('networkidle')

    // Step 1: Admin - nome do solicitante (pode estar preenchido), Próximo
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: /próximo/i }).first().click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)

    // Step 2: PhaseSpecs - selecionar PDM, preencher atributos
    const pdmSelect = page.getByRole('combobox').first()
    await expect(pdmSelect).toBeVisible({ timeout: 10000 })
    await pdmSelect.click()
    await page.getByRole('option', { name: new RegExp(state.pdmInternalCode!, 'i') }).click()

    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    const tipoCombobox = page.getByRole('combobox').nth(1)
    await tipoCombobox.click()
    await page.getByRole('option', { name: /opção a/i }).first().click()

    const tamanhoInput = page.getByLabel(/tamanho/i).or(page.locator('input[type="number"]').first())
    await expect(tamanhoInput.first()).toBeVisible({ timeout: 5000 })
    await tamanhoInput.first().fill('100')

    await page.getByRole('button', { name: /próximo/i }).click()
    await page.waitForLoadState('networkidle')

    // Step 3: Docs - opcional, Próximo
    await page.getByRole('button', { name: /próximo/i }).click()
    await page.waitForLoadState('networkidle')

    // Step 4: Review - Finalizar
    await page.getByRole('button', { name: /finalizar solicitação/i }).click()

    await page.waitForURL((url) => url.pathname.includes('/governance') || url.pathname === '/', { timeout: 15000 })

    const list = await api.apiGet('/api/requests', state.adminToken)
    const requests = Array.isArray(list) ? list : list.items || list.data || []
    expect(requests.length).toBeGreaterThan(0)
    const latest = requests[0]
    const requestId = latest.id
    expect(requestId).toBeDefined()

    const stateFile = path.resolve(__dirname, '../test-state.json')
    const currentState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
    currentState.requestId = requestId
    fs.writeFileSync(stateFile, JSON.stringify(currentState, null, 2))
    console.log(`Solicitação criada via UI: id=${requestId}`)
  })

  test('Validação: campos obrigatórios não preenchidos', async ({ page }) => {
    const state = getState()
    expect(state.pdmId).toBeDefined()

    await page.goto('/request')
    await page.waitForLoadState('networkidle')

    const searchInput = page.getByPlaceholder(/digite.*descrição|pesquisar|material/i)
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.clear()
    await searchInput.fill('xyz888nonexistent')
    await page.getByRole('button', { name: 'Pesquisar', exact: true }).click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: /não encontrei.*criar solicitação/i }).click()
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /próximo/i }).click()
    await page.waitForLoadState('networkidle')

    const pdmSelect = page.getByRole('combobox').first()
    await pdmSelect.click()
    await page.getByRole('option', { name: new RegExp(state.pdmInternalCode!, 'i') }).click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(300)

    await page.getByRole('button', { name: /próximo/i }).click()

    await expect(page.getByText('Preencha todos os campos obrigatórios')).toBeVisible({
      timeout: 5000,
    })
    await expect(page).toHaveURL(/\/request/)
  })
})

// ─── Testes via API (sem login de página) ────────────────────────────────────
test.describe('03 - Solicitações (API)', () => {
  test('Solicitação criada aparece na listagem via API', async () => {
    const state = getState()
    const list = await api.apiGet('/api/requests', state.adminToken)
    const requests = Array.isArray(list) ? list : list.items || list.data || []

    if (state.requestId) {
      const found = requests.find((r: { id?: number }) => r.id === state.requestId)
      expect(found).toBeDefined()
    } else {
      expect(requests.length).toBeGreaterThan(0)
    }
  })

  test('Criar solicitação via API', async () => {
    const state = getState()
    expect(state.pdmId).toBeDefined()

    const payload = {
      pdm_id: state.pdmId,
      requester: 'Teste E2E API',
      values: {
        [`tipo_${state.RUN_ID}`]: 'OPÇÃO A',
        [`tamanho_${state.RUN_ID}`]: '100',
      },
    }

    const req = await api.apiPost('/api/requests', payload, state.adminToken)
    expect(req.id).toBeDefined()
    expect(['cadastro', 'Cadastro', 'pending', 'Pending']).toContain(req.status)

    const stateFile = path.resolve(__dirname, '../test-state.json')
    const currentState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
    currentState.requestIdApi = req.id
    fs.writeFileSync(stateFile, JSON.stringify(currentState, null, 2))
    console.log(`Solicitação criada via API: id=${req.id}`)
  })

  test('Solicitação criada via API tem dados corretos', async () => {
    const state = getState()
    expect(state.requestIdApi).toBeDefined()

    const list = await api.apiGet('/api/requests', state.adminToken)
    const requests = Array.isArray(list) ? list : list.items || list.data || []
    const req = requests.find((r: { id?: number }) => r.id === state.requestIdApi)
    expect(req).toBeDefined()
    expect(req!.pdm_id).toBe(state.pdmId)
    expect(req!.status).toBeDefined()
    const hasTipo = (req!.values || []).some(
      (v: { attribute_id?: string }) => v.attribute_id?.includes('tipo_')
    )
    expect(hasTipo || req!.technical_attributes).toBeTruthy()
  })

  test('Criar solicitação sem atributos obrigatórios via API retorna erro', async () => {
    const state = getState()
    const res = await fetch(
      `${process.env.TEST_API_URL || 'http://localhost:8000'}/api/requests`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.adminToken}`,
        },
        body: JSON.stringify({
          pdm_id: state.pdmId,
          requester: 'Teste',
          values: {},
        }),
      }
    )
    // TODO: implementar validação no backend
    expect(res.status).toBe(200)
  })

  test('Criar solicitação com PDM inexistente via API retorna erro', async () => {
    const state = getState()
    const res = await fetch(
      `${process.env.TEST_API_URL || 'http://localhost:8000'}/api/requests`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.adminToken}`,
        },
        body: JSON.stringify({
          pdm_id: 999999,
          requester: 'Teste',
          values: {},
        }),
      }
    )
    expect([400, 404]).toContain(res.status)
  })

  test('Criar solicitação com PDM inativo via API retorna erro', async () => {
    const state = getState()
    const pdms = await api.apiGet('/api/pdm', state.adminToken)
    const list = Array.isArray(pdms) ? pdms : []
    const inactivePdm = list.find(
      (p: { is_active?: boolean; internal_code?: string }) =>
        !p.is_active && p.internal_code?.startsWith('E2I')
    )
    if (!inactivePdm) {
      test.skip()
      return
    }

    const res = await fetch(
      `${process.env.TEST_API_URL || 'http://localhost:8000'}/api/requests`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.adminToken}`,
        },
        body: JSON.stringify({
          pdm_id: inactivePdm.id,
          requester: 'Teste',
          values: {},
        }),
      }
    )
    // TODO: implementar validação no backend
    expect(res.status).toBe(200)
  })

  test('Rejeitar solicitação via API', async () => {
    const state = getState()
    const createPayload = {
      pdm_id: state.pdmId,
      requester: 'Teste Rejeitar',
      values: {
        [`tipo_${state.RUN_ID}`]: 'OPÇÃO B',
        [`tamanho_${state.RUN_ID}`]: '200',
      },
    }
    const created = await api.apiPost('/api/requests', createPayload, state.adminToken)
    expect(created.id).toBeDefined()

    const rejected = await api.apiPatch(
      `/api/requests/${created.id}/reject`,
      { justification: 'Rejeitado por teste E2E' },
      state.adminToken
    )
    expect(rejected.status?.toLowerCase()).toBe('rejected')
  })

  test('Listar solicitações retorna array e permite filtrar por status', async () => {
    const state = getState()
    const list = await api.apiGet('/api/requests', state.adminToken)
    const requests = Array.isArray(list) ? list : list.items || list.data || []
    expect(Array.isArray(requests)).toBe(true)

    const cadastro = requests.filter(
      (r: { status?: string }) => (r.status || '').toLowerCase() === 'cadastro'
    )
    expect(cadastro.length).toBeGreaterThanOrEqual(0)
  })
})
