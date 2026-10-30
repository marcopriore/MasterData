import { supabaseAdmin } from '@/lib/supabase/admin'
import { MATERIAL_API_COLUMNS, toApiMaterial } from '@/lib/material-api/payload'
import { requestCode } from '@/lib/request-notices'
import { statusGroup } from '@/lib/request-status'
import { apiError, handleApiCall } from '@/lib/material-api/server'

export const runtime = 'nodejs'

const SITUACAO = { done: 'finalizada', rejected: 'rejeitada', cancelled: 'cancelada', open: 'em_andamento' } as const

/** Andamento da solicitação e, depois da última etapa, o material criado. Aceita 12 ou REQ-0012. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: raw } = await context.params
  return handleApiCall(request, 'consultar_solicitacao', async (client) => {
    const match = /^(?:REQ-)?0*(\d{1,9})$/i.exec(decodeURIComponent(raw ?? '').trim())
    if (!match) return apiError(400, 'id inválido')
    const id = Number(match[1])
    const codigo = requestCode(id)

    const { data: row } = await supabaseAdmin
      .from('material_requests')
      .select('id, status, workflow_id, origin, external_reference, created_at')
      .eq('id', id)
      .eq('tenant_id', client.tenantId)
      .maybeSingle()
    if (!row) return { ...apiError(404, 'solicitação não encontrada'), detail: codigo }

    const { data: step } = await supabaseAdmin
      .from('workflow_config')
      .select('step_name')
      .eq('workflow_id', row.workflow_id)
      .eq('status_key', row.status)
      .maybeSingle()

    const { data: material } = await supabaseAdmin
      .from('material_database')
      .select(MATERIAL_API_COLUMNS)
      .eq('tenant_id', client.tenantId)
      .eq('request_id', id)
      .maybeSingle()

    return {
      status: 200,
      body: {
        solicitacao: {
          id: row.id,
          codigo,
          status: row.status,
          etapa: step?.step_name ?? null,
          situacao: SITUACAO[statusGroup(row.status)],
          origem: row.origin ?? 'interno',
          referencia_externa: row.external_reference ?? null,
          criada_em: row.created_at,
        },
        material: material ? toApiMaterial(material as unknown as Record<string, unknown>) : null,
      },
      detail: codigo,
    }
  })
}
