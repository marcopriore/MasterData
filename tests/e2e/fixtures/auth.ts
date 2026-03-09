import { Page } from '@playwright/test'
import { getState } from '../helpers/state'

export async function loginAsMaster(page: Page) {
  await page.goto('/login')
  await page.fill('input[type="email"]', process.env.MASTER_EMAIL!)
  await page.fill('input[type="password"]', process.env.MASTER_PASSWORD!)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 })
}

export async function loginAsAdmin(page: Page) {
  const state = getState()
  await page.goto('/login')
  await page.fill('input[type="email"]', state.adminEmail)
  await page.fill('input[type="password"]', state.adminPassword)
  await page.click('button[type="submit"]')
  const loginError = page.locator('text=/429|too many|rate limit|aguarde/i')
  if (await loginError.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.waitForTimeout(3000)
    await page.fill('input[type="password"]', state.adminPassword)
    await page.click('button[type="submit"]')
  }
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 })
}

export async function loginAsOperator(page: Page) {
  const state = getState()
  await page.goto('/login')
  await page.fill('input[type="email"]', state.operatorEmail)
  await page.fill('input[type="password"]', state.operatorPassword)
  await page.click('button[type="submit"]')
  const loginError = page.locator('text=/429|too many|rate limit|aguarde/i')
  if (await loginError.isVisible({ timeout: 2000 }).catch(() => false)) {
    await page.waitForTimeout(3000)
    await page.fill('input[type="password"]', state.operatorPassword)
    await page.click('button[type="submit"]')
  }
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 })
}

export async function logout(page: Page) {
  await page.click('text=Sair')
  await page.waitForURL(/\/login/, { timeout: 10000 })
}
