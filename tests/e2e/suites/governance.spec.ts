import { expect, test } from '@playwright/test'
import { admin, must } from '../helpers/supabase'
import { getState, STAGES, updateState } from '../helpers/state'
import { expectToast, fillRequiredStageFields, kanbanCard, pageAs, reqCode } from '../helpers/ui'

const NEXT: Record<string, string> = {
  cadastro: 'compras',
  compras: 'mrp',
  mrp: 'fiscal',
  fiscal: 'contabilidade',
  contabilidade: 'finalizado',
}

async function statusOf(id: number) {
  const { data } = await admin.from('material_requests').select('status, assigned_to_id').eq('id', id).single()
  return data
}

test.describe.serial('04 - Governança: fluxo completo até o material', () => {
  test('outra área não atende a etapa de Cadastro', async ({ browser }) => {
    const state = getState()
    const { page, close } = await pageAs(browser, 'compras')
    try {
      await page.goto('/governance')
      await expect(page.getByText(/SOLICITA/i).first()).toBeVisible()
      await expect(kanbanCard(page, state.requestId!)).toHaveCount(0)
    } finally {
      await close()
    }
  })

  for (const stage of STAGES) {
    test(`${stage.status}: ${stage.role} atende, preenche os campos e aprova`, async ({ browser }) => {
      const state = getState()
      const id = state.requestId!
      expect((await statusOf(id))?.status).toBe(stage.status)

      const { page, close } = await pageAs(browser, stage.role)
      try {
        await page.goto('/governance')
        const card = kanbanCard(page, id)
        await card.getByRole('button', { name: 'Iniciar Atendimento' }).click()
        await expect(page.getByRole('button', { name: 'Salvar e Aprovar' })).toBeVisible()
        expect((await statusOf(id))?.assigned_to_id).toBe(state.users[stage.role].id)

        await fillRequiredStageFields(page)
        await page.getByRole('button', { name: 'Salvar e Aprovar' }).click()
        await expectToast(page, 'Dados salvos e solicitação aprovada!')
        await expect.poll(async () => (await statusOf(id))?.status).toBe(NEXT[stage.status])
      } finally {
        await close()
      }
    })
  }

  test('a última aprovação cria o material na base, pendente de ERP', async () => {
    const state = getState()
    const { data } = await admin
      .from('material_database')
      .select('id, id_sistema, tenant_id, status, erp_status, pdm_code, description')
      .eq('request_id', state.requestId!)
      .single()
    expect(data?.tenant_id).toBe(state.tenantId)
    expect(data?.status).toBe('Ativo')
    expect(data?.pdm_code).toBe(state.pdm.code)
    expect(data?.id_sistema).toMatch(/^MDM-\d{6}$/)
    expect(data?.erp_status).toBe('pendente_erp')
    updateState({ materialId: data!.id, materialCode: data!.id_sistema })

    const { data: history } = await admin.from('request_history').select('event_type').eq('request_id', state.requestId!)
    expect((history ?? []).filter((h) => h.event_type === 'approved')).toHaveLength(STAGES.length)
  })
})

test.describe('04 - Governança: rejeição', () => {
  test('cadastro rejeita com justificativa e a solicitação sai do fluxo', async ({ browser }) => {
    const state = getState()
    const { data: wf } = await admin.from('workflow_header').select('id').eq('tenant_id', state.tenantId).eq('is_active', true).single()
    const [req] = await must(admin.from('material_requests').insert({
      tenant_id: state.tenantId,
      pdm_id: state.pdm.id,
      workflow_id: wf!.id,
      status: 'cadastro',
      requester: state.users.solicitante.name,
      urgency: 'low',
      user_id: state.users.solicitante.id,
      generated_description: `${state.pdm.name} LAT R${state.runId}`,
      technical_attributes: { material: 'LATAO', modelo: `R${state.runId}` },
    }).select('id'), 'solicitação para rejeitar') as { id: number }[]

    const { page, close } = await pageAs(browser, 'cadastro')
    try {
      await page.goto('/governance')
      await kanbanCard(page, req.id).getByRole('button', { name: 'Iniciar Atendimento' }).click()
      await page.getByRole('button', { name: 'Rejeitar' }).click()
      await page.getByPlaceholder('Informe a justificativa...').fill('Teste E2E: falta desenho técnico')
      await page.getByRole('button', { name: 'Confirmar Rejeição' }).click()
      await expectToast(page, 'Solicitação rejeitada com sucesso!')
      await expect.poll(async () => (await statusOf(req.id))?.status).toBe('Rejected')
    } finally {
      await close()
    }

    const { data: history } = await admin.from('request_history').select('event_type, event_data').eq('request_id', req.id).eq('event_type', 'rejected').single()
    updateState({ rejectedId: req.id })
    // A tela grava a justificativa em maiúsculas.
    expect((history?.event_data as { justification?: string })?.justification).toBe('TESTE E2E: FALTA DESENHO TÉCNICO')
  })

  test('indicadores refletem a lista e a rejeitada fica só em Rejeitadas', async ({ browser }) => {
    const state = getState()
    const { page, close } = await pageAs(browser, 'admin')
    try {
      await page.goto('/governance')
      const indicator = (label: RegExp) => page.locator('p').filter({ hasText: label }).locator('xpath=preceding-sibling::p[1]')
      // 1 finalizada + 1 rejeitada, nenhuma em andamento
      await expect(indicator(/^EM ANDAMENTO$/)).toHaveText('0')
      await expect(indicator(/^TAXA DE REJEIÇÃO$/)).toHaveText('50%')
      await expect(indicator(/^IDADE MÉDIA EM ANDAMENTO$/)).toHaveText('—')
      await expect(page.getByText(/^Ciclo das finalizadas: .+ dias?$/)).toBeVisible()

      const column = (label: string) =>
        page.locator('div[class*="min-w-[250px]"]').filter({ has: page.getByText(label, { exact: true }) })
      const rejeitadas = column('Rejeitadas')
      await expect(rejeitadas.getByText(reqCode(state.rejectedId!), { exact: true })).toBeVisible()
      const cadastro = column('Central de Cadastro')
      await expect(cadastro.getByText(reqCode(state.rejectedId!), { exact: true })).toHaveCount(0)

      // A busca muda os indicadores: só a rejeitada
      await page.getByPlaceholder(/buscar/i).first().fill(reqCode(state.rejectedId!))
      await expect(indicator(/^TAXA DE REJEIÇÃO$/)).toHaveText('100%')
    } finally {
      await close()
    }
  })
})
