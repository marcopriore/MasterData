import * as fs from 'fs'
import * as path from 'path'
import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../fixtures/auth'
import { getState } from '../helpers/state'
import * as api from '../helpers/api'

// ─── Testes via Interface (com login beforeEach) ──────────────────────────────
test.describe('02 - Gestão PDM (UI)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('Tela de Gestão PDM carrega corretamente', async ({ page }) => {
    await page.goto('/admin-pdm')
    await expect(page.locator('h1, h2').filter({ hasText: /PDM|Padrão/i }).first()).toBeVisible()
  })

  test('Criar PDM via interface', async ({ page }) => {
    const state = getState()
    const code = `E2E${state.RUN_ID.toString().slice(-6)}`
    const name = `PDM E2E ${state.RUN_ID}`

    await page.goto('/admin-pdm')
    await page.click('button:has-text("Novo PDM"), button:has-text("Novo"), button:has-text("Criar")')
    await page.waitForSelector('#pdm-name, input[name="name"], input[placeholder*="Nome"]')
    await page.fill('#pdm-name, input[name="name"]', name)
    await page.fill('#pdm-code, input[name="internal_code"]', code)
    await page.click('button:has-text("Salvar"), button[type="submit"]')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name, exact: false }).first()).toBeVisible({ timeout: 10000 })
  })
})

// ─── Testes via API (sem login de página) ────────────────────────────────────
test.describe('02 - Gestão PDM (API)', () => {
  test('PDM criado aparece na listagem', async () => {
    const state = getState()
    const pdms = await api.apiGet('/api/pdm', state.adminToken)
    const list = Array.isArray(pdms) ? pdms : (pdms.items || pdms.data || [])
    const found = list.find((p: { name?: string }) => p.name?.includes(String(state.RUN_ID)))
    expect(found).toBeDefined()
  })

  test('Criar PDM completo via API (com atributos)', async () => {
    const state = getState()
    const code = `E2A${state.RUN_ID.toString().slice(-4)}`

    const pdm = await api.apiPost(
      '/api/pdm',
      {
        name: `PDM Atributos E2E ${state.RUN_ID}`,
        internal_code: code,
        is_active: true,
        attributes: [
          {
            id: `tipo_${state.RUN_ID}`,
            name: 'Tipo',
            abbreviation: 'TP',
            dataType: 'lov',
            isRequired: true,
            order: 1,
            allowedValues: [
              { value: 'OPÇÃO A', abbreviation: 'OPA' },
              { value: 'OPÇÃO B', abbreviation: 'OPB' },
            ],
            includeInDescription: true,
          },
          {
            id: `tamanho_${state.RUN_ID}`,
            name: 'Tamanho',
            abbreviation: 'TM',
            dataType: 'numeric',
            isRequired: true,
            order: 2,
            unit: 'mm',
            allowedValues: [],
            includeInDescription: true,
          },
          {
            id: `material_${state.RUN_ID}`,
            name: 'Material',
            abbreviation: 'MT',
            dataType: 'text',
            isRequired: false,
            order: 3,
            allowedValues: [],
            includeInDescription: false,
          },
        ],
      },
      state.adminToken
    )

    expect(pdm.id).toBeDefined()

    const stateFile = path.resolve(__dirname, '../test-state.json')
    const currentState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
    currentState.pdmId = pdm.id
    currentState.pdmInternalCode = code
    fs.writeFileSync(stateFile, JSON.stringify(currentState, null, 2))
    console.log(`PDM criado: id=${pdm.id}, code=${code}`)
  })

  test('PDM criado via API tem atributos corretos', async () => {
    const freshState = getState()
    const pdm = await api.apiGet(`/api/pdm/${freshState.pdmId}`, freshState.adminToken)

    expect(pdm.internal_code).toContain('E2A')
    expect(pdm.attributes).toHaveLength(3)
    expect(pdm.attributes.find((a: { dataType: string }) => a.dataType === 'lov')).toBeDefined()
    expect(pdm.attributes.find((a: { dataType: string }) => a.dataType === 'numeric')).toBeDefined()
  })

  test('Editar nome do PDM via interface', async ({ page }) => {
    const state = getState()
    expect(state.pdmId).toBeDefined()
    expect(state.pdmInternalCode).toBeDefined()

    await loginAsAdmin(page)
    await page.goto('/admin-pdm')
    await page.waitForLoadState('networkidle')

    const searchField = page.getByPlaceholder(/buscar pdm/i)
    await expect(searchField).toBeVisible({ timeout: 5000 })
    await searchField.clear()
    await searchField.fill(state.pdmInternalCode!)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    const pdmRow = page.getByText(state.pdmInternalCode!, { exact: false }).first()
    await expect(pdmRow).toBeVisible({ timeout: 10000 })
    await pdmRow.click()
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 5000 })

    await page.getByRole('button', { name: /editar pdm/i }).click()
    await page.waitForLoadState('networkidle')

    const nameField = page.getByLabel(/nome do pdm/i).or(page.getByRole('textbox', { name: /nome do pdm/i }))
    await expect(nameField.first()).toBeVisible({ timeout: 10000 })
    await expect(nameField.first()).toBeEnabled({ timeout: 5000 })

    const newName = `PDM Editado E2E ${state.RUN_ID}`
    await nameField.first().clear()
    await nameField.first().fill(newName)

    const saveButton = page.getByRole('button', { name: /salvar/i })
    await expect(saveButton).toBeVisible({ timeout: 5000 })
    await saveButton.click()

    await expect(page.getByRole('button', { name: /editar pdm/i })).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(500)

    const pdm = await api.apiGet(`/api/pdm/${state.pdmId}`, state.adminToken)
    expect(pdm.name.toUpperCase()).toBe(newName.toUpperCase())
  })

  test('Não permite criar PDM com código duplicado', async () => {
    const state = getState()
    const code = `E2A${state.RUN_ID.toString().slice(-4)}`

    const res = await fetch(
      `${process.env.TEST_API_URL || 'http://localhost:8000'}/api/pdm`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.adminToken}`,
        },
        body: JSON.stringify({
          name: 'PDM Duplicado',
          internal_code: code,
          is_active: true,
          attributes: [],
        }),
      }
    )
    expect([400, 409, 422]).toContain(res.status)
  })

  test('PDM inativo tem is_active=false e pode ser criado', async () => {
    const state = getState()
    const pdm = await api.apiPost(
      '/api/pdm',
      {
        name: `PDM Inativo E2E ${state.RUN_ID}`,
        internal_code: `E2I${state.RUN_ID.toString().slice(-4)}`,
        is_active: false,
        attributes: [],
      },
      state.adminToken
    )
    expect(pdm.id).toBeDefined()
    expect(pdm.is_active).toBe(false)
  })
})
