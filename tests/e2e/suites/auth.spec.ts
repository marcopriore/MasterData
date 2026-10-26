import { expect, test } from '@playwright/test'
import { admin } from '../helpers/supabase'
import { getState } from '../helpers/state'
import { INACTIVE_MESSAGE, login, loginAs } from '../helpers/ui'

test.describe('01 - Autenticação', () => {
  test('página protegida sem sessão vai para o login', async ({ page }) => {
    await page.goto('/governance')
    await expect(page).toHaveURL(/\/login\?from=%2Fgovernance/)
  })

  test('login do administrador abre o sistema com o menu dele', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Governança' }).first()).toBeVisible()
  })

  test('senha errada mostra "Credenciais inválidas"', async ({ page }) => {
    const state = getState()
    await login(page, state.users.admin.email, 'SenhaErrada1!')
    await expect(page.getByText('Credenciais inválidas')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('usuário inativo não entra', async ({ page }) => {
    const state = getState()
    await admin.from('users').update({ is_active: false }).eq('id', state.spare.id)
    try {
      await login(page, state.spare.email, state.password)
      await expect(page.getByText(INACTIVE_MESSAGE)).toBeVisible()
      await expect(page).toHaveURL(/\/login/)
    } finally {
      await admin.from('users').update({ is_active: true }).eq('id', state.spare.id)
    }
  })

  test('sair encerra a sessão', async ({ page }) => {
    const state = getState()
    await login(page, state.spare.email, state.password)
    await page.waitForURL((url) => !url.pathname.startsWith('/login'))
    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/governance')
    await expect(page).toHaveURL(/\/login/)
  })
})
