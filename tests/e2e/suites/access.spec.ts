import { expect, test } from '@playwright/test'
import { authFile } from '../helpers/state'

// Solicitante do onboarding: vê PDM e workflows, não edita; não administra usuários.
test.use({ storageState: authFile('solicitante') })

test.describe('12 - Acesso pelo endereço da tela', () => {
  test('tela sem permissão não abre pelo link', async ({ page }) => {
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Novo Usuário' })).toHaveCount(0)

    await page.goto('/admin-pdm/novo')
    await expect(page.getByRole('heading', { name: 'Acesso negado' })).toBeVisible()
  })

  test('só ver PDM: a lista abre sem criar nem importar', async ({ page }) => {
    await page.goto('/admin-pdm')
    await expect(page.getByRole('heading', { name: 'Acesso negado' })).toHaveCount(0)
    await expect(page.getByText(/PDM/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Novo PDM' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Importação em Massa' })).toHaveCount(0)
  })

  test('só ver workflows: a tela abre somente para leitura', async ({ page }) => {
    await page.goto('/settings/workflow')
    await expect(page.getByText('Somente visualização: seu perfil não tem permissão para editar workflows.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Novo Workflow' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Salvar Novo Fluxo' })).toHaveCount(0)
  })
})
