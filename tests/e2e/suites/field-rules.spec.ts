import { expect, test } from '@playwright/test'
import { admin, must } from '../helpers/supabase'
import { getState } from '../helpers/state'
import { expectToast, kanbanCard, pageAs } from '../helpers/ui'

/** Primeiro valor da lista do campo, no formato que o dicionário guarda. */
function firstOption(options: unknown): string {
  const list = Array.isArray(options)
    ? options
    : Array.isArray((options as { values?: unknown[] } | null)?.values) ? (options as { values: unknown[] }).values : []
  const first = list[0]
  return first && typeof first === 'object' ? String((first as { value?: unknown }).value ?? '') : String(first ?? '')
}

// Roda por último: a regra criada aqui mudaria os campos das outras suítes no mesmo tenant.
test.describe.serial('10 - Regras de campos por material', () => {
  let profileId = 0
  let requestId = 0
  let ruleName = ''

  test.beforeAll(async () => {
    const state = getState()
    const { data: fields } = await admin
      .from('field_dictionary')
      .select('field_name, options, responsible_role')
      .eq('tenant_id', state.tenantId)
      .in('field_name', ['tipo_material', 'lote_minimo'])
      .eq('is_active', true)
    const tipoField = (fields ?? []).find((f) => f.field_name === 'tipo_material')
    const loteField = (fields ?? []).find((f) => f.field_name === 'lote_minimo')
    expect(tipoField, 'o tenant do E2E precisa do campo tipo_material').toBeTruthy()
    expect(loteField?.responsible_role, 'lote_minimo vem do MRP no padrão').toBe('MRP')
    const tipo = firstOption(tipoField!.options)
    expect(tipo).not.toBe('')

    ruleName = `E2E REGRA ${state.runId}`.toUpperCase()
    const [profile] = await must(admin.from('field_rule_profiles').insert({
      tenant_id: state.tenantId,
      name: ruleName,
      conditions: { tipo_material: tipo },
      rules: { lote_minimo: { role: 'CADASTRO', requirement: 'required' } },
    }).select('id'), 'regra') as { id: number }[]
    profileId = profile.id

    const { data: wf } = await admin.from('workflow_header').select('id').eq('tenant_id', state.tenantId).eq('is_active', true).single()
    const [req] = await must(admin.from('material_requests').insert({
      tenant_id: state.tenantId,
      pdm_id: state.pdm.id,
      workflow_id: wf!.id,
      status: 'cadastro',
      requester: state.users.solicitante.name,
      urgency: 'low',
      user_id: state.users.solicitante.id,
      generated_description: `${state.pdm.name} REGRA ${state.runId}`,
      technical_attributes: { tipo_material: tipo },
    }).select('id'), 'solicitação com tipo') as { id: number }[]
    requestId = req.id
  })

  test.afterAll(async () => {
    if (profileId) await admin.from('field_rule_profiles').delete().eq('id', profileId)
  })

  test('a regra aparece na aba Regras do Dicionário de Campos', async ({ browser }) => {
    const { page, close } = await pageAs(browser, 'admin')
    try {
      await page.goto('/admin/fields')
      await page.getByRole('tab', { name: /Regras/ }).click()
      await expect(page.getByText(ruleName)).toBeVisible()
    } finally {
      await close()
    }
  })

  test('no Cadastro, o campo que a regra trouxe do MRP aparece obrigatório e é cobrado', async ({ browser }) => {
    test.slow()
    const { page, close } = await pageAs(browser, 'cadastro')
    try {
      await page.goto('/governance')
      await kanbanCard(page, requestId).getByRole('button', { name: 'Iniciar Atendimento' }).click()
      const label = page.locator('label[for="attr-lote_minimo"]')
      await expect(label).toBeVisible()
      await expect(label).toHaveText(/\*\s*$/)

      await page.getByRole('button', { name: 'Salvar e Aprovar' }).click()
      await expectToast(page, 'Preencha os campos obrigatórios.')
      const { data } = await admin.from('material_requests').select('status').eq('id', requestId).single()
      expect(data?.status).toBe('cadastro')
    } finally {
      await close()
    }
  })

  test('o banco também cobra: sem o campo, a aprovação é recusada', async () => {
    const state = getState()
    const { data } = await admin.rpc('stage_missing_fields', {
      p_tenant_id: state.tenantId,
      p_status: 'cadastro',
      p_attributes: (await admin.from('material_requests').select('technical_attributes').eq('id', requestId).single()).data?.technical_attributes ?? {},
    })
    expect(String(data ?? '')).toContain('Lote')
  })
})
