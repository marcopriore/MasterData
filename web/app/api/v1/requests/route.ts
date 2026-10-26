import { supabaseAdmin } from '@/lib/supabase/admin'
import { dispatchRequestNotice } from '@/lib/dispatch-request-notice'
import { parseRequestInput } from '@/lib/material-api/payload'
import { requestCode } from '@/lib/request-notices'
import { apiError, findPdm, handleApiCall, readJson } from '@/lib/material-api/server'
import { toErpDeep, toErpText } from '@/lib/erp-text'

export const runtime = 'nodejs'

/** Solicitação de origem externa. Segue o workflow ativo da empresa como uma solicitação interna. */
export async function POST(request: Request) {
  return handleApiCall(request, 'criar_solicitacao', async (client) => {
    const body = await readJson(request)
    if (!body.ok) return body.outcome
    const parsed = parseRequestInput(body.value)
    if (!parsed.ok) return apiError(400, 'dados inválidos', parsed.errors)
    const input = parsed.value

    const pdm = await findPdm(client.tenantId, input.pdmCode)
    if (!pdm || pdm.is_active === false) return apiError(422, 'pdm_codigo não encontrado ou inativo')

    const { data: workflow } = await supabaseAdmin
      .from('workflow_header')
      .select('id')
      .eq('tenant_id', client.tenantId)
      .eq('is_active', true)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!workflow) return apiError(422, 'nenhum workflow ativo na empresa')

    const { data: firstStep } = await supabaseAdmin
      .from('workflow_config')
      .select('status_key, step_name')
      .eq('workflow_id', workflow.id)
      .eq('is_active', true)
      .order('order', { ascending: true })
      .limit(1)
      .maybeSingle()
    const status = (firstStep?.status_key as string | undefined) ?? 'cadastro'

    const { data: created, error } = await supabaseAdmin
      .from('material_requests')
      .insert({
        tenant_id: client.tenantId,
        pdm_id: pdm.id,
        workflow_id: workflow.id,
        status,
        requester: input.requester,
        cost_center: input.costCenter,
        urgency: input.urgency,
        justification: input.justification,
        generated_description: input.description != null ? toErpText(input.description) : input.description,
        technical_attributes: Object.keys(input.attributes).length ? toErpDeep(input.attributes) : null,
        user_id: null,
        origin: 'externo',
        api_client_id: client.id,
        external_reference: input.externalReference,
      })
      .select('id, status, created_at')
      .single()
    if (error || !created) return apiError(500, 'não foi possível gravar a solicitação')

    await supabaseAdmin.from('request_history').insert({
      tenant_id: client.tenantId,
      request_id: created.id,
      user_id: null,
      event_type: 'created',
      message: `Solicitação criada por integração (${client.name})`.slice(0, 500),
      stage: status,
      event_data: { origem: 'externo', sistema: client.name, referencia_externa: input.externalReference },
    })

    const appOrigin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
    await dispatchRequestNotice({ requestId: created.id, actorId: null, appOrigin }).catch((err) => {
      console.error('aviso da solicitação externa:', err)
    })

    const codigo = requestCode(created.id)
    return {
      status: 201,
      body: {
        solicitacao: {
          id: created.id,
          codigo,
          status: created.status,
          etapa: firstStep?.step_name ?? null,
          referencia_externa: input.externalReference,
          criada_em: created.created_at,
        },
      },
      detail: codigo,
    }
  })
}
