import { describe, expect, it } from 'vitest'
import { availableCenters, centerLabel, expansionAttributes, expansionRows, initialExpansionDraft, validateExpansion } from './expansion-request'

const centers = [
  { id: 1, code: '1001', name: 'SAO PAULO', is_active: true },
  { id: 2, code: '1002', name: 'MANAUS', is_active: true },
  { id: 3, code: '1003', name: 'RECIFE', is_active: false },
]

const field = (name: string, role: string, perCenter: boolean, extra: Record<string, unknown> = {}) => ({
  field_name: name,
  field_label: name.toUpperCase(),
  responsible_role: role,
  is_required: false,
  field_type: 'text',
  options: null,
  erp_view: role,
  per_center: perCenter,
  ...extra,
})

const material = { id: 10, technical_attributes: { tipo_mrp: 'PD', grupo_compras: 'G01', ncm: '1234.56.78' } }

describe('Ampliação', () => {
  it('só oferece centro ativo que o material ainda não tem', () => {
    expect(availableCenters(centers, [1]).map((c) => c.code)).toEqual(['1002'])
    expect(availableCenters(centers, []).map((c) => c.code)).toEqual(['1001', '1002'])
  })

  it('pede só os campos por centro, partindo do valor do material', () => {
    const rows = expansionRows({
      material,
      fields: [field('tipo_mrp', 'MRP', true), field('grupo_compras', 'COMPRAS', true), field('ncm', 'FISCAL', false)],
      profiles: [],
      viewLabel: (v) => v,
    })
    expect(rows.map((r) => r.key)).toEqual(['tipo_mrp', 'grupo_compras'])
    expect(initialExpansionDraft(rows)).toEqual({ tipo_mrp: 'PD', grupo_compras: 'G01' })
  })

  it('os valores do centro novo vão por cima dos do material; vazio sai', () => {
    const attrs = expansionAttributes(material, { tipo_mrp: 'VB', grupo_compras: '' })
    expect(attrs).toEqual({ tipo_mrp: 'VB', ncm: '1234.56.78' })
    expect(material.technical_attributes.grupo_compras).toBe('G01')
  })

  it('exige centro disponível e motivo', () => {
    const available = availableCenters(centers, [1])
    expect(validateExpansion(null, available, 'X')).toEqual(['Escolha o centro da ampliação.'])
    expect(validateExpansion(1, available, 'X')[0]).toContain('já está neste centro')
    expect(validateExpansion(2, available, ' ')).toEqual(['Informe o motivo da ampliação.'])
    expect(validateExpansion(2, available, 'NOVA FABRICA')).toEqual([])
  })

  it('mostra o centro com código e nome', () => {
    expect(centerLabel({ code: '1001', name: 'SAO PAULO' })).toBe('1001 · SAO PAULO')
    expect(centerLabel({ code: '1001', name: '' })).toBe('1001')
  })
})
