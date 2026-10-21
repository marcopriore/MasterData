import { describe, expect, it } from 'vitest'
import { applyPdmList, DEFAULT_PDM_LIST, pdmListQuery, readPdmListState, type PdmListRow } from './pdm-list'

const rows: PdmListRow[] = [
  { id: 1, name: 'PARAFUSO SEXTAVADO', internal_code: 'FIX001', is_active: true, materials_count: 12 },
  { id: 2, name: 'ROLAMENTO RÍGIDO', internal_code: 'MEC002', is_active: true, materials_count: 0 },
  { id: 3, name: 'ARRUELA LISA', internal_code: 'FIX002', is_active: false, materials_count: 3 },
  { id: 4, name: 'BUCHA', internal_code: 'MEC010', is_active: true, materials_count: 7 },
]

const state = (extra: Partial<typeof DEFAULT_PDM_LIST>) => ({ ...DEFAULT_PDM_LIST, ...extra })

describe('lista de PDMs', () => {
  it('sem filtro traz todos, por nome', () => {
    const result = applyPdmList(rows, DEFAULT_PDM_LIST)
    expect(result.total).toBe(4)
    expect(result.rows.map((r) => r.id)).toEqual([3, 4, 1, 2])
  })

  it('busca por nome ou código, sem acento e sem caixa', () => {
    expect(applyPdmList(rows, state({ q: 'rigido' })).rows.map((r) => r.id)).toEqual([2])
    expect(applyPdmList(rows, state({ q: 'fix0' })).rows.map((r) => r.id)).toEqual([3, 1])
  })

  it('filtra situação e uso', () => {
    expect(applyPdmList(rows, state({ situacao: 'inativos' })).rows.map((r) => r.id)).toEqual([3])
    expect(applyPdmList(rows, state({ uso: 'sem' })).rows.map((r) => r.id)).toEqual([2])
    expect(applyPdmList(rows, state({ situacao: 'ativos', uso: 'com' })).rows.map((r) => r.id)).toEqual([4, 1])
  })

  it('ordena por materiais e código nos dois sentidos', () => {
    expect(applyPdmList(rows, state({ ordem: 'materiais', dir: 'desc' })).rows.map((r) => r.id)).toEqual([1, 4, 3, 2])
    expect(applyPdmList(rows, state({ ordem: 'codigo' })).rows.map((r) => r.internal_code)).toEqual(['FIX001', 'FIX002', 'MEC002', 'MEC010'])
  })

  it('pagina de 25 em 25 e não passa da última página', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, name: `PDM ${String(i + 1).padStart(2, '0')}`, internal_code: `C${i}` }))
    expect(applyPdmList(many, state({ pagina: 2 }))).toMatchObject({ total: 60, pages: 3, page: 2 })
    expect(applyPdmList(many, state({ pagina: 2 })).rows[0].name).toBe('PDM 26')
    const last = applyPdmList(many, state({ pagina: 9 }))
    expect(last.page).toBe(3)
    expect(last.rows).toHaveLength(10)
  })

  it('o estado vai e volta pela URL, e valor estranho cai no padrão', () => {
    const custom = state({ q: 'fix', situacao: 'ativos', ordem: 'materiais', dir: 'desc', pagina: 2 })
    const query = pdmListQuery(custom)
    expect(readPdmListState(new URLSearchParams(query))).toEqual(custom)
    expect(pdmListQuery(DEFAULT_PDM_LIST)).toBe('')
    expect(readPdmListState(new URLSearchParams('situacao=xx&pagina=-3&ordem=drop'))).toEqual(DEFAULT_PDM_LIST)
  })
})
