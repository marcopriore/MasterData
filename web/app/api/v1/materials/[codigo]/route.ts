import { supabaseAdmin } from '@/lib/supabase/admin'
import { MATERIAL_API_COLUMNS, parseMaterialInput, toApiMaterial } from '@/lib/material-api/payload'
import { apiError, applyMaterialRules, findMaterialByCode, findPdm, handleApiCall, readJson, validCode } from '@/lib/material-api/server'
import { materialTypeChanged } from '@/lib/material-rules'

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

    const current = await findMaterialByCode(client.tenantId, code, '*')
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
    const sent = (changes.technical_attributes ?? {}) as Record<string, unknown>
    const before = (current.technical_attributes ?? {}) as Record<string, unknown>
    const after = { ...current, ...changes, technical_attributes: { ...before, ...sent } }
    if (materialTypeChanged(current, after)) return { ...apiError(422, 'tipo_material não pode ser alterado em material já cadastrado (o ERP não permite)'), detail }
    const checked = await applyMaterialRules(client.tenantId, after, sent)
    if (!checked.ok) return { ...checked.outcome, detail }
    if (changes.technical_attributes || checked.warnings.length) changes.technical_attributes = checked.technicalAttributes

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
    const material = toApiMaterial(data as unknown as Record<string, unknown>)
    return { status: 200, body: checked.warnings.length ? { material, avisos: checked.warnings } : { material }, detail }
  })
}
