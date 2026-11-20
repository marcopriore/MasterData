import type { SupabaseClient } from '@supabase/supabase-js'
import { groupMaterialDuplicates, type DuplicateCandidate } from '@/lib/material-duplicates'
import { safeSearchTerm } from '@/lib/search-term'
import type { MaterialsResponse } from '@/lib/supabase-api'

/** Leituras da Base de Dados (servidor e navegador; o RLS isola a empresa). */

const MATERIALS_LIST_COLS = 'id, id_sistema, id_erp, description, detailed_description, status, pdm_code, pdm_name, material_group, unit_of_measure, ncm, material_type, erp_status, standardized_at, created_at'

export type MaterialsParams = {
  page?: number
  limit?: number
  q?: string
  status?: string
  pdm_code?: string
  erp_status?: string
  date_from?: string
  date_to?: string
}

export type PdmOption = { id: number; name: string; internal_code: string }

/** Uma página da lista de materiais, com o total. Mesma consulta de antes, sem mudança de regra. */
export async function listMaterials(db: SupabaseClient, params: MaterialsParams): Promise<MaterialsResponse> {
  const page = params.page ?? 1
  const limit = params.limit ?? 50
  let q = db.from('material_database').select(MATERIALS_LIST_COLS, { count: 'exact' })

  const term = safeSearchTerm(params.q)
  if (term) q = q.or(`id_sistema.ilike.%${term}%,description.ilike.%${term}%,id_erp.ilike.%${term}%`)
  if (params.status) q = q.eq('status', params.status)
  if (params.pdm_code) q = q.eq('pdm_code', params.pdm_code)
  if (params.erp_status) q = q.eq('erp_status', params.erp_status)
  if (params.date_from) q = q.gte('created_at', params.date_from)
  if (params.date_to) q = q.lte('created_at', `${params.date_to}T23:59:59.999Z`)

  const from = (page - 1) * limit
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, from + limit - 1)
  if (error) throw new Error(error.message)
  return { total: count ?? 0, page, limit, items: (data ?? []) as MaterialsResponse['items'] }
}

/**
 * Nome e código dos PDMs da empresa em uso, para o filtro. O Master enxerga outras empresas pela RLS,
 * então o filtro é explícito. Sem a contagem de materiais (a tela não usa), que custava uma consulta própria.
 */
export async function listPdmOptions(db: SupabaseClient, tenantId: number): Promise<PdmOption[]> {
  const { data, error } = await db
    .from('pdm_templates')
    .select('id, name, internal_code')
    .eq('tenant_id', tenantId)
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as PdmOption[]
}

/** Selo DUP dos materiais informados. O banco devolve os candidatos; a regra é a de material-duplicates. */
export async function listDuplicateMaterials(db: SupabaseClient, materialIds: number[]): Promise<Map<number, string[]>> {
  if (materialIds.length === 0) return new Map()
  const { data, error } = await db.rpc('material_duplicate_candidates', { p_ids: materialIds })
  if (error) throw new Error(error.message)
  const all = groupMaterialDuplicates((data ?? []) as DuplicateCandidate[])
  const wanted = new Set(materialIds)
  return new Map([...all].filter(([id]) => wanted.has(id)))
}
