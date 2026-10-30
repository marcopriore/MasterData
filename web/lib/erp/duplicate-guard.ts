import { supabaseAdmin } from '@/lib/supabase/admin'
import { CANCELLED_STATUSES, DONE_STATUSES, REJECTED_STATUSES } from '@/lib/request-status'
import {
  attrsMatch,
  countsForDuplicate,
  descriptionAttrKeys,
  duplicatesOf,
  pickDescriptionAttrs,
  type DuplicateCandidate,
} from '@/lib/material-duplicates'

export type DuplicateBlock = {
  /** Códigos dos materiais e solicitações que duplicam o material. */
  codes: string[]
  reason: string
}

const OPEN_REQUEST_EXCLUDED = [...DONE_STATUSES, ...REJECTED_STATUSES, ...CANCELLED_STATUSES]
const CANDIDATE_COLS = 'id, id_sistema, description, detailed_description, pdm_code, status'

type GuardMaterial = DuplicateCandidate & {
  tenant_id?: number
  technical_attributes?: unknown
  request_id?: number | null
}

/** Padrão de ilike que casa o texto inteiro; o filtro exato é feito depois, em duplicatesOf. */
function exactPattern(text: string) {
  return text.trim().replace(/[\\%_*]/g, (c) => `\\${c}`)
}

async function baseCandidates(tenantId: number, material: GuardMaterial): Promise<DuplicateCandidate[]> {
  const detailed = (material.detailed_description ?? '').trim()
  const short = (material.description ?? '').trim()
  if (!detailed && !short) return []
  const query = supabaseAdmin
    .from('material_database')
    .select(CANDIDATE_COLS)
    .eq('tenant_id', tenantId)
    .neq('id', material.id)
  const { data } = await (detailed
    ? query.ilike('detailed_description', `%${exactPattern(detailed)}%`)
    : query.ilike('description', exactPattern(short))
  ).limit(50)
  return (data ?? []) as DuplicateCandidate[]
}

/** Duplicidade de solicitação: mesmos atributos da descrição que outro material ou outra solicitação aberta do mesmo PDM. */
async function requestDuplicates(tenantId: number, material: GuardMaterial): Promise<string[]> {
  if (!material.request_id || !material.pdm_code) return []
  const { data: pdm } = await supabaseAdmin
    .from('pdm_templates')
    .select('id, attributes')
    .eq('tenant_id', tenantId)
    .eq('internal_code', material.pdm_code)
    .maybeSingle()
  const keys = descriptionAttrKeys(pdm?.attributes)
  if (!pdm || keys.length === 0) return []
  const target = pickDescriptionAttrs(material.technical_attributes, keys)
  if (Object.keys(target).length === 0) return []

  const [materials, requests] = await Promise.all([
    supabaseAdmin.from('material_database')
      .select('id, id_sistema, status, technical_attributes')
      .eq('tenant_id', tenantId).eq('pdm_code', material.pdm_code).neq('id', material.id),
    supabaseAdmin.from('material_requests')
      .select('id, id_sistema, status, technical_attributes')
      .eq('tenant_id', tenantId).eq('pdm_id', pdm.id).neq('id', material.request_id),
  ])

  const codes: string[] = []
  for (const row of materials.data ?? []) {
    if (!countsForDuplicate(row)) continue
    if (attrsMatch(target, pickDescriptionAttrs(row.technical_attributes, keys))) codes.push(row.id_sistema ?? `#${row.id}`)
  }
  for (const row of requests.data ?? []) {
    if (OPEN_REQUEST_EXCLUDED.includes(String(row.status ?? '').toLowerCase())) continue
    if (attrsMatch(target, pickDescriptionAttrs(row.technical_attributes, keys))) {
      codes.push(`solicitação ${row.id_sistema ?? `#${row.id}`}`)
    }
  }
  return codes
}

/**
 * Trava do ERP: material marcado como duplicado não é criado nem alterado no ERP.
 * A marcação é calculada na hora; some quando a descrição muda ou o outro material fica Obsoleto.
 */
export async function findDuplicateBlock(tenantId: number, material: GuardMaterial): Promise<DuplicateBlock | null> {
  if (!countsForDuplicate(material)) return null
  const base = duplicatesOf(material, await baseCandidates(tenantId, material))
  const fromRequest = await requestDuplicates(tenantId, material)
  const codes = [...new Set([...base, ...fromRequest])]
  if (codes.length === 0) return null
  return {
    codes,
    reason: `duplicado de ${codes.join(', ')}. Corrija a descrição ou deixe o outro item Obsoleto antes de integrar`,
  }
}
