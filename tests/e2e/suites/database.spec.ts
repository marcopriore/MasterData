import { expect, test } from '@playwright/test'
import { authFile, getState } from '../helpers/state'

test.use({ storageState: authFile('cadastro') })

test.describe('05 - Base de Dados', () => {
  test('o material da solicitação aprovada aparece na busca e abre o detalhe', async ({ page }) => {
    const state = getState()
    await page.goto('/database')
    await page.getByPlaceholder('Buscar por código ou descrição...').fill(state.materialCode!)
    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    const row = page.getByRole('row').filter({ hasText: state.materialCode! })
    await expect(row).toBeVisible()
    await row.click()
    await expect(page).toHaveURL(new RegExp(`/database/${state.materialId}$`))
    await expect(page.getByText(state.materialCode!).first()).toBeVisible()
  })

  test('busca sem resultado mostra o aviso', async ({ page }) => {
    await page.goto('/database')
    await page.getByPlaceholder('Buscar por código ou descrição...').fill(`QZXINEXISTENTE${getState().runId}`)
    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    await expect(page.getByText('Nenhum material encontrado.')).toBeVisible()
  })

  test('caractere de filtro na busca não quebra nem vaza a consulta', async ({ page }) => {
    await page.goto('/database')
    await page.getByPlaceholder('Buscar por código ou descrição...').fill('x),tenant_id.neq.0,(id')
    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    await expect(page.getByText('Nenhum material encontrado.')).toBeVisible()
  })
})
