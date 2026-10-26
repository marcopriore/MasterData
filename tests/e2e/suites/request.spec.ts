import { expect, test, type Page } from '@playwright/test'
import { admin } from '../helpers/supabase'
import { authFile, getState, updateState } from '../helpers/state'
import { expectToast } from '../helpers/ui'

test.use({ storageState: authFile('solicitante') })

/** Do Link de Pesquisa até os atributos técnicos, com o PDM base escolhido. */
async function openSpecs(page: Page, search: string) {
  const state = getState()
  await page.goto('/requests/new')
  await page.getByPlaceholder('Digite a descrição ou código do material...').fill(search)
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click()
  await page.getByRole('button', { name: 'Não encontrei, criar solicitação' }).click()
  // O nome do solicitante vem do perfil, carregado depois da tela.
  await expect(page.getByText(state.users.solicitante.name.toUpperCase()).first()).toBeVisible()
  await page.getByRole('button', { name: 'Próximo' }).click()
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: new RegExp(`\\(${state.pdm.code}\\)`) }).click()
  await expect(page.locator('[id="attr-modelo"]')).toBeVisible()
}

test.describe('03 - Nova solicitação', () => {
  test('campos obrigatórios em branco não avançam', async ({ page }) => {
    await openSpecs(page, `NADA ${getState().runId}`)
    await page.getByRole('button', { name: 'Próximo' }).click()
    await expectToast(page, 'Preencha todos os campos obrigatórios.')
    await expect(page.getByText('Campo obrigatório').first()).toBeVisible()
  })

  test('cria a solicitação pelo assistente e ela nasce na primeira etapa', async ({ page }) => {
    const state = getState()
    const modelo = `M${state.runId}`
    await openSpecs(page, `VALVULA ${state.runId}`)

    await page.locator('[id="attr-material"]').click()
    await page.getByRole('option', { name: /ACO INOX/ }).click()
    await page.locator('[id="attr-modelo"]').fill(modelo.toLowerCase())
    await expect(page.locator('[id="attr-modelo"]')).toHaveValue(modelo)

    await page.getByRole('button', { name: 'Próximo' }).click()
    await page.getByRole('button', { name: 'Próximo' }).click()
    await page.getByRole('button', { name: 'Finalizar Solicitação' }).click()

    await expectToast(page, /Solicitação #\d+ criada com sucesso!/)
    await page.waitForURL(/\/requests\?req=\d+/)
    const requestId = Number(new URL(page.url()).searchParams.get('req'))
    expect(requestId).toBeGreaterThan(0)

    const { data } = await admin
      .from('material_requests')
      .select('status, tenant_id, user_id, generated_description, technical_attributes')
      .eq('id', requestId)
      .single()
    expect(data?.tenant_id).toBe(state.tenantId)
    expect(data?.user_id).toBe(state.users.solicitante.id)
    expect(data?.status).toBe('cadastro')
    expect(data?.generated_description).toBe(`${state.pdm.name} INOX ${modelo}`)
    updateState({ requestId, modelo })
  })

  test('a solicitação aparece em Minhas Solicitações', async ({ page }) => {
    const state = getState()
    await page.goto('/requests')
    await expect(page.getByText(`REQ-${String(state.requestId).padStart(4, '0')}`).first()).toBeVisible()
  })
})
