import { expect, test } from '@playwright/test'
import { authFile } from '../helpers/state'

test.use({ storageState: authFile('admin') })

test.describe('09 - Dicionário de Campos', () => {
  for (const view of ['Dados Básicos', 'Compras', 'MRP', 'Fiscal', 'Contabilidade']) {
    test(`filtro da visão ${view} lista só os campos dela`, async ({ page }) => {
      await page.goto('/admin/fields')
      await expect(page.getByRole('heading', { name: 'Dicionário de Campos' })).toBeVisible()
      await expect(page.locator('tbody tr').first()).toBeVisible()
      await page.getByRole('button', { name: view, exact: true }).click()
      const rows = page.locator('tbody tr')
      await expect(rows.first()).toBeVisible()
      const count = await rows.count()
      for (let i = 0; i < count; i++) {
        await expect(rows.nth(i).locator('td').nth(2)).toHaveText(view)
      }
    })
  }
})
