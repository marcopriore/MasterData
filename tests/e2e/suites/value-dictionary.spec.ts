import { expect, test } from '@playwright/test'
import { authFile } from '../helpers/state'
import { expectToast, pageAs } from '../helpers/ui'

test.describe('06 - Dicionário de Valores', () => {
  test.use({ storageState: authFile('admin') })

  test('sincroniza com os PDMs e a busca encontra o valor', async ({ page }) => {
    await page.goto('/admin/value-dictionary')
    await page.getByRole('button', { name: 'Sincronizar com PDMs' }).click()
    await expectToast(page, /Sincronizado: \d+ entradas criadas/)
    await page.getByPlaceholder('Buscar por valor...').fill('ACO INOX')
    await expect(page.getByText('ACO INOX', { exact: true }).first()).toBeVisible()
  })
})

test.describe('06 - Dicionário de Valores: permissão', () => {
  test('solicitante não sincroniza o dicionário', async ({ browser }) => {
    const { page, close } = await pageAs(browser, 'solicitante')
    try {
      await page.goto('/admin/value-dictionary')
      await expect(page.getByRole('button', { name: 'Sincronizar com PDMs' })).toHaveCount(0)
    } finally {
      await close()
    }
  })
})
