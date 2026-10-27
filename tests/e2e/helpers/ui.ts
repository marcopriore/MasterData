import { expect, type Browser, type Page } from '@playwright/test'
import { authFile, getState, type RoleKey } from './state'

export const INACTIVE_MESSAGE = 'Usuário inativo. Fale com o administrador da sua empresa.'

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

export async function loginAs(page: Page, role: RoleKey) {
  const state = getState()
  await login(page, state.users[role].email, state.password)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
}

/** Página com a sessão salva do papel (projeto setup). */
export async function pageAs(browser: Browser, role: RoleKey) {
  const context = await browser.newContext({ storageState: authFile(role) })
  const page = await context.newPage()
  return { page, close: () => context.close() }
}

export function reqCode(id: number) {
  return `REQ-${String(id).padStart(4, '0')}`
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible()
}

/** Cartão do kanban da solicitação (o que tem o código e o botão de atendimento). */
export function kanbanCard(page: Page, id: number) {
  return page
    .locator('div')
    .filter({ has: page.getByText(reqCode(id), { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Iniciar Atendimento' }) })
    .last()
}

/**
 * Preenche os campos obrigatórios da etapa no modal da governança: rótulo com " *" e input #attr-<campo>.
 * Lista escolhe a primeira opção; NCM recebe 8 dígitos; número, 10; texto, um valor fixo.
 */
export async function fillRequiredStageFields(page: Page) {
  // Os campos da etapa carregam depois que o modal abre. Etapa sem campo próprio não mostra a seção;
  // se faltar obrigatório, o banco recusa a aprovação e o teste falha do mesmo jeito.
  await page.getByText(/CAMPOS DE RESPONSABILIDADE/).waitFor({ timeout: 8_000 }).catch(() => undefined)
  const labels = page.locator('label[for^="attr-"]').filter({ hasText: /\*\s*$/ })
  const count = await labels.count()
  for (let i = 0; i < count; i++) {
    const forId = await labels.nth(i).getAttribute('for')
    if (!forId) continue
    const field = page.locator(`[id="${forId}"]`)
    const tag = await field.evaluate((el) => el.tagName.toLowerCase())
    if (tag === 'select') {
      await field.selectOption({ index: 1 })
      continue
    }
    const type = (await field.getAttribute('type')) ?? 'text'
    if (forId === 'attr-ncm') await field.fill('84818099')
    else if (type === 'number') await field.fill('10')
    else await field.fill('E2E')
  }
}
