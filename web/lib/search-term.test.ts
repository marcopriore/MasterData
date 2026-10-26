import { describe, expect, it } from 'vitest'
import { safeSearchTerm } from './search-term'

describe('texto de busca', () => {
  it('remove o que mudaria o filtro do PostgREST', () => {
    expect(safeSearchTerm('abc,tenant_id.eq.2')).toBe('abctenant_ideq2')
    expect(safeSearchTerm('x),or(id.gt.0')).toBe('xoridgt0')
  })

  it('mantém letras com acento, números, espaço, hífen, sublinhado e barra', () => {
    expect(safeSearchTerm('  Rolamento 6205-2Z/C3_ação ')).toBe('Rolamento 6205-2Z/C3_ação')
  })

  it('corta no tamanho máximo e aceita vazio', () => {
    expect(safeSearchTerm('a'.repeat(150))).toHaveLength(100)
    expect(safeSearchTerm(null)).toBe('')
  })
})
