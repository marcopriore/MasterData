import { describe, expect, it } from 'vitest'
import {
  attrsMatch,
  descriptionAttrKeys,
  duplicateKey,
  duplicatesOf,
  groupMaterialDuplicates,
  pickDescriptionAttrs,
} from './material-duplicates'

const row = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  id_sistema: `MDM-${String(id).padStart(6, '0')}`,
  description: 'PARAFUSO SEX M8',
  detailed_description: null,
  pdm_code: 'PAR',
  status: 'Ativo',
  ...extra,
})

describe('regra da base', () => {
  it('mesma descrição curta no mesmo PDM é duplicado', () => {
    const map = groupMaterialDuplicates([row(1), row(2)])
    expect(map.get(1)).toEqual(['MDM-000002'])
    expect(map.get(2)).toEqual(['MDM-000001'])
  })

  it('mesma descrição curta em outro PDM não é', () => {
    expect(groupMaterialDuplicates([row(1), row(2, { pdm_code: 'OUTRO' })]).size).toBe(0)
  })

  it('descrição detalhada manda quando existe, sem diferenciar maiúsculas', () => {
    const map = groupMaterialDuplicates([
      row(1, { detailed_description: 'PARAFUSO\nDIAMETRO: M8', pdm_code: 'A' }),
      row(2, { detailed_description: 'parafuso\ndiametro: m8 ', pdm_code: 'B' }),
    ])
    expect(map.has(1) && map.has(2)).toBe(true)
  })

  it('Obsoleto não conta: o outro perde a marcação', () => {
    expect(groupMaterialDuplicates([row(1), row(2, { status: 'Obsoleto' })]).size).toBe(0)
    expect(duplicatesOf(row(1), [row(2, { status: 'Obsoleto' })])).toEqual([])
  })

  it('Bloqueado continua contando', () => {
    expect(duplicatesOf(row(1), [row(2, { status: 'Bloqueado' })])).toEqual(['MDM-000002'])
  })

  it('material sem descrição não vira duplicado de outro sem descrição', () => {
    expect(duplicateKey(row(1, { description: '' }))).toBeNull()
    expect(groupMaterialDuplicates([row(1, { description: '' }), row(2, { description: '' })]).size).toBe(0)
  })

  it('o próprio material não é duplicado dele mesmo', () => {
    expect(duplicatesOf(row(1), [row(1)])).toEqual([])
  })
})

describe('regra da solicitação', () => {
  const attributes = [
    { id: 'tipo', includeInDescription: true },
    { id: 'diametro', includeInDescription: true },
    { id: 'obs', includeInDescription: false },
  ]
  const keys = descriptionAttrKeys(attributes)

  it('só os atributos da descrição entram', () => {
    expect(keys).toEqual(['tipo', 'diametro'])
  })

  it('compara sem maiúsculas e junta valor com unidade', () => {
    const a = pickDescriptionAttrs({ tipo: 'Sextavado', diametro: { value: '8', unit: 'mm' }, obs: 'x' }, keys)
    const b = pickDescriptionAttrs({ tipo: 'SEXTAVADO ', diametro: '8mm', obs: 'y' }, keys)
    expect(attrsMatch(a, b)).toBe(true)
  })

  it('atributo diferente não é duplicado', () => {
    const a = pickDescriptionAttrs({ tipo: 'Sextavado', diametro: '8' }, keys)
    const b = pickDescriptionAttrs({ tipo: 'Sextavado', diametro: '10' }, keys)
    expect(attrsMatch(a, b)).toBe(false)
  })

  it('sem atributo preenchido não casa com nada', () => {
    expect(attrsMatch({}, {})).toBe(false)
  })
})
