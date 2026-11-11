import { describe, expect, it } from 'vitest'
import { dropHiddenFields, materialAttributes, materialTypeChanged, missingMaterialFields, missingMessage } from './material-rules'
import type { FieldRuleProfile } from './field-rules'

const fields = [
  { field_name: 'descricao_basica', field_label: 'Descrição Básica', responsible_role: 'CADASTRO', is_required: true },
  { field_name: 'tipo_material', field_label: 'Tipo de Material', responsible_role: 'CADASTRO', is_required: true },
  { field_name: 'tipo_mrp', field_label: 'Tipo MRP', responsible_role: 'MRP', is_required: true },
  { field_name: 'lote_minimo', field_label: 'Lote Mínimo', responsible_role: 'MRP', is_required: false },
]

const nlag: FieldRuleProfile = {
  id: 1,
  name: 'NLAG',
  conditions: { tipo_material: 'NLAG' },
  rules: { tipo_mrp: { requirement: 'hidden' }, lote_minimo: { role: 'CADASTRO', requirement: 'required' } },
  is_active: true,
}

describe('regras por material na base', () => {
  it('lê o atributo e usa a coluna quando ele está vazio', () => {
    expect(materialAttributes({ material_type: 'NLAG', technical_attributes: { tipo_mrp: 'PD' } })).toEqual({ tipo_mrp: 'PD', tipo_material: 'NLAG' })
    expect(materialAttributes({ material_type: 'FERT', technical_attributes: { tipo_material: 'NLAG' } }).tipo_material).toBe('NLAG')
    expect(materialAttributes({ technical_attributes: null })).toEqual({})
  })

  it('sem regra, cobra os obrigatórios do dicionário (menos a descrição gerada)', () => {
    const missing = missingMaterialFields(fields, { tipo_material: 'FERT' }, [nlag])
    expect(missing.map((f) => f.field_name)).toEqual(['tipo_mrp'])
    expect(missingMessage(missing)).toBe('Campos obrigatórios para este material: Tipo MRP')
  })

  it('a regra muda o que é cobrado: oculto não cobra, o movido de etapa continua valendo', () => {
    const missing = missingMaterialFields(fields, { tipo_material: 'NLAG' }, [nlag])
    expect(missing.map((f) => f.field_name)).toEqual(['lote_minimo'])
    expect(missingMaterialFields(fields, { tipo_material: 'NLAG', lote_minimo: { value: '', unit: 'UN' } }, [nlag])).toHaveLength(1)
  })

  it('tipo de material já definido não muda; o primeiro pode ser preenchido', () => {
    const fert = { material_type: 'FERT', technical_attributes: {} }
    expect(materialTypeChanged(fert, { ...fert, technical_attributes: { tipo_material: 'NLAG' } })).toBe(true)
    expect(materialTypeChanged(fert, { ...fert, technical_attributes: { tipo_material: ' fert ' } })).toBe(false)
    expect(materialTypeChanged({ technical_attributes: {} }, { technical_attributes: { tipo_material: 'ROH' } })).toBe(false)
    expect(materialTypeChanged(fert, { material_type: null, technical_attributes: {} })).toBe(true)
  })

  it('campo oculto enviado sai e é avisado; vazio não conta', () => {
    const out = dropHiddenFields({ tipo_mrp: 'PD', lote_minimo: '5', outro: '' }, fields, { tipo_material: 'NLAG' }, [nlag])
    expect(out.kept).toEqual({ lote_minimo: '5', outro: '' })
    expect(out.dropped.map((f) => f.field_name)).toEqual(['tipo_mrp'])
    expect(dropHiddenFields({ tipo_mrp: '' }, fields, { tipo_material: 'NLAG' }, [nlag]).dropped).toEqual([])
  })
})
