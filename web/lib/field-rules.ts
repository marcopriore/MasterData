/**
 * Regras por material (migrations 038 e 039). Cada regra tem condições (ex.: Tipo de Material = FERT) e,
 * para os campos que mudam, a etapa onde aparecem e se são obrigatórios, opcionais ou não aparecem.
 * Campo sem regra segue o padrão do dicionário (responsible_role e is_required).
 * Mesma regra de field_effective() no banco: vence a regra mais específica (mais condições);
 * empate, a mais exigente (obrigatório > opcional > oculto).
 */
import { toErpText } from '@/lib/erp-text'

export type FieldRequirement = 'required' | 'optional' | 'hidden'

export const REQUIREMENT_LABEL: Record<FieldRequirement, string> = {
  required: 'Obrigatório',
  optional: 'Opcional',
  hidden: 'Não aparece',
}

/** O que a regra muda num campo. Sem role, o campo fica na etapa padrão. */
export type FieldRuleEntry = { role?: string | null; requirement: FieldRequirement }

export type FieldRuleProfile = {
  id: number
  name: string
  /** field_name → valor exigido. */
  conditions: Record<string, string>
  rules: Record<string, FieldRuleEntry>
  is_active: boolean
}

export type RuleBaseField = { field_name: string; responsible_role: string; is_required: boolean }

export type EffectiveField = { role: string; requirement: FieldRequirement }

const STRICTNESS: Record<FieldRequirement, number> = { required: 0, optional: 1, hidden: 2 }

/** Valor comparado como no ERP: sem acento e sem diferença de maiúscula; vazio vira null. */
export function ruleValue(value: unknown): string | null {
  const raw = value && typeof value === 'object' && 'value' in value ? (value as { value?: unknown }).value : value
  if (raw == null) return null
  const text = toErpText(String(raw)).trim().toUpperCase()
  return text || null
}

export const sameRole = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toUpperCase() === (b ?? '').trim().toUpperCase()

/** Campos usados como condição pelas regras ativas: não mudam por regra e só se alteram na etapa padrão. */
export function conditionFieldsOf(profiles: FieldRuleProfile[]): string[] {
  return [...new Set(profiles.filter((p) => p.is_active).flatMap((p) => Object.keys(p.conditions)))]
}

export function profileMatches(profile: FieldRuleProfile, attributes: Record<string, unknown>): boolean {
  if (!profile.is_active) return false
  return Object.entries(profile.conditions).every(([key, wanted]) => ruleValue(wanted) === ruleValue(attributes[key]))
}

export function baseOf(field: RuleBaseField): EffectiveField {
  return { role: field.responsible_role, requirement: field.is_required ? 'required' : 'optional' }
}

/** Etapa e exigência do campo para o material com esses valores. */
export function resolveField(field: RuleBaseField, attributes: Record<string, unknown>, profiles: FieldRuleProfile[]): EffectiveField {
  if (conditionFieldsOf(profiles).includes(field.field_name)) return baseOf(field)
  let best: { specificity: number; entry: FieldRuleEntry } | null = null
  for (const profile of profiles) {
    const entry = profile.rules[field.field_name]
    if (!entry || !profileMatches(profile, attributes)) continue
    const specificity = Object.keys(profile.conditions).length
    if (
      !best ||
      specificity > best.specificity ||
      (specificity === best.specificity && STRICTNESS[entry.requirement] < STRICTNESS[best.entry.requirement])
    ) {
      best = { specificity, entry }
    }
  }
  if (!best) return baseOf(field)
  return { role: best.entry.role?.trim() || field.responsible_role, requirement: best.entry.requirement }
}

/** Campos que aparecem na etapa para esse material, com a exigência resolvida. */
export function fieldsForStage<F extends RuleBaseField>(
  fields: F[],
  attributes: Record<string, unknown>,
  profiles: FieldRuleProfile[],
  stageRole: string | null
): Array<F & { requirement: FieldRequirement }> {
  if (!stageRole) return []
  const out: Array<F & { requirement: FieldRequirement }> = []
  for (const field of fields) {
    const effective = resolveField(field, attributes, profiles)
    if (effective.requirement === 'hidden' || !sameRole(effective.role, stageRole)) continue
    out.push({ ...field, requirement: effective.requirement })
  }
  return out
}

/** Entrada da regra só quando difere do padrão; null = segue o padrão (não grava). */
export function ruleEntryFor(field: RuleBaseField, role: string, requirement: FieldRequirement): FieldRuleEntry | null {
  const base = baseOf(field)
  if (requirement === 'hidden') return { requirement }
  if (sameRole(role, base.role) && requirement === base.requirement) return null
  return sameRole(role, base.role) ? { requirement } : { role: role.trim().toUpperCase(), requirement }
}

/** Valores de um campo de lista, no formato que o dicionário guarda (lista, {values} ou {value,label}). */
export function fieldOptionValues(options: unknown): Array<{ value: string; label: string }> {
  const list = Array.isArray(options)
    ? options
    : options && typeof options === 'object' && Array.isArray((options as { values?: unknown }).values)
      ? (options as { values: unknown[] }).values
      : []
  return list
    .map((opt) => {
      if (opt && typeof opt === 'object' && 'value' in opt) {
        const o = opt as { value?: unknown; label?: unknown }
        return { value: String(o.value ?? o.label ?? ''), label: String(o.label ?? o.value ?? '') }
      }
      return { value: String(opt ?? ''), label: String(opt ?? '') }
    })
    .filter((opt) => opt.value.trim() !== '')
}

/** "Tipo de Material = FERT e Grupo de Mercadorias = 001". */
export function describeConditions(conditions: Record<string, string>, labelOf: (fieldName: string) => string): string {
  const parts = Object.entries(conditions).map(([name, value]) => `${labelOf(name)} = ${value}`)
  return parts.length ? parts.join(' e ') : 'Sem condição'
}

const REQUIREMENTS = new Set<string>(['required', 'optional', 'hidden'])

/** Normaliza o que vem do banco (jsonb). Aceita o formato antigo da 038 (texto). */
export function toProfile(row: Record<string, unknown>): FieldRuleProfile {
  const obj = (value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const rules: Record<string, FieldRuleEntry> = {}
  for (const [key, value] of Object.entries(obj(row.rules))) {
    const entry = typeof value === 'string' ? { requirement: value } : (obj(value) as { role?: unknown; requirement?: unknown })
    if (!REQUIREMENTS.has(String(entry.requirement))) continue
    const role = typeof (entry as { role?: unknown }).role === 'string' ? String((entry as { role: string }).role).trim() : ''
    rules[key] = role ? { role, requirement: entry.requirement as FieldRequirement } : { requirement: entry.requirement as FieldRequirement }
  }
  return {
    id: Number(row.id),
    name: String(row.name ?? ''),
    conditions: Object.fromEntries(Object.entries(obj(row.conditions)).map(([k, v]) => [k, String(v ?? '')])),
    rules,
    is_active: row.is_active !== false,
  }
}

/** Mesmo conjunto de condições (para não cadastrar duas regras iguais). */
export function sameConditions(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((k) => ruleValue(a[k]) === ruleValue(b[k]))
}
