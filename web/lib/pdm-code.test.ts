import { describe, expect, it } from 'vitest'
import { normalizePdmCode, pdmCodeBase, pdmCodeProblem, pdmNameKey, suggestPdmCode } from './pdm-code'

describe('código do PDM', () => {
  it('normaliza para até 10 caracteres em maiúsculas', () => {
    expect(normalizePdmCode('ind_serviço de inspeção')).toBe('IND_SERVIC')
    expect(normalizePdmCode('pdm-mot-001')).toBe('PDM-MOT-00')
    expect(normalizePdmCode('Válv 01!')).toBe('VALV01')
  })

  it('valida tamanho e caracteres', () => {
    expect(pdmCodeProblem('PARA001')).toBeNull()
    expect(pdmCodeProblem('')).toMatch(/Informe/)
    expect(pdmCodeProblem('ABCDEFGHIJK')).toMatch(/10/)
    expect(pdmCodeProblem('ÁGUA')).toMatch(/letras/)
  })

  it('base de 4 letras ignora preposições e acento', () => {
    expect(pdmCodeBase('Motor Elétrico')).toBe('MOTO')
    expect(pdmCodeBase('Serviço de inspeção')).toBe('SERV')
    expect(pdmCodeBase('Cópia de Parafuso')).toBe('COPI')
    expect(pdmCodeBase('Pá')).toBe('PAXX')
    expect(pdmCodeBase('de da')).toBe('XXXX')
  })

  it('sugere o próximo código livre', () => {
    expect(suggestPdmCode('Serviço de usinagem', ['SERV001'])).toBe('SERV002')
    expect(suggestPdmCode('Válvula', [])).toBe('VALV001')
  })

  it('nome repetido é detectado sem acento e sem caixa', () => {
    expect(pdmNameKey('  Válvula   Esfera ')).toBe(pdmNameKey('VALVULA ESFERA'))
  })
})
