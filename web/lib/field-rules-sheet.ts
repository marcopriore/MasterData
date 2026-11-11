/**
 * Planilha das regras por material: aba "Condições" (uma linha por regra, uma coluna por campo de condição)
 * e aba "Campos" (uma linha por campo, uma coluna por regra). Célula de regra: vazia = padrão do dicionário;
 * "Não aparece"; ou "ETAPA · Obrigatório" / "ETAPA · Opcional". Sem banco.
 */
import {
  baseOf,
  conditionFieldsOf,
  REQUIREMENT_LABEL,
  ruleEntryFor,
  ruleValue,
  type FieldRequirement,
  type FieldRuleProfile,
  type RuleBaseField,
} from '@/lib/field-rules'

export const SHEET_CONDITIONS = 'Condições'
export const SHEET_FIELDS = 'Campos'
const COL_RULE = 'Regra'
const COL_ACTIVE = 'Ativa'
const COL_FIELD = 'Campo'
const COL_CODE = 'Código'
const COL_DEFAULT = 'Padrão'

export type SheetField = RuleBaseField & { field_label: string }

export const formatEntry = (role: string, requirement: FieldRequirement) =>
  requirement === 'hidden' ? REQUIREMENT_LABEL.hidden : `${role} · ${REQUIREMENT_LABEL[requirement]}`

export function buildRuleSheets(fields: SheetField[], profiles: FieldRuleProfile[]): { name: string; rows: Record<string, unknown>[] }[] {
  const labelOf = (name: string) => fields.find((f) => f.field_name === name)?.field_label ?? name
  const conditionFields = conditionFieldsOf(profiles)
  const conditions = profiles.map((p) => ({
    [COL_RULE]: p.name,
    [COL_ACTIVE]: p.is_active ? 'Sim' : 'Não',
    ...Object.fromEntries(conditionFields.map((c) => [labelOf(c), p.conditions[c] ?? ''])),
  }))
  const rows = fields
    .filter((f) => !conditionFields.includes(f.field_name))
    .map((f) => {
      const base = baseOf(f)
      return {
        [COL_FIELD]: f.field_label,
        [COL_CODE]: f.field_name,
        [COL_DEFAULT]: formatEntry(base.role, base.requirement),
        ...Object.fromEntries(
          profiles.map((p) => {
            const entry = p.rules[f.field_name]
            return [p.name, entry ? formatEntry(entry.role || base.role, entry.requirement) : '']
          })
        ),
      }
    })
  return [
    { name: SHEET_CONDITIONS, rows: conditions },
    { name: SHEET_FIELDS, rows },
  ]
}

const cell = (value: unknown) => String(value ?? '').trim()

/** "MRP · Obrigatório" → { role, requirement }; null se não der para ler. */
export function parseEntry(text: string): { role: string | null; requirement: FieldRequirement } | null {
  const norm = ruleValue(text)
  if (!norm) return null
  if (norm.includes('NAO APARECE') || norm === 'OCULTO') return { role: null, requirement: 'hidden' }
  const match = norm.match(/^(.*?)[\s\-:/]*(OBRIGATORIO|OPCIONAL)$/)
  if (!match || !match[1].trim()) return null
  return { role: match[1].trim(), requirement: match[2] === 'OBRIGATORIO' ? 'required' : 'optional' }
}

export type ParsedProfile = Omit<FieldRuleProfile, 'id'>

/**
 * Regras lidas da planilha, prontas para gravar (cria ou atualiza pelo nome).
 * Qualquer erro impede a importação inteira: a tela mostra a lista.
 */
export function parseRuleSheets(
  sheets: Record<string, Record<string, unknown>[]>,
  fields: SheetField[],
  roles: string[]
): { profiles: ParsedProfile[]; errors: string[] } {
  const errors: string[] = []
  const condRows = sheets[SHEET_CONDITIONS]
  const fieldRows = sheets[SHEET_FIELDS]
  if (!condRows) errors.push(`Falta a aba "${SHEET_CONDITIONS}".`)
  if (!fieldRows) errors.push(`Falta a aba "${SHEET_FIELDS}".`)
  if (!condRows || !fieldRows) return { profiles: [], errors }

  const byHeader = new Map<string, SheetField>()
  for (const f of fields) {
    byHeader.set(ruleValue(f.field_label) ?? f.field_name, f)
    byHeader.set(ruleValue(f.field_name) ?? f.field_name, f)
  }
  const knownRoles = new Set(roles.map((r) => r.trim().toUpperCase()))
  const profiles: ParsedProfile[] = []
  const seen = new Set<string>()

  condRows.forEach((row, i) => {
    const line = i + 2
    const name = ruleValue(row[COL_RULE])
    if (!name) return
    if (seen.has(name)) errors.push(`${SHEET_CONDITIONS}, linha ${line}: a regra "${name}" aparece duas vezes.`)
    seen.add(name)
    const conditions: Record<string, string> = {}
    for (const [header, value] of Object.entries(row)) {
      if (header === COL_RULE || header === COL_ACTIVE || !cell(value)) continue
      const field = byHeader.get(ruleValue(header) ?? '')
      if (!field) errors.push(`${SHEET_CONDITIONS}, linha ${line}: coluna "${header}" não é um campo do dicionário.`)
      else conditions[field.field_name] = cell(value)
    }
    if (Object.keys(conditions).length === 0) errors.push(`${SHEET_CONDITIONS}, linha ${line}: "${name}" precisa de ao menos uma condição.`)
    profiles.push({ name, conditions, rules: {}, is_active: ruleValue(row[COL_ACTIVE]) !== 'NAO' })
  })

  const conditionFields = new Set(profiles.flatMap((p) => Object.keys(p.conditions)))
  fieldRows.forEach((row, i) => {
    const line = i + 2
    const code = cell(row[COL_CODE])
    if (!code) return
    const field = fields.find((f) => f.field_name === code)
    if (!field) {
      errors.push(`${SHEET_FIELDS}, linha ${line}: campo "${code}" não existe no dicionário.`)
      return
    }
    if (conditionFields.has(code)) return
    for (const profile of profiles) {
      const header = Object.keys(row).find((k) => ruleValue(k) === profile.name)
      const raw = header ? cell(row[header]) : ''
      if (!raw) continue
      const parsed = parseEntry(raw)
      if (!parsed) {
        errors.push(`${SHEET_FIELDS}, linha ${line}: "${raw}" na regra ${profile.name}; use "ETAPA · Obrigatório", "ETAPA · Opcional", "Não aparece" ou deixe vazio.`)
        continue
      }
      if (parsed.role && !knownRoles.has(parsed.role)) {
        errors.push(`${SHEET_FIELDS}, linha ${line}: etapa "${parsed.role}" não existe.`)
        continue
      }
      const entry = ruleEntryFor(field, parsed.role ?? field.responsible_role, parsed.requirement)
      if (entry) profile.rules[code] = entry
    }
  })

  return { profiles, errors }
}
