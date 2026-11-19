import { describe, expect, it } from 'vitest'
import {
  defaultRuleMatches,
  overlappingTargets,
  validateDefaultRule,
  winningDefaults,
  type FieldDefaultRule,
} from './field-defaults'

const rule = (id: number, over: Partial<FieldDefaultRule> = {}): FieldDefaultRule => ({
  id,
  name: `R${id}`,
  condition_field: 'pdm',
  condition_value: 'PARA001',
  target_field: 'grupo_mercadorias',
  target_value: '001',
  is_fixed: false,
  priority: 100,
  is_active: true,
  ...over,
})

describe('casamento da condição', () => {
  it('casa pelo código do PDM, sem diferença de maiúscula e acento', () => {
    expect(defaultRuleMatches(rule(1, { condition_value: 'Pára001' }), {}, 'PARA001')).toBe(true)
    expect(defaultRuleMatches(rule(1), {}, 'OUTRO001')).toBe(false)
    expect(defaultRuleMatches(rule(1), {}, null)).toBe(false)
  })

  it('casa por campo de lista do material', () => {
    const r = rule(2, { condition_field: 'tipo_material', condition_value: 'FERT' })
    expect(defaultRuleMatches(r, { tipo_material: 'fert' }, 'X')).toBe(true)
    expect(defaultRuleMatches(r, { tipo_material: 'ROH' }, 'X')).toBe(false)
    expect(defaultRuleMatches(r, {}, 'X')).toBe(false)
  })

  it('regra inativa não casa', () => {
    expect(defaultRuleMatches(rule(3, { is_active: false }), {}, 'PARA001')).toBe(false)
  })

  it('valor de condição vazio não casa com campo vazio', () => {
    const r = rule(4, { condition_field: 'tipo_material', condition_value: '   ' })
    expect(defaultRuleMatches(r, {}, 'X')).toBe(false)
  })
})

describe('regra vencedora por campo', () => {
  it('uma regra por campo: a de menor prioridade', () => {
    const rules = [rule(1, { priority: 200, target_value: '002' }), rule(2, { priority: 10, target_value: '001' })]
    const winners = winningDefaults(rules, {}, 'PARA001')
    expect(winners.get('grupo_mercadorias')?.id).toBe(2)
  })

  it('empate de prioridade: menor id', () => {
    const rules = [rule(5, { priority: 50 }), rule(3, { priority: 50 })]
    expect(winningDefaults(rules, {}, 'PARA001').get('grupo_mercadorias')?.id).toBe(3)
  })

  it('campos diferentes saem todos', () => {
    const rules = [rule(1), rule(2, { target_field: 'classe_avaliacao', target_value: 'Z1' })]
    const winners = winningDefaults(rules, {}, 'PARA001')
    expect([...winners.keys()].sort()).toEqual(['classe_avaliacao', 'grupo_mercadorias'])
  })

  it('regra que não bate não entra', () => {
    expect(winningDefaults([rule(1, { condition_value: 'OUTRO' })], {}, 'PARA001').size).toBe(0)
  })
})

describe('sobreposição', () => {
  it('aponta campos com mais de uma regra ativa, em ordem de prioridade', () => {
    const rules = [
      rule(1, { priority: 90 }),
      rule(2, { priority: 20 }),
      rule(3, { target_field: 'classe_avaliacao' }),
      rule(4, { priority: 5, is_active: false }),
    ]
    const overlaps = overlappingTargets(rules)
    expect(overlaps).toHaveLength(1)
    expect(overlaps[0].target_field).toBe('grupo_mercadorias')
    expect(overlaps[0].rules.map((r) => r.id)).toEqual([2, 1])
  })

  it('sem sobreposição, lista vazia', () => {
    expect(overlappingTargets([rule(1), rule(2, { target_field: 'x' })])).toEqual([])
  })
})

describe('validação do formulário', () => {
  const base = {
    name: 'Grupo por PDM',
    condition_field: 'pdm',
    condition_value: 'PARA001',
    target_field: 'grupo_mercadorias',
    target_value: '001',
    priority: 100,
  }

  it('regra completa passa', () => {
    expect(validateDefaultRule(base)).toEqual([])
  })

  it('pede nome, valores e prioridade válida', () => {
    const errors = validateDefaultRule({ ...base, name: ' ', condition_value: '', target_value: '', priority: -1 })
    expect(errors).toHaveLength(4)
  })

  it('condição e alvo não podem ser o mesmo campo', () => {
    const errors = validateDefaultRule({ ...base, condition_field: 'tipo_material', target_field: 'tipo_material' })
    expect(errors.some((e) => e.includes('não podem ser o mesmo'))).toBe(true)
  })

  it('valor precisa ser opção quando o campo é lista', () => {
    expect(validateDefaultRule(base, { targetOptions: ['001', '002'] })).toEqual([])
    expect(validateDefaultRule(base, { targetOptions: ['002'] })).toEqual(['O valor preenchido precisa ser uma opção do campo.'])
  })

  it('condição de campo de lista também confere as opções; PDM não', () => {
    const cond = { ...base, condition_field: 'tipo_material', condition_value: 'XYZ' }
    expect(validateDefaultRule(cond, { conditionOptions: ['FERT'] })).toEqual([
      'O valor da condição precisa ser uma opção do campo.',
    ])
    expect(validateDefaultRule(base, { conditionOptions: ['FERT'] })).toEqual([])
  })
})
