import { expect, test } from '@playwright/test'
import { admin } from '../helpers/supabase'
import { getState, updateState } from '../helpers/state'
import { pageAs, reqCode } from '../helpers/ui'

/** Um campo do Cadastro, de lista, para a alteração passar pela primeira etapa. */
async function cadastroSelectField(tenantId: number) {
  const { data } = await admin
    .from('field_dictionary')
    .select('field_name, field_label, options')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('responsible_role', 'CADASTRO')
    .eq('field_type', 'select')
    .neq('field_name', 'tipo_material')
    .order('display_order')
  const field = (data ?? []).find((f) => Array.isArray(f.options) ? f.options.length >= 2 : Array.isArray((f.options as { values?: unknown[] } | null)?.values))
  expect(field, 'o tenant do E2E precisa de um campo de lista do Cadastro').toBeTruthy()
  return field!
}

test.describe.serial('11 - Alteração de material', () => {
  test('da pesquisa da nova solicitação, abre a Alteração do material', async ({ browser }) => {
    test.slow()
    const state = getState()
    expect(state.materialCode, 'a suíte de governança cria o material').toBeTruthy()
    const field = await cadastroSelectField(state.tenantId)

    const { page, close } = await pageAs(browser, 'solicitante')
    try {
      await page.goto('/requests/new')
      await page.getByPlaceholder('Digite a descrição ou código do material...').fill(state.materialCode!)
      await page.getByRole('button', { name: 'Pesquisar', exact: true }).click()
      await page.getByRole('button', { name: new RegExp(state.materialCode!) }).click()
      await page.getByRole('link', { name: 'Alteração' }).click()
      await expect(page).toHaveURL(new RegExp(`/requests/alteracao/${state.materialId}`))

      await page.getByLabel(`Alterar ${field.field_label}`).check()
      const select = page.getByLabel(`Novo valor de ${field.field_label}`)
      const current = await select.inputValue()
      const options = await select.locator('option').evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value).filter(Boolean))
      const next = options.find((o) => o !== current)!
      await select.selectOption(next)
      await page.locator('#change-reason').fill('Teste E2E de alteracao')
      await page.getByRole('button', { name: 'Abrir solicitação de alteração' }).click()
      await expect(page).toHaveURL(/\/requests\?req=\d+/)

      const reqId = Number(new URL(page.url()).searchParams.get('req'))
      const { data } = await admin.from('material_requests').select('request_type, target_material_id, change_fields, change_previous, technical_attributes, status').eq('id', reqId).single()
      expect(data?.request_type).toBe('alteracao')
      expect(data?.target_material_id).toBe(state.materialId)
      expect(data?.change_fields).toEqual([field.field_name])
      expect((data?.technical_attributes as Record<string, unknown>)[field.field_name]).toBe(next)
      expect(data?.status).toBe('cadastro')
      updateState({ changeRequestId: reqId })
    } finally {
      await close()
    }
  })

  test('na Governança, a aba Alteração mostra o pedido com o valor atual e o novo', async ({ browser }) => {
    const state = getState()
    const { page, close } = await pageAs(browser, 'cadastro')
    try {
      await page.goto('/governance')
      await page.getByRole('tab', { name: 'Alteração' }).click()
      const code = reqCode(state.changeRequestId!)
      await page.getByText(code, { exact: true }).first().click()
      await expect(page.getByText('Alteração solicitada', { exact: false })).toBeVisible()
      await expect(page.getByText('Motivo: TESTE E2E DE ALTERACAO')).toBeVisible()
    } finally {
      await close()
    }
  })
})
