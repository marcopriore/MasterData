import 'server-only'
import { findDuplicateBlocks, type GuardMaterial } from '@/lib/erp/duplicate-guard'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { RequestErpInfo } from '@/lib/request-erp-state'

const NEEDS_CHECK = ['pendente_erp', 'erro_erp']
const MATERIAL_COLS = 'id, tenant_id, id_sistema, id_erp, status, erp_status, erp_error_message, description, detailed_description, pdm_code, technical_attributes, request_id'

type MaterialRow = GuardMaterial & {
  id_erp: string | null
  erp_status: string | null
  erp_error_message: string | null
}

type RequestRow = {
  id: number
  born: MaterialRow[] | null
  target: MaterialRow | MaterialRow[] | null
}

/**
 * Situação no ERP do material de cada solicitação, com a mesma trava de duplicidade da base.
 * Uma consulta traz o material nascido da solicitação e o de origem da alteração (migration 043);
 * o tenant vem de quem chama (getCallerAccess ou o usuário da página no servidor).
 */
export async function loadRequestErpInfo(tenantId: number, requestIds: number[]): Promise<RequestErpInfo[]> {
  const ids = [...new Set(requestIds)]
  if (ids.length === 0) return []

  const { data, error } = await supabaseAdmin
    .from('material_requests')
    .select(`id, born:material_database!request_id(${MATERIAL_COLS}), target:material_database!target_material_id(${MATERIAL_COLS})`)
    .eq('tenant_id', tenantId)
    .in('id', ids)
  if (error) throw new Error(error.message)

  const byRequest = new Map<number, MaterialRow>()
  for (const row of (data ?? []) as unknown as RequestRow[]) {
    const target = Array.isArray(row.target) ? row.target[0] : row.target
    const born = row.born?.[0]
    const material = target ?? born
    if (material && Number(material.tenant_id) === tenantId) byRequest.set(row.id, material)
  }

  const toCheck = [...new Map(
    [...byRequest.values()]
      .filter((row) => row.status !== 'Obsoleto' && NEEDS_CHECK.includes(row.erp_status ?? ''))
      .map((row) => [row.id, row])
  ).values()]
  const blocks = await findDuplicateBlocks(tenantId, toCheck)

  return requestIds.map((requestId) => {
    const row = byRequest.get(requestId)
    if (!row) return { request_id: requestId, material: null, duplicate_codes: [] }
    return {
      request_id: requestId,
      material: {
        id: row.id,
        id_sistema: row.id_sistema ?? null,
        id_erp: row.id_erp ?? null,
        status: row.status ?? null,
        erp_status: row.erp_status ?? null,
        erp_error_message: row.erp_error_message ?? null,
      },
      duplicate_codes: blocks.get(row.id)?.codes ?? [],
    }
  })
}
