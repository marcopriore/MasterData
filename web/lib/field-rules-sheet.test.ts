import { describe, expect, it } from 'vitest'
import { buildRuleSheets, parseEntry, parseRuleSheets, SHEET_CONDITIONS, SHEET_FIELDS } from './field-rules-sheet'
import type { FieldRuleProfile } from './field-rules'

const fields = [
  { field_name: 'tipo_material', field_label: 'Tipo de Material', responsible_role: 'CADASTRO', is_required: true },
  { field_name: 'grupo_compras', field_label: 'Grupo de Compras', responsible_role: 'COMPRAS', is_required: true },
  { field_name: 'tipo_mrp', field_label: 'Tipo MRP', responsible_role: 'MRP', is_required: false },
]
const roles = ['CADASTRO', 'COMPRAS', 'MRP']

describe('planilha das regras por material', () => {
  it('exporta e lê de volta as mesmas regras', () => {
    const profiles: FieldRuleProfile[] = [
      { id: 1, name: 'FERT', conditions: { tipo_material: 'FERT' }, rules: { tipo_mrp: { requirement: 'required' } }, is_active: true },
      { id: 2, name: 'NLAG', conditions: { tipo_material: 'NLAG' }, rules: { tipo_mrp: { requirement: 'hidden' }, grupo_compras: { role: 'CADASTRO', requirement: 'optional' } }, is_active: false },
    ]
    const sheets = Object.fromEntries(buildRuleSheets(fields, profiles).map((s) => [s.name, s.rows]))
    expect(sheets[SHEET_FIELDS].map((r) => r['Código'])).toEqual(['grupo_compras', 'tipo_mrp'])
    expect(sheets[SHEET_FIELDS][0].NLAG).toBe('CADASTRO · Opcional')
    const parsed = parseRuleSheets(sheets, fields, roles)
    expect(parsed.errors).toEqual([])
    expect(parsed.profiles).toEqual(profiles.map(({ id: _id, ...p }) => p))
  })

  it('lê a célula com etapa e exigência', () => {
    expect(parseEntry('mrp - obrigatório')).toEqual({ role: 'MRP', requirement: 'required' })
    expect(parseEntry('Não aparece')).toEqual({ role: null, requirement: 'hidden' })
    expect(parseEntry('MRP')).toBeNull()
  })

  it('aponta abas, condições, campos e valores inválidos', () => {
    expect(parseRuleSheets({}, fields, roles).errors).toHaveLength(2)
    const parsed = parseRuleSheets(
      {
        [SHEET_CONDITIONS]: [
          { Regra: 'fert', 'Tipo de Material': 'FERT' },
          { Regra: 'SEM CONDICAO', 'Tipo de Material': '' },
        ],
        [SHEET_FIELDS]: [
          { 'Código': 'tipo_mrp', FERT: 'talvez' },
          { 'Código': 'nao_existe', FERT: 'Não aparece' },
          { 'Código': 'grupo_compras', FERT: 'FISCAL · Obrigatório' },
        ],
      },
      fields,
      roles
    )
    expect(parsed.errors).toEqual([
      'Condições, linha 3: "SEM CONDICAO" precisa de ao menos uma condição.',
      'Campos, linha 2: "talvez" na regra FERT; use "ETAPA · Obrigatório", "ETAPA · Opcional", "Não aparece" ou deixe vazio.',
      'Campos, linha 3: campo "nao_existe" não existe no dicionário.',
      'Campos, linha 4: etapa "FISCAL" não existe.',
    ])
  })
})
