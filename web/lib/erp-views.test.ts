import { describe, expect, it } from 'vitest'
import { erpViewCode, erpViewLabel } from './erp-views'

describe('visões ERP', () => {
  it('rótulo antigo e código viram o mesmo código', () => {
    expect(erpViewCode('Dados Básicos')).toBe('dados_basicos')
    expect(erpViewCode('dados_basicos')).toBe('dados_basicos')
    expect(erpViewCode('Compras')).toBe('compras')
    expect(erpViewCode('Classificação Fiscal')).toBe('fiscal')
    expect(erpViewCode('MRP')).toBe('mrp')
  })

  it('rótulo para a tela; vazio vira Outros', () => {
    expect(erpViewLabel('dados_basicos')).toBe('Dados Básicos')
    expect(erpViewLabel('Compras')).toBe('Compras')
    expect(erpViewLabel('')).toBe('Outros')
    expect(erpViewLabel('Qualidade')).toBe('Qualidade')
  })
})
