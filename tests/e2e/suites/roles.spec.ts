import { expect, test } from '@playwright/test'
import { admin } from '../helpers/supabase'
import { authFile, getState } from '../helpers/state'
import { expectToast } from '../helpers/ui'

test.use({ storageState: authFile('admin') })

test.describe('07 - Grupos de perfil', () => {
  test('lista os grupos criados no onboarding', async ({ page }) => {
    await page.goto('/admin/roles')
    await expect(page.getByRole('heading', { name: 'Grupos de perfil' })).toBeVisible()
    for (const name of ['ADMIN', 'SOLICITANTE', 'CADASTRO', 'COMPRAS', 'MRP', 'FISCAL', 'CONTABILIDADE']) {
      await expect(page.getByRole('main').getByText(name, { exact: true }).first()).toBeVisible()
    }
  })

  test('cria um grupo novo no tenant em uso', async ({ page }) => {
    const state = getState()
    const name = `REVISOR${state.runId}`
    await page.goto('/admin/roles')
    await page.getByRole('button', { name: 'Novo grupo' }).click()
    await page.locator('#r-name').fill(name)
    await page.getByRole('button', { name: 'Criar grupo' }).click()
    await expectToast(page, 'Grupo criado com sucesso.')
    const { data } = await admin.from('roles').select('tenant_id').eq('name', name).single()
    expect(data?.tenant_id).toBe(state.tenantId)
  })
})
