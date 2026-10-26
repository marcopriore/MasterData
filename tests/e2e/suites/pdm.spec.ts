import { expect, test } from '@playwright/test'
import { admin } from '../helpers/supabase'
import { authFile, getState } from '../helpers/state'
import { expectToast } from '../helpers/ui'

test.use({ storageState: authFile('admin') })

test.describe('02 - Gestão de PDM', () => {
  test('lista mostra o PDM base e a busca filtra', async ({ page }) => {
    const state = getState()
    await page.goto('/admin-pdm')
    await page.getByPlaceholder('Nome ou código do PDM').fill(state.pdm.code)
    await expect(page.getByRole('link', { name: state.pdm.code }).or(page.getByText(state.pdm.code)).first()).toBeVisible()
  })

  test('cria PDM: nome sem acento e código sugerido no padrão', async ({ page }) => {
    const state = getState()
    await page.goto('/admin-pdm/novo')
    const name = page.locator('#pdm-name')
    await name.fill(`Válvula Esférica ${state.runId}`)
    await expect(name).toHaveValue(`VALVULA ESFERICA ${state.runId}`)
    await page.getByRole('button', { name: 'Salvar Alterações' }).click()
    // Salvo, a tela troca para o detalhe do PDM (o aviso de sucesso some na troca).
    await expect(page).toHaveURL(/\/admin-pdm\/\d+$/)
    await expect(page.getByRole('heading', { name: `VALVULA ESFERICA ${state.runId}` })).toBeVisible()

    const { data } = await admin
      .from('pdm_templates')
      .select('internal_code, name')
      .eq('tenant_id', state.tenantId)
      .eq('name', `VALVULA ESFERICA ${state.runId}`)
      .single()
    expect(data?.internal_code).toMatch(/^VALV\d{3}$/)
  })

  test('não aceita nome repetido', async ({ page }) => {
    const state = getState()
    await page.goto('/admin-pdm/novo')
    await page.locator('#pdm-name').fill(state.pdm.name.toLowerCase())
    await page.getByRole('button', { name: 'Salvar Alterações' }).click()
    await expectToast(page, 'Falha ao salvar')
    await expect(page.getByText(/Já existe um PDM com o nome/)).toBeVisible()
    await expect(page).toHaveURL(/\/admin-pdm\/novo$/)
  })

  test('código digitado é limitado a 10 caracteres válidos', async ({ page }) => {
    await page.goto('/admin-pdm/novo')
    const code = page.locator('#pdm-code')
    await code.fill('abc-ção_123456789')
    await expect(code).toHaveValue(/^[A-Z0-9_-]{1,10}$/)
  })
})
