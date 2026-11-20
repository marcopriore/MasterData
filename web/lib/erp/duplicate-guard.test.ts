import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

import { requestDuplicateCodes, type GuardMaterial, type PdmGroup } from './duplicate-guard'

const material: GuardMaterial = {
  id: 10,
  id_sistema: 'MAT-10',
  description: 'PARAFUSO',
  detailed_description: 'PARAFUSO SEXTAVADO M8',
  pdm_code: 'PAR',
  status: 'Ativo',
  request_id: 100,
  technical_attributes: { diametro: 'M8', cabeca: 'Sextavada', cor: 'azul' },
}

const group = (over: Partial<PdmGroup> = {}): PdmGroup => ({
  keys: ['diametro', 'cabeca'],
  materials: [],
  requests: [],
  ...over,
})

const row = (id: number, attrs: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id,
  id_sistema: `X-${id}`,
  status: 'Ativo',
  technical_attributes: attrs,
  target_material_id: null,
  ...extra,
})

describe('requestDuplicateCodes', () => {
  it('acha material e solicitação aberta com os mesmos atributos da descrição (sem diferenciar maiúsculas)', () => {
    const codes = requestDuplicateCodes(material, group({
      materials: [row(11, { diametro: 'm8', cabeca: 'SEXTAVADA', cor: 'verde' })],
      requests: [row(101, { diametro: 'M8', cabeca: 'Sextavada' }, { status: 'cadastro' })],
    }))
    expect(codes).toEqual(['X-11', 'solicitação X-101'])
  })

  it('não conta o próprio material nem a própria solicitação', () => {
    const codes = requestDuplicateCodes(material, group({
      materials: [row(10, { diametro: 'M8', cabeca: 'Sextavada' })],
      requests: [row(100, { diametro: 'M8', cabeca: 'Sextavada' }, { status: 'cadastro' })],
    }))
    expect(codes).toEqual([])
  })

  it('a alteração aberta do próprio material não é duplicidade', () => {
    const codes = requestDuplicateCodes(material, group({
      requests: [row(102, { diametro: 'M8', cabeca: 'Sextavada' }, { status: 'cadastro', target_material_id: 10 })],
    }))
    expect(codes).toEqual([])
  })

  it('alteração de outro material conta', () => {
    const codes = requestDuplicateCodes(material, group({
      requests: [row(103, { diametro: 'M8', cabeca: 'Sextavada' }, { status: 'cadastro', target_material_id: 99 })],
    }))
    expect(codes).toEqual(['solicitação X-103'])
  })

  it('solicitação finalizada, rejeitada ou cancelada e material obsoleto não contam', () => {
    const same = { diametro: 'M8', cabeca: 'Sextavada' }
    const codes = requestDuplicateCodes(material, group({
      materials: [row(12, same, { status: 'Obsoleto' })],
      requests: [
        row(104, same, { status: 'finalizado' }),
        row(105, same, { status: 'rejeitado' }),
        row(106, same, { status: 'cancelado' }),
      ],
    }))
    expect(codes).toEqual([])
  })

  it('atributo diferente ou faltando não é duplicidade', () => {
    const codes = requestDuplicateCodes(material, group({
      materials: [row(13, { diametro: 'M10', cabeca: 'Sextavada' }), row(14, { diametro: 'M8' })],
    }))
    expect(codes).toEqual([])
  })

  it('sem solicitação de origem, sem PDM, sem grupo ou sem atributo de descrição: nada a comparar', () => {
    const dup = group({ materials: [row(11, { diametro: 'M8', cabeca: 'Sextavada' })] })
    expect(requestDuplicateCodes({ ...material, request_id: null }, dup)).toEqual([])
    expect(requestDuplicateCodes({ ...material, pdm_code: null }, dup)).toEqual([])
    expect(requestDuplicateCodes(material, undefined)).toEqual([])
    expect(requestDuplicateCodes(material, { ...dup, keys: [] })).toEqual([])
    expect(requestDuplicateCodes({ ...material, technical_attributes: {} }, dup)).toEqual([])
  })
})
