import { supabaseAdmin } from '@/lib/supabase/admin'
import { CANCELLED_STATUSES, DONE_STATUSES, REJECTED_STATUSES } from '@/lib/request-status'
import {
  attrsMatch,
  countsForDuplicate,
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
/** Consultas por vez (a lista da Governança pode pedir 200 de uma vez). */
const BASE_CONCURRENCY = 6

export type GuardMaterial = DuplicateCandidate & {
  tenant_id?: number
  technical_attributes?: unknown
  request_id?: number | null
}

type AttrRow = { id: number; id_sistema: string | null; status: string | null; technical_attributes: unknown }
type RequestAttrRow = AttrRow & { target_material_id: number | null }

/** Materiais e solicitações do mesmo PDM. Referência em memória da regra de solicitação (ver requestDuplicateCodes). */
export type PdmGroup = { keys: string[]; materials: AttrRow[]; requests: RequestAttrRow[] }

/** Padrão de ilike que casa o texto inteiro; o filtro exato é feito depois, em duplicatesOf. */
function exactPattern(text: string) {
  return text.trim().replace(/[\\%_*]/g, (c) => `\\${c}`)
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      out[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
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

/**
 * Duplicidade de solicitação, comparada no banco (função request_duplicate_codes, migration 054).
 * Um material por chamada; a função já faz a leitura do PDM, dos atributos da descrição e dos candidatos.
 */
async function requestCodesOf(tenantId: number, material: GuardMaterial): Promise<string[]> {
  if (!material.request_id || !material.pdm_code) return []
  const { data, error } = await supabaseAdmin.rpc('request_duplicate_codes', {
    p_tenant_id: tenantId,
    p_material_id: material.id,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as string[]
}

/** Regra de solicitação em memória, com o mesmo critério da função do banco. Referência para testes e paridade. */
export function requestDuplicateCodes(material: GuardMaterial, group: PdmGroup | undefined): string[] {
  if (!material.request_id || !material.pdm_code || !group || group.keys.length === 0) return []
  const target = pickDescriptionAttrs(material.technical_attributes, group.keys)
  if (Object.keys(target).length === 0) return []

  const codes: string[] = []
  for (const row of group.materials) {
    if (row.id === material.id || !countsForDuplicate(row)) continue
    if (attrsMatch(target, pickDescriptionAttrs(row.technical_attributes, group.keys))) codes.push(row.id_sistema ?? `#${row.id}`)
  }
  for (const row of group.requests) {
    if (row.id === material.request_id) continue
    // A alteração aberta do próprio material (migration 043) não é duplicidade dele.
    if (row.target_material_id != null && Number(row.target_material_id) === Number(material.id)) continue
    if (OPEN_REQUEST_EXCLUDED.includes(String(row.status ?? '').toLowerCase())) continue
    if (attrsMatch(target, pickDescriptionAttrs(row.technical_attributes, group.keys))) {
      codes.push(`solicitação ${row.id_sistema ?? `#${row.id}`}`)
    }
  }
  return codes
}

function blockOf(codes: string[]): DuplicateBlock | null {
  const unique = [...new Set(codes)]
  if (unique.length === 0) return null
  return {
    codes: unique,
    reason: `duplicado de ${unique.join(', ')}. Corrija a descrição ou deixe o outro item Obsoleto antes de integrar`,
  }
}

/**
 * Trava do ERP para vários materiais. A base e as solicitações são consultadas em paralelo;
 * a marcação é calculada na hora e some quando a descrição muda ou o outro material fica Obsoleto.
 */
export async function findDuplicateBlocks(tenantId: number, materials: GuardMaterial[]): Promise<Map<number, DuplicateBlock | null>> {
  const checked = materials.filter((material) => countsForDuplicate(material))

  const [bases, requestCodes] = await Promise.all([
    mapLimit(checked, BASE_CONCURRENCY, (material) => baseCandidates(tenantId, material)),
    mapLimit(checked, BASE_CONCURRENCY, (material) => requestCodesOf(tenantId, material)),
  ])

  const result = new Map<number, DuplicateBlock | null>(materials.map((material) => [material.id, null]))
  checked.forEach((material, index) => {
    const base = duplicatesOf(material, bases[index])
    result.set(material.id, blockOf([...base, ...requestCodes[index]]))
  })
  return result
}

/** Trava do ERP: material marcado como duplicado não é criado nem alterado no ERP. */
export async function findDuplicateBlock(tenantId: number, material: GuardMaterial): Promise<DuplicateBlock | null> {
  return (await findDuplicateBlocks(tenantId, [material])).get(material.id) ?? null
}
