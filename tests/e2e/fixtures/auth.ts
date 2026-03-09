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

  for (let attempt = 0; attempt < 3; attempt++) {
    const loginError = page.locator('text=/429|too many|rate limit|aguarde/i')
    const hasError = await loginError.isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasError) break
    const waitTime = 3000 + attempt * 2000
    await page.waitForTimeout(waitTime)
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

  for (let attempt = 0; attempt < 3; attempt++) {
    const loginError = page.locator('text=/429|too many|rate limit|aguarde/i')
    const hasError = await loginError.isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasError) break
    const waitTime = 3000 + attempt * 2000
    await page.waitForTimeout(waitTime)
    await page.fill('input[type="password"]', state.operatorPassword)
    await page.click('button[type="submit"]')
  }
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 })
}

function createLoginForRole(
  getEmail: (s: ReturnType<typeof getState>) => string | undefined,
  getPassword: (s: ReturnType<typeof getState>) => string | undefined
) {
  return async (page: Page) => {
    const state = getState()
    const email = getEmail(state)
    const password = getPassword(state)
    if (!email || !password) throw new Error('Credenciais não configuradas para este role')
    await page.goto('/login')
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', password)
    await page.click('button[type="submit"]')

    for (let attempt = 0; attempt < 3; attempt++) {
      const loginError = page.locator('text=/429|too many|rate limit|aguarde/i')
      const hasError = await loginError.isVisible({ timeout: 3000 }).catch(() => false)
      if (!hasError) break
      const waitTime = 3000 + attempt * 2000
      await page.waitForTimeout(waitTime)
      await page.fill('input[type="password"]', password)
      await page.click('button[type="submit"]')
    }
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 })
  }
}

export const loginAsCompras = createLoginForRole((s) => s.comprasEmail, (s) => s.comprasPassword)
export const loginAsMrp = createLoginForRole((s) => s.mrpEmail, (s) => s.mrpPassword)
export const loginAsFiscal = createLoginForRole((s) => s.fiscalEmail, (s) => s.fiscalPassword)
export const loginAsContabilidade = createLoginForRole((s) => s.contabilidadeEmail, (s) => s.contabilidadePassword)

export async function logout(page: Page) {
  // Fechar qualquer modal aberto antes de tentar logout
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // Navegar direto para /login é mais confiável do que clicar em "Sair"
  await page.goto('/login')
  await page.waitForURL(/\/login/, { timeout: 10000 })
}
