import { describe, expect, it } from 'vitest'
import {
  conditionFieldsOf,
  fieldOptionValues,
  fieldsForStage,
  resolveField,
  ruleEntryFor,
  ruleValue,
  sameConditions,
  toProfile,
  type FieldRuleProfile,
} from './field-rules'

const profile = (id: number, conditions: Record<string, string>, rules: FieldRuleProfile['rules'], is_active = true): FieldRuleProfile => ({
  id,
  name: `R${id}`,
  conditions,
  rules,
  is_active,
})

const tipo = { field_name: 'tipo_material', responsible_role: 'CADASTRO', is_required: true }
const grupoCompras = { field_name: 'grupo_compras', responsible_role: 'COMPRAS', is_required: false }
const tipoMrp = { field_name: 'tipo_mrp', responsible_role: 'MRP', is_required: true }

describe('regras por material', () => {
  const profiles = [
    profile(1, { tipo_material: 'FERT' }, { grupo_compras: { requirement: 'required' }, tipo_mrp: { role: 'CADASTRO', requirement: 'optional' } }),
    profile(2, { tipo_material: 'NLAG' }, { tipo_mrp: { requirement: 'hidden' } }),
    profile(3, { tipo_material: 'FERT', grupo: '001' }, { grupo_compras: { requirement: 'optional' } }),
  ]

  it('sem regra para o material, vale o padrão do dicionário', () => {
    expect(resolveField(grupoCompras, { tipo_material: 'ROH' }, profiles)).toEqual({ role: 'COMPRAS', requirement: 'optional' })
  })

  it('a regra muda a exigência e a etapa', () => {
    expect(resolveField(grupoCompras, { tipo_material: 'FERT' }, profiles)).toEqual({ role: 'COMPRAS', requirement: 'required' })
    expect(resolveField(tipoMrp, { tipo_material: 'FERT' }, profiles)).toEqual({ role: 'CADASTRO', requirement: 'optional' })
    expect(resolveField(tipoMrp, { tipo_material: 'nlag' }, profiles).requirement).toBe('hidden')
  })

  it('a mais específica vence; empate, a mais exigente', () => {
    expect(resolveField(grupoCompras, { tipo_material: 'FERT', grupo: '001' }, profiles).requirement).toBe('optional')
    const tie = [
      profile(1, { tipo_material: 'FERT' }, { grupo_compras: { requirement: 'hidden' } }),
      profile(2, { grupo: '001' }, { grupo_compras: { requirement: 'required' } }),
    ]
    expect(resolveField(grupoCompras, { tipo_material: 'FERT', grupo: '001' }, tie).requirement).toBe('required')
  })

  it('campo de condição não muda por regra; regra inativa não conta', () => {
    const withTipo = [...profiles, profile(4, { tipo_material: 'FERT' }, { tipo_material: { requirement: 'hidden' } })]
    expect(conditionFieldsOf(withTipo)).toEqual(['tipo_material', 'grupo'])
    expect(resolveField(tipo, { tipo_material: 'FERT' }, withTipo)).toEqual({ role: 'CADASTRO', requirement: 'required' })
    expect(resolveField(grupoCompras, { tipo_material: 'FERT' }, [profile(9, { tipo_material: 'FERT' }, { grupo_compras: { requirement: 'required' } }, false)]).requirement).toBe('optional')
  })

  it('campos da etapa: o que mudou de etapa entra, o que não aparece sai', () => {
    const fields = [tipo, grupoCompras, tipoMrp]
    expect(fieldsForStage(fields, { tipo_material: 'FERT' }, profiles, 'cadastro').map((f) => [f.field_name, f.requirement])).toEqual([
      ['tipo_material', 'required'],
      ['tipo_mrp', 'optional'],
    ])
    expect(fieldsForStage(fields, { tipo_material: 'NLAG' }, profiles, 'MRP')).toEqual([])
    expect(fieldsForStage(fields, {}, profiles, null)).toEqual([])
  })

  it('a regra grava só o que difere do padrão', () => {
    expect(ruleEntryFor(grupoCompras, 'COMPRAS', 'optional')).toBeNull()
    expect(ruleEntryFor(grupoCompras, 'compras', 'required')).toEqual({ requirement: 'required' })
    expect(ruleEntryFor(grupoCompras, 'mrp', 'optional')).toEqual({ role: 'MRP', requirement: 'optional' })
    expect(ruleEntryFor(grupoCompras, 'MRP', 'hidden')).toEqual({ requirement: 'hidden' })
  })

  it('compara sem acento e sem maiúscula', () => {
    expect(ruleValue(' fért ')).toBe('FERT')
    expect(sameConditions({ tipo_material: 'fert' }, { tipo_material: 'FERT' })).toBe(true)
    expect(sameConditions({ tipo_material: 'FERT' }, { tipo_material: 'FERT', grupo: '1' })).toBe(false)
  })

  it('lê a linha do banco, inclusive no formato antigo', () => {
    const p = toProfile({ id: '5', name: 'X', conditions: { tipo_material: 'FERT' }, rules: { a: 'required', b: { role: 'MRP', requirement: 'hidden' }, c: 'x' } })
    expect(p.rules).toEqual({ a: { requirement: 'required' }, b: { role: 'MRP', requirement: 'hidden' } })
    expect(fieldOptionValues({ values: [{ value: 'NLAG', label: 'NLAG - Não estocável' }] })).toEqual([{ value: 'NLAG', label: 'NLAG - Não estocável' }])
  })
})
