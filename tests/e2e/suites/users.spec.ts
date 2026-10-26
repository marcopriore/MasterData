import { expect, test, type Page } from '@playwright/test'
import { admin } from '../helpers/supabase'
import { authFile, getState } from '../helpers/state'
import { expectToast, INACTIVE_MESSAGE, login } from '../helpers/ui'

test.use({ storageState: authFile('admin') })

async function fillNewUser(page: Page, name: string, email: string, password: string) {
  await page.getByRole('button', { name: 'Novo Usuário' }).click()
  await page.locator('#u-name').fill(name)
  await page.locator('#u-email').fill(email)
  await page.locator('#u-pw').fill(password)
  await page.getByRole('checkbox', { name: 'SOLICITANTE' }).check()
  await page.getByRole('radio', { name: 'SOLICITANTE' }).check()
}

test.describe.serial('08 - Gestão de Usuários', () => {
  test('lista os usuários do tenant', async ({ page }) => {
    const state = getState()
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: 'Gestão de Usuários' })).toBeVisible()
    await expect(page.getByText(state.users.cadastro.email)).toBeVisible()
  })

  test('senha fraca é recusada', async ({ page }) => {
    const state = getState()
    await page.goto('/admin/users')
    await fillNewUser(page, 'Fraca E2E', `fraca.e2e.${state.runId.toLowerCase()}@example.com`, 'abc12')
    await page.getByRole('button', { name: 'Criar usuário' }).click()
    await expectToast(page, 'A senha precisa ter pelo menos 8 caracteres.')
  })

  test('cria usuário, desativa e ele não consegue entrar', async ({ page, browser }) => {
    const state = getState()
    const email = `novo.e2e.${state.runId.toLowerCase()}@example.com`
    await page.goto('/admin/users')
    await fillNewUser(page, 'Novo E2E', email, state.password)
    await page.getByRole('button', { name: 'Criar usuário' }).click()
    await expectToast(page, 'Usuário criado com sucesso.')

    // A tela grava o nome em maiúsculas.
    const { data: created } = await admin.from('users').select('id, tenant_id, role_id').eq('name', 'NOVO E2E').eq('tenant_id', state.tenantId).single()
    expect(created?.tenant_id).toBe(state.tenantId)
    expect(created?.role_id).toBe(state.users.solicitante.roleId)
    const { data: groups } = await admin.from('user_role_groups').select('role_id').eq('user_id', created!.id)
    expect((groups ?? []).map((g) => g.role_id)).toEqual([state.users.solicitante.roleId])

    await page.getByPlaceholder('Buscar por nome, e-mail ou perfil…').fill(email)
    await page.getByRole('row').filter({ hasText: email }).getByTitle('Desativar').click()
    await expectToast(page, 'Usuário desativado.')

    // Sem a sessão do admin herdada do test.use.
    const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      const other = await fresh.newPage()
      await login(other, email, state.password)
      await expect(other.getByText(INACTIVE_MESSAGE)).toBeVisible()
    } finally {
      await fresh.close()
    }
  })
})
