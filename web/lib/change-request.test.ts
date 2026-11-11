import { describe, expect, it } from 'vitest'
import { changedAttributes, changeRows, touchesPdm, validateChanges } from './change-request'

const material = {
  material_type: 'FERT',
  technical_attributes: { diametro: 'M8', tipo_mrp: 'PD', lote: '' },
}
const fields = [
  { field_name: 'descricao_basica', field_label: 'Descrição', responsible_role: 'CADASTRO', is_required: true, field_type: 'text', options: null, erp_view: 'dados_basicos' },
  { field_name: 'tipo_material', field_label: 'Tipo de Material', responsible_role: 'CADASTRO', is_required: true, field_type: 'select', options: ['FERT'], erp_view: 'dados_basicos' },
  { field_name: 'tipo_mrp', field_label: 'Tipo MRP', responsible_role: 'MRP', is_required: true, field_type: 'select', options: ['PD', 'VB'], erp_view: 'mrp' },
  { field_name: 'lote', field_label: 'Lote', responsible_role: 'MRP', is_required: false, field_type: 'number', options: null, erp_view: 'mrp' },
]
const nlagHidesLote = [{ id: 1, name: 'X', conditions: { tipo_material: 'FERT' }, rules: { lote: { requirement: 'hidden' as const } }, is_active: true }]

describe('solicitação de alteração', () => {
  const rows = changeRows({
    material,
    pdmAttributes: [{ id: 'diametro', name: 'Diâmetro', dataType: 'lov', allowedValues: [{ value: 'M8' }, { value: 'M10' }], isRequired: true }],
    fields,
    profiles: nlagHidesLote,
    viewLabel: (v) => v.toUpperCase(),
  })

  it('oferece atributos do PDM e campos do dicionário, sem tipo, sem descrição gerada e sem o oculto', () => {
    expect(rows.map((r) => [r.key, r.kind, r.type])).toEqual([
      ['diametro', 'pdm', 'select'],
      ['tipo_mrp', 'field', 'select'],
    ])
    expect(rows[0].current).toBe('M8')
  })

  it('valida: nada escolhido, obrigatório vazio, igual ao atual', () => {
    expect(validateChanges(rows, {})).toEqual(['Escolha ao menos um campo para alterar.'])
    expect(validateChanges(rows, { tipo_mrp: '' })).toEqual(['Tipo MRP: é obrigatório, não pode ficar vazio.'])
    expect(validateChanges(rows, { diametro: 'M8' })).toEqual(['Diâmetro: o valor novo é igual ao atual.'])
    expect(validateChanges(rows, { diametro: 'M10' })).toEqual([])
  })

  it('monta os atributos com os novos por cima e diz se mexe no PDM', () => {
    expect(changedAttributes(material, { tipo_mrp: ' VB ' })).toMatchObject({ diametro: 'M8', tipo_mrp: 'VB', tipo_material: 'FERT' })
    expect(touchesPdm(rows, { diametro: 'M10' })).toBe(true)
    expect(touchesPdm(rows, { tipo_mrp: 'VB' })).toBe(false)
  })
})
