import { supabaseAdmin } from '@/lib/supabase/admin'
import { MATERIAL_API_COLUMNS, MATERIAL_STATUS, parseMaterialInput, toApiMaterial } from '@/lib/material-api/payload'
import { apiError, findPdm, handleApiCall, readJson } from '@/lib/material-api/server'

export const runtime = 'nodejs'

const ERP_STATUS = ['pendente_erp', 'integrando', 'integrado', 'integrado_erp', 'erro_erp']

/** Criação direta na base. O material nasce Pendente ERP; uma pessoa integra depois. */
export async function POST(request: Request) {
  return handleApiCall(request, 'criar_material', async (client) => {
    const body = await readJson(request)
    if (!body.ok) return body.outcome
    const parsed = parseMaterialInput(body.value, 'create')
    if (!parsed.ok) return apiError(400, 'dados inválidos', parsed.errors)

    const row: Record<string, unknown> = { ...parsed.value, api_client_id: client.id }
    if (typeof row.pdm_code === 'string') {
      const pdm = await findPdm(client.tenantId, row.pdm_code)
      if (!pdm) return apiError(422, 'pdm_codigo não encontrado')
      row.pdm_name = pdm.name
    }

    const { data, error } = await supabaseAdmin.rpc('api_insert_material', {
      p_tenant_id: client.tenantId,
      p_row: row,
    })
    if (error) return apiError(500, 'não foi possível gravar o material')
    const material = toApiMaterial(data as Record<string, unknown>)
    return { status: 201, body: { material }, detail: String(material.id_sistema ?? '') }
  })
}

/** Consulta com filtro: q, status, erp_status, pdm_codigo, alterado_desde, pagina, limite. */
export async function GET(request: Request) {
  return handleApiCall(request, 'consultar_material', async (client) => {
    const params = new URL(request.url).searchParams
    const page = Math.max(1, Number(params.get('pagina') ?? 1) || 1)
    const limit = Math.min(100, Math.max(1, Number(params.get('limite') ?? 50) || 50))
    const status = params.get('status')
    const erpStatus = params.get('erp_status')
    const since = params.get('alterado_desde')
    const q = (params.get('q') ?? '').replace(/[^\p{L}\p{N}\s\-_/]/gu, '').trim().slice(0, 100)

    if (status && !(MATERIAL_STATUS as readonly string[]).includes(status)) {
      return apiError(400, `status deve ser ${MATERIAL_STATUS.join(', ')}`)
    }
    if (erpStatus && !ERP_STATUS.includes(erpStatus)) {
      return apiError(400, `erp_status deve ser ${ERP_STATUS.join(', ')}`)
    }
    if (since && Number.isNaN(Date.parse(since))) return apiError(400, 'alterado_desde deve ser data ISO')

    let query = supabaseAdmin
      .from('material_database')
      .select(MATERIAL_API_COLUMNS, { count: 'exact' })
      .eq('tenant_id', client.tenantId)
      .order('id', { ascending: true })
      .range((page - 1) * limit, page * limit - 1)
    const groups: string[] = []
    if (q) groups.push(`description.ilike.%${q}%,id_sistema.ilike.%${q}%,id_erp.ilike.%${q}%`)
    if (since) {
      const iso = new Date(since).toISOString()
      groups.push(`updated_at.gte.${iso},created_at.gte.${iso}`)
    }
    if (groups.length === 1) query = query.or(groups[0])
    if (groups.length === 2) query = query.or(`and(or(${groups[0]}),or(${groups[1]}))`)
    if (status) query = query.eq('status', status)
    if (erpStatus) query = query.eq('erp_status', erpStatus)
    const pdm = params.get('pdm_codigo')
    if (pdm) query = query.eq('pdm_code', pdm)

    const { data, error, count } = await query
    if (error) return apiError(500, 'não foi possível consultar')
    const itens = (data ?? []).map((row) => toApiMaterial(row as unknown as Record<string, unknown>))
    return {
      status: 200,
      body: { total: count ?? itens.length, pagina: page, limite: limit, itens },
      detail: `${itens.length} de ${count ?? itens.length}`,
    }
  })
}
