import { test, expect } from '@playwright/test'
import { loginAsMaster, loginAsAdmin, logout } from '../fixtures/auth'
import { getState } from '../helpers/state'

test.describe('01 - Autenticação', () => {
  test('Master consegue fazer login', async ({ page }) => {
    await loginAsMaster(page)
    await expect(page).toHaveURL(/\/$|\/inicio/)
    await expect(page.getByText('MASTER', { exact: true }).first()).toBeVisible()
  })

  test('Admin do tenant consegue fazer login', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page).toHaveURL(/\/$|\/inicio/)
  })

  test('Logout funciona corretamente', async ({ page }) => {
    await loginAsAdmin(page)
    await logout(page)
    await expect(page).toHaveURL(/\/login/)
  })

  test('Credenciais inválidas exibem erro', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'invalido@test.com')
    await page.fill('input[type="password"]', 'senhaerrada')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/\/login/)
  })

  test('Estado de teste foi criado corretamente', async () => {
    const state = getState()
    expect(state.tenantId).toBeDefined()
    expect(state.adminEmail).toContain('@test.com')
    expect(state.operatorEmail).toContain('@test.com')
    expect(state.adminToken).toBeDefined()
    console.log(`Tenant: ${state.tenantId}, Admin: ${state.adminEmail}`)
  })
})
