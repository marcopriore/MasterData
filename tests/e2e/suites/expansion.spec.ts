import { expect, test } from '@playwright/test'
import { admin } from '../helpers/supabase'
import { getState, updateState } from '../helpers/state'
import { pageAs, reqCode } from '../helpers/ui'

const CENTER_CODE = 'E2E1'

test.describe.serial('13 - Centros e Ampliação', () => {
  test('o administrador cadastra um centro em Administração → Centros', async ({ browser }) => {
    const { page, close } = await pageAs(browser, 'admin')
    try {
      await page.goto('/admin/centers')
      await page.locator('#center-code').fill(CENTER_CODE)
      await page.locator('#center-name').fill('Centro do teste')
      await page.getByRole('button', { name: 'Novo centro' }).click()
      await expect(page.getByTestId(`center-${CENTER_CODE}`)).toBeVisible()
      await expect(page.getByTestId(`center-${CENTER_CODE}`)).toContainText('CENTRO DO TESTE')
    } finally {
      await close()
    }
  })

  test('da pesquisa da nova solicitação, abre a Ampliação para o centro novo', async ({ browser }) => {
    test.slow()
    const state = getState()
    expect(state.materialCode, 'a suíte de governança cria o material').toBeTruthy()
    const { data: center } = await admin.from('centers').select('id').eq('tenant_id', state.tenantId).eq('code', CENTER_CODE).single()
    const { data: perCenter } = await admin.from('field_dictionary').select('field_name').eq('tenant_id', state.tenantId).eq('is_active', true).eq('per_center', true)

    const { page, close } = await pageAs(browser, 'solicitante')
    try {
      await page.goto('/requests/new')
      await page.getByPlaceholder('Digite a descrição ou código do material...').fill(state.materialCode!)
      await page.getByRole('button', { name: 'Pesquisar', exact: true }).click()
      await page.getByRole('button', { name: new RegExp(state.materialCode!) }).click()
      await page.getByRole('link', { name: 'Ampliação' }).click()
      await expect(page).toHaveURL(new RegExp(`/requests/ampliacao/${state.materialId}`))

      await page.locator('#expansion-center').selectOption(String(center!.id))
      await page.locator('#expansion-reason').fill('Teste E2E de ampliacao')
      await page.getByRole('button', { name: 'Abrir solicitação de ampliação' }).click()
      await expect(page).toHaveURL(/\/requests\?req=\d+/)

      const reqId = Number(new URL(page.url()).searchParams.get('req'))
      const { data } = await admin.from('material_requests').select('request_type, target_material_id, center_id, change_fields, status').eq('id', reqId).single()
      expect(data?.request_type).toBe('ampliacao')
      expect(data?.target_material_id).toBe(state.materialId)
      expect(data?.center_id).toBe(center!.id)
      expect([...(data?.change_fields ?? [])].sort()).toEqual((perCenter ?? []).map((f) => f.field_name).sort())
      expect(data?.status).toBe('cadastro')
      updateState({ expansionRequestId: reqId })
    } finally {
      await close()
    }
  })

  test('na Governança, a aba Ampliação mostra o centro novo', async ({ browser }) => {
    const state = getState()
    const { page, close } = await pageAs(browser, 'cadastro')
    try {
      await page.goto('/governance')
      await page.getByRole('tab', { name: 'Ampliação' }).click()
      await page.getByText(reqCode(state.expansionRequestId!), { exact: true }).first().click()
      await expect(page.getByText('Ampliação solicitada', { exact: false })).toBeVisible()
      await expect(page.getByText(`${CENTER_CODE} · CENTRO DO TESTE`)).toBeVisible()
      await expect(page.getByText('Motivo: TESTE E2E DE AMPLIACAO')).toBeVisible()
    } finally {
      await close()
    }
  })

  test('com centro cadastrado, a nova solicitação de cadastro pede o centro', async ({ browser }) => {
    const { page, close } = await pageAs(browser, 'solicitante')
    try {
      await page.goto('/requests/new')
      await page.getByPlaceholder('Digite a descrição ou código do material...').fill(`SEM RESULTADO ${Date.now()}`)
      await page.getByRole('button', { name: 'Pesquisar', exact: true }).click()
      await page.getByRole('button', { name: 'Não encontrei, criar solicitação' }).click()
      await expect(page.getByLabel('Centro do material')).toBeVisible()
      await page.getByRole('button', { name: 'Próximo' }).click()
      await expect(page.getByText('Escolha o centro do material.')).toBeVisible()
    } finally {
      await close()
    }
  })
})
