import { supabaseAdmin } from '@/lib/supabase/admin'
import { MATERIAL_API_COLUMNS, parseMaterialInput, toApiMaterial } from '@/lib/material-api/payload'
import { apiError, findMaterialByCode, findPdm, handleApiCall, readJson, validCode } from '@/lib/material-api/server'

export const runtime = 'nodejs'

type Context = { params: Promise<{ codigo: string }> }

/** Consulta por id_sistema (MDM-######) ou por id_erp. */
export async function GET(request: Request, context: Context) {
  const { codigo } = await context.params
  return handleApiCall(request, 'consultar_material', async (client) => {
    const code = decodeURIComponent(codigo ?? '')
    if (!validCode(code)) return apiError(400, 'código inválido')
    const row = await findMaterialByCode(client.tenantId, code, MATERIAL_API_COLUMNS)
    if (!row) return { ...apiError(404, 'material não encontrado'), detail: code }
    return { status: 200, body: { material: toApiMaterial(row) }, detail: String(row.id_sistema ?? code) }
  })
}

/** Alteração parcial. O material volta para Pendente ERP até uma pessoa integrar. */
export async function PATCH(request: Request, context: Context) {
  const { codigo } = await context.params
  return handleApiCall(request, 'alterar_material', async (client) => {
    const code = decodeURIComponent(codigo ?? '')
    if (!validCode(code)) return apiError(400, 'código inválido')

    const current = await findMaterialByCode(client.tenantId, code, 'id, id_sistema, erp_status, technical_attributes')
    if (!current) return { ...apiError(404, 'material não encontrado'), detail: code }
    const detail = String(current.id_sistema ?? code)
    if (current.erp_status === 'integrando') {
      return { ...apiError(409, 'material em integração com o ERP; tente de novo em instantes'), detail }
    }

    const body = await readJson(request)
    if (!body.ok) return { ...body.outcome, detail }
    const parsed = parseMaterialInput(body.value, 'update')
    if (!parsed.ok) return { ...apiError(400, 'dados inválidos', parsed.errors), detail }

    const changes: Record<string, unknown> = { ...parsed.value }
    if ('pdm_code' in changes) {
      if (typeof changes.pdm_code === 'string') {
        const pdm = await findPdm(client.tenantId, changes.pdm_code)
        if (!pdm) return { ...apiError(422, 'pdm_codigo não encontrado'), detail }
        changes.pdm_name = pdm.name
      } else {
        changes.pdm_name = null
      }
    }
    if (changes.technical_attributes) {
      const before = (current.technical_attributes ?? {}) as Record<string, unknown>
      changes.technical_attributes = { ...before, ...(changes.technical_attributes as Record<string, unknown>) }
    }

    const { data, error } = await supabaseAdmin
      .from('material_database')
      .update({
        ...changes,
        erp_status: 'pendente_erp',
        erp_error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id as number)
      .eq('tenant_id', client.tenantId)
      .select(MATERIAL_API_COLUMNS)
      .single()
    if (error || !data) return { ...apiError(500, 'não foi possível alterar o material'), detail }
    return { status: 200, body: { material: toApiMaterial(data as unknown as Record<string, unknown>) }, detail }
  })
}
