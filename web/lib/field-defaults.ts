/**
 * Valores padrão por condição (migration 052). Quando a solicitação entra numa etapa, cada campo que a etapa
 * cobra e que está vazio recebe o valor da regra cuja condição bate (PDM ou campo de lista).
 * Mesma regra de apply_field_defaults() no banco: uma regra por campo, a de menor prioridade (empate: menor id).
 */
import { ruleValue } from '@/lib/field-rules'

export const PDM_CONDITION = 'pdm'

export type FieldDefaultRule = {
  id: number
  name: string
  /** 'pdm' ou field_name de um campo de lista do dicionário. */
  condition_field: string
  condition_value: string
  target_field: string
  target_value: string
  is_fixed: boolean
  priority: number
  is_active: boolean
}

/** O que fica gravado em material_requests.default_fields para cada campo preenchido por regra. */
export type DefaultEntry = { value: string; rule_id: number; rule: string; fixed: boolean }

/** A regra bate com a solicitação: código do PDM ou valor do campo de condição, comparados como no ERP. */
export function defaultRuleMatches(rule: FieldDefaultRule, attributes: Record<string, unknown>, pdmCode: string | null): boolean {
  if (!rule.is_active) return false
  const expected = ruleValue(rule.condition_value)
  if (expected === null) return false
  const actual = rule.condition_field === PDM_CONDITION ? pdmCode : attributes[rule.condition_field]
  return expected === ruleValue(actual)
}

/** Uma regra por campo: a que bate com menor prioridade (empate: menor id). */
export function winningDefaults(
  rules: FieldDefaultRule[],
  attributes: Record<string, unknown>,
  pdmCode: string | null
): Map<string, FieldDefaultRule> {
  const matching = rules
    .filter((rule) => defaultRuleMatches(rule, attributes, pdmCode))
    .sort((a, b) => a.priority - b.priority || a.id - b.id)
  const winners = new Map<string, FieldDefaultRule>()
  for (const rule of matching) {
    if (!winners.has(rule.target_field)) winners.set(rule.target_field, rule)
  }
  return winners
}

/** Campos com mais de uma regra ativa: vale a de menor prioridade, e a tela avisa a sobreposição. */
export function overlappingTargets(rules: FieldDefaultRule[]): Array<{ target_field: string; rules: FieldDefaultRule[] }> {
  const groups = new Map<string, FieldDefaultRule[]>()
  for (const rule of rules.filter((r) => r.is_active)) {
    groups.set(rule.target_field, [...(groups.get(rule.target_field) ?? []), rule])
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([target_field, list]) => ({
      target_field,
      rules: [...list].sort((a, b) => a.priority - b.priority || a.id - b.id),
    }))
}

export type DefaultRuleInput = {
  name: string
  condition_field: string
  condition_value: string
  target_field: string
  target_value: string
  priority: number
}

/**
 * Checagens do formulário. O banco repete as que importam (campo existe, valor é opção, ordem das etapas);
 * aqui o usuário vê o erro antes de salvar. `targetOptions` e `conditionOptions` vazios = campo sem lista.
 */
export function validateDefaultRule(
  input: DefaultRuleInput,
  ctx: { targetOptions?: string[]; conditionOptions?: string[] } = {}
): string[] {
  const errors: string[] = []
  if (!input.name.trim()) errors.push('Dê um nome à regra.')
  if (!input.condition_field.trim()) errors.push('Escolha a condição.')
  if (!input.target_field.trim()) errors.push('Escolha o campo que recebe o valor.')
  if (input.condition_field && input.condition_field === input.target_field) {
    errors.push('A condição e o campo que recebe o valor não podem ser o mesmo.')
  }
  if (!input.condition_value.trim()) errors.push('Informe o valor da condição.')
  if (!input.target_value.trim()) errors.push('Informe o valor que será preenchido.')
  if (!Number.isInteger(input.priority) || input.priority < 0) errors.push('A prioridade deve ser um número inteiro, de 0 para cima.')

  if (input.condition_field && input.condition_field !== PDM_CONDITION && ctx.conditionOptions?.length) {
    if (!ctx.conditionOptions.includes(input.condition_value)) errors.push('O valor da condição precisa ser uma opção do campo.')
  }
  if (input.target_field && ctx.targetOptions?.length) {
    if (!ctx.targetOptions.includes(input.target_value)) errors.push('O valor preenchido precisa ser uma opção do campo.')
  }
  return errors
}
