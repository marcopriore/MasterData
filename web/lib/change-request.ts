/** Solicitação de Alteração (migration 043): campos que podem mudar, valores novos e validação. Sem banco. */
import { resolveField, type FieldRuleProfile } from '@/lib/field-rules'
import { GENERATED_FIELDS, materialAttributes, type RuleField } from '@/lib/material-rules'
import type { PdmDescAttribute } from '@/lib/pdm-description'

/** Não muda numa Alteração: o ERP não deixa trocar o tipo de material existente (migration 041). */
export const LOCKED_CHANGE_FIELDS = ['tipo_material']

export type ChangeOption = { value: string; label: string }

export type ChangeRow = {
  key: string
  label: string
  /** pdm = atributo do PDM (muda a descrição); field = campo do Dicionário de Campos. */
  kind: 'pdm' | 'field'
  group: string
  type: 'select' | 'number' | 'text'
  options: ChangeOption[]
  current: unknown
  required: boolean
}

export type ChangeDictField = RuleField & { field_type: string; options: unknown; erp_view: string }

export function valueText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object' && 'value' in (value as object)) {
    const v = value as { value?: unknown; unit?: unknown }
    return `${v.value ?? ''}${v.unit ?? ''}`.trim()
  }
  return String(value).trim()
}

function optionList(raw: unknown): ChangeOption[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { values?: unknown }).values) ? (raw as { values: unknown[] }).values : []
  return list
    .map((o) => (o && typeof o === 'object' && 'value' in o
      ? { value: String((o as { value: unknown }).value ?? ''), label: String((o as { label?: unknown; value: unknown }).label ?? (o as { value: unknown }).value ?? '') }
      : { value: String(o ?? ''), label: String(o ?? '') }))
    .filter((o) => o.value.trim() !== '')
}

/** Linhas que o solicitante pode escolher: atributos do PDM e campos do dicionário que aparecem para o material. */
export function changeRows(params: {
  material: Record<string, unknown>
  pdmAttributes: Array<PdmDescAttribute & { isRequired?: boolean }>
  fields: ChangeDictField[]
  profiles: FieldRuleProfile[]
  viewLabel: (erpView: string) => string
}): ChangeRow[] {
  const attrs = materialAttributes(params.material)
  const pdmRows: ChangeRow[] = [...params.pdmAttributes]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((a) => ({
      key: a.id,
      label: a.name ?? a.id,
      kind: 'pdm' as const,
      group: 'Atributos técnicos (PDM)',
      type: a.dataType === 'lov' ? 'select' as const : a.dataType === 'numeric' || a.dataType === 'number' ? 'number' as const : 'text' as const,
      options: optionList(a.allowedValues),
      current: attrs[a.id],
      required: a.isRequired === true,
    }))
  const fieldRows: ChangeRow[] = params.fields
    .filter((f) => !GENERATED_FIELDS.includes(f.field_name) && !LOCKED_CHANGE_FIELDS.includes(f.field_name))
    .map((f) => ({ f, effective: resolveField(f, attrs, params.profiles) }))
    .filter(({ effective }) => effective.requirement !== 'hidden')
    .map(({ f, effective }) => ({
      key: f.field_name,
      label: f.field_label,
      kind: 'field' as const,
      group: params.viewLabel(f.erp_view),
      type: f.field_type === 'select' ? 'select' as const : f.field_type === 'number' || f.field_type === 'currency' ? 'number' as const : 'text' as const,
      options: optionList(f.options),
      current: attrs[f.field_name],
      required: effective.requirement === 'required',
    }))
  return [...pdmRows, ...fieldRows]
}

export type ChangeDraft = Record<string, string>

/** Erros da Alteração: nada escolhido, obrigatório apagado, valor igual ao atual. */
export function validateChanges(rows: ChangeRow[], draft: ChangeDraft): string[] {
  const keys = Object.keys(draft)
  if (keys.length === 0) return ['Escolha ao menos um campo para alterar.']
  const errors: string[] = []
  for (const key of keys) {
    const row = rows.find((r) => r.key === key)
    if (!row) continue
    const next = draft[key].trim()
    if (!next && row.required) errors.push(`${row.label}: é obrigatório, não pode ficar vazio.`)
    else if (next === valueText(row.current)) errors.push(`${row.label}: o valor novo é igual ao atual.`)
  }
  return errors
}

/** technical_attributes da solicitação: valores atuais do material com os novos por cima. */
export function changedAttributes(material: Record<string, unknown>, draft: ChangeDraft): Record<string, unknown> {
  return { ...materialAttributes(material), ...Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim()])) }
}

export function touchesPdm(rows: ChangeRow[], draft: ChangeDraft): boolean {
  return Object.keys(draft).some((k) => rows.find((r) => r.key === k)?.kind === 'pdm')
}
