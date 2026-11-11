/** Solicitação de Ampliação (migration 045): centro novo e campos por centro. Sem banco. */
import { changeRows, type ChangeDictField, type ChangeRow } from '@/lib/change-request'
import type { FieldRuleProfile } from '@/lib/field-rules'
import { materialAttributes } from '@/lib/material-rules'

export type CenterLite = { id: number; code: string; name: string; is_active: boolean }

export type ExpansionDictField = ChangeDictField & { per_center?: boolean | null }

export function centerLabel(center: { code: string; name: string }): string {
  return center.name ? `${center.code} · ${center.name}` : center.code
}

/** Centros que a Ampliação pode pedir: ativos e que o material ainda não tem. */
export function availableCenters(centers: CenterLite[], materialCenterIds: number[]): CenterLite[] {
  const taken = new Set(materialCenterIds)
  return centers.filter((c) => c.is_active && !taken.has(c.id))
}

/** Campos por centro que aparecem para o material, com o valor de partida (o do material). */
export function expansionRows(params: {
  material: Record<string, unknown>
  fields: ExpansionDictField[]
  profiles: FieldRuleProfile[]
  viewLabel: (erpView: string) => string
}): ChangeRow[] {
  return changeRows({
    material: params.material,
    pdmAttributes: [],
    fields: params.fields.filter((f) => f.per_center === true),
    profiles: params.profiles,
    viewLabel: params.viewLabel,
  })
}

export type ExpansionDraft = Record<string, string>

/** Valores de partida do centro novo: os do material. */
export function initialExpansionDraft(rows: ChangeRow[]): ExpansionDraft {
  return Object.fromEntries(rows.map((r) => [r.key, valueOf(r.current)]))
}

function valueOf(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object' && 'value' in (value as object)) return String((value as { value?: unknown }).value ?? '').trim()
  return String(value).trim()
}

/** technical_attributes da Ampliação: o material com os valores do centro novo por cima. */
export function expansionAttributes(material: Record<string, unknown>, draft: ExpansionDraft): Record<string, unknown> {
  const base = materialAttributes(material)
  for (const [key, value] of Object.entries(draft)) {
    const v = value.trim()
    if (v) base[key] = v
    else delete base[key]
  }
  return base
}

export function validateExpansion(centerId: number | null, available: CenterLite[], justification: string): string[] {
  const errors: string[] = []
  if (centerId == null) errors.push('Escolha o centro da ampliação.')
  else if (!available.some((c) => c.id === centerId)) errors.push('O material já está neste centro ou o centro está inativo.')
  if (!justification.trim()) errors.push('Informe o motivo da ampliação.')
  return errors
}
