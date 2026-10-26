import { describe, expect, it } from 'vitest'
import { isErpText, toErpDeep, toErpText } from './erp-text'

describe('toErpText', () => {
  it('tira acento e cedilha mantendo a caixa', () => {
    expect(toErpText('MOTOR ELÉTRICO')).toBe('MOTOR ELETRICO')
    expect(toErpText('Válvula de Pressão')).toBe('Valvula de Pressao')
    expect(toErpText('AÇO INOX')).toBe('ACO INOX')
    expect(toErpText('ãõâêîôûàèìòùäëïöüñ')).toBe('aoaeiouaeiouaeioun')
  })

  it('mantém a pontuação técnica', () => {
    expect(toErpText('VALVULA ESFERA 1/2" 300# 90% (INOX) M8X1,25')).toBe('VALVULA ESFERA 1/2" 300# 90% (INOX) M8X1,25')
  })

  it('troca símbolos pelo equivalente', () => {
    expect(toErpText('TUBO ½” × 2m²')).toBe('TUBO 1/2" X 2m2')
    expect(toErpText('Nº 3 – 1ª linha')).toBe('NO 3 - 1A linha')
    expect(toErpText('COTOVELO 90°')).toBe('COTOVELO 90')
  })

  it('remove o resto, inclusive emoji e símbolos sem equivalente', () => {
    expect(toErpText('PARAFUSO 🔩 €10 <M8> {x} [y] | ~ ^ ` \\')).toBe('PARAFUSO  10 M8 x y     ')
  })

  it('mantém a quebra de linha da descrição detalhada', () => {
    expect(toErpText('PARAFUSO\r\n\r\nDIÂMETRO: M8')).toBe('PARAFUSO\n\nDIAMETRO: M8')
  })

  it('é idempotente', () => {
    const once = toErpText('Ação ½” ºC')
    expect(toErpText(once)).toBe(once)
    expect(isErpText(once)).toBe(true)
    expect(isErpText('Ação')).toBe(false)
  })
})

describe('toErpDeep', () => {
  it('normaliza valores de objetos aninhados e listas, sem mexer nas chaves', () => {
    expect(
      toErpDeep({ material: 'Aço', diametro: { value: '½', unit: 'mm' }, lista: ['Pressão', 3], chave_ç: true })
    ).toEqual({ material: 'Aco', diametro: { value: '1/2', unit: 'mm' }, lista: ['Pressao', 3], chave_ç: true })
  })
})
