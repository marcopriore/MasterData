/**
 * Regras por material aplicadas a um material da base (edição, importação, API e ERP). Mesma leitura
 * de material_rule_attributes() no banco: o valor do campo do dicionário fica em technical_attributes;
 * alguns campos também têm coluna própria, que vale quando o atributo está vazio.
 * Na base, obrigatório é todo campo que a regra exige em qualquer etapa; a etapa não importa.
 */
import { resolveField, ruleValue, type FieldRuleProfile, type RuleBaseField } from '@/lib/field-rules'

/** Campo do dicionário → coluna do material com o mesmo dado. */
export const MATERIAL_COLUMN_OF: Record<string, string> = {
  tipo_material: 'material_type',
  unidade_medida_base: 'unit_of_measure',
  grupo_mercadorias: 'material_group',
  ncm: 'ncm',
}

/** Gerado a partir do PDM: não se cobra nem se importa como campo. */
export const GENERATED_FIELDS = ['descricao_basica']

export type RuleField = RuleBaseField & { field_label: string }

const isEmpty = (value: unknown): boolean => {
  if (value == null) return true
  if (typeof value === 'object' && 'value' in (value as object)) return isEmpty((value as { value?: unknown }).value)
  return String(value).trim() === ''
}

/** field_name → valor, para aplicar a regra. */
export function materialAttributes(row: Record<string, unknown>): Record<string, unknown> {
  const attrs = row.technical_attributes && typeof row.technical_attributes === 'object' && !Array.isArray(row.technical_attributes)
    ? { ...(row.technical_attributes as Record<string, unknown>) }
    : {}
  for (const [field, column] of Object.entries(MATERIAL_COLUMN_OF)) {
    if (isEmpty(attrs[field]) && !isEmpty(row[column])) attrs[field] = row[column]
  }
  return attrs
}

/** Obrigatórios (em qualquer etapa) sem valor no material. */
export function missingMaterialFields(fields: RuleField[], attributes: Record<string, unknown>, profiles: FieldRuleProfile[]): RuleField[] {
  return fields.filter((field) =>
    !GENERATED_FIELDS.includes(field.field_name) &&
    resolveField(field, attributes, profiles).requirement === 'required' &&
    isEmpty(attributes[field.field_name])
  )
}

/** Campos que não aparecem para esse material (não são gravados nem vão para o ERP). */
export function hiddenMaterialFields(fields: RuleField[], attributes: Record<string, unknown>, profiles: FieldRuleProfile[]): Set<string> {
  return new Set(fields.filter((f) => resolveField(f, attributes, profiles).requirement === 'hidden').map((f) => f.field_name))
}

/** Tira do conjunto enviado os campos ocultos para o material; devolve o que sobrou e o que saiu. */
export function dropHiddenFields(
  sent: Record<string, unknown>,
  fields: RuleField[],
  attributes: Record<string, unknown>,
  profiles: FieldRuleProfile[]
): { kept: Record<string, unknown>; dropped: RuleField[] } {
  const hidden = hiddenMaterialFields(fields, attributes, profiles)
  const kept: Record<string, unknown> = {}
  const dropped: RuleField[] = []
  for (const [key, value] of Object.entries(sent)) {
    if (hidden.has(key) && !isEmpty(value)) {
      const field = fields.find((f) => f.field_name === key)
      if (field) dropped.push(field)
      continue
    }
    kept[key] = value
  }
  return { kept, dropped }
}

export const MATERIAL_TYPE_LOCKED = 'O Tipo de Material de um material já cadastrado não pode ser alterado (o ERP não permite)'

/** Troca de tipo em material da base (migration 041). Preencher o primeiro tipo de um material sem tipo pode. */
export function materialTypeChanged(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  const old = ruleValue(materialAttributes(before).tipo_material)
  return old !== null && ruleValue(materialAttributes(after).tipo_material) !== old
}

export function missingMessage(missing: RuleField[]): string {
  return `Campos obrigatórios para este material: ${missing.map((f) => f.field_label).join(', ')}`
}
