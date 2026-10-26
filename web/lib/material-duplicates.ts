/**
 * Regra de duplicidade de material, sem banco. A tela (selo DUP) e o servidor (trava do ERP) usam a mesma.
 *
 * Base: mesma descrição detalhada; sem detalhada, mesma descrição curta no mesmo PDM.
 * Solicitação: mesmos atributos que entram na descrição, no mesmo PDM.
 * Material Obsoleto não conta: obsoletar um dos duplicados é como a duplicidade se resolve.
 */

export type DuplicateCandidate = {
  id: number
  id_sistema?: string | null
  description?: string | null
  detailed_description?: string | null
  pdm_code?: string | null
  status?: string | null
}

export function countsForDuplicate(row: Pick<DuplicateCandidate, 'status'>): boolean {
  return (row.status ?? '').trim() !== 'Obsoleto'
}

/** Chave de comparação da base; null quando o material não tem descrição nenhuma. */
export function duplicateKey(row: DuplicateCandidate): string | null {
  const detailed = (row.detailed_description ?? '').trim().toLowerCase()
  if (detailed) return `d:${detailed}`
  const short = (row.description ?? '').trim().toLowerCase()
  if (!short) return null
  return `s:${short}\0${(row.pdm_code ?? '').trim()}`
}

const codeOf = (row: DuplicateCandidate) => row.id_sistema ?? `#${row.id}`

/** Material id → códigos dos outros materiais do mesmo grupo de duplicidade. */
export function groupMaterialDuplicates(rows: DuplicateCandidate[]): Map<number, string[]> {
  const byKey = new Map<string, DuplicateCandidate[]>()
  for (const row of rows) {
    if (!countsForDuplicate(row)) continue
    const key = duplicateKey(row)
    if (!key) continue
    const group = byKey.get(key)
    if (group) group.push(row)
    else byKey.set(key, [row])
  }
  const map = new Map<number, string[]>()
  for (const group of byKey.values()) {
    if (group.length < 2) continue
    for (const row of group) map.set(row.id, group.filter((x) => x.id !== row.id).map(codeOf))
  }
  return map
}

/** Códigos dos candidatos que duplicam o alvo pela regra da base. */
export function duplicatesOf(target: DuplicateCandidate, candidates: DuplicateCandidate[]): string[] {
  const key = duplicateKey(target)
  if (!key || !countsForDuplicate(target)) return []
  return candidates
    .filter((row) => row.id !== target.id && countsForDuplicate(row) && duplicateKey(row) === key)
    .map(codeOf)
}

/** Atributo do PDM que entra na descrição. */
export function descriptionAttrKeys(attributes: unknown): string[] {
  if (!Array.isArray(attributes)) return []
  return attributes
    .filter((a): a is { id: string; includeInDescription?: boolean } =>
      a != null && typeof a === 'object' && typeof (a as { id?: unknown }).id === 'string')
    .filter((a) => a.includeInDescription === true)
    .map((a) => a.id)
}

/** Valores em texto minúsculo, sem vazios. { value, unit } vira valor+unidade. */
export function normalizeAttrs(data: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(data ?? {})) {
    if (v === null || v === undefined) continue
    let s: string
    if (typeof v === 'object' && !Array.isArray(v) && 'value' in v) {
      const o = v as { value?: unknown; unit?: unknown }
      s = `${o.value != null ? String(o.value) : ''}${o.unit != null ? String(o.unit) : ''}`
    } else {
      s = String(v)
    }
    s = s.trim().toLowerCase()
    if (s !== '') out[k] = s
  }
  return out
}

export function pickDescriptionAttrs(attrs: unknown, keys: string[]): Record<string, string> {
  const src = attrs && typeof attrs === 'object' && !Array.isArray(attrs) ? (attrs as Record<string, unknown>) : {}
  const picked: Record<string, unknown> = {}
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(src, k)) picked[k] = src[k]
  return normalizeAttrs(picked)
}

export function attrsMatch(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  if (keys.length === 0 || keys.length !== Object.keys(b).length) return false
  return keys.every((k) => a[k] === b[k])
}
