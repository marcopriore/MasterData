import { describe, expect, it } from 'vitest'
import { parseMaterialInput, parseRequestInput, toApiMaterial } from './payload'

describe('JSON de material', () => {
  it('criação exige descrição', () => {
    const result = parseMaterialInput({ ncm: '8542.31.20' }, 'create')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toContain('descricao é obrigatório')
  })

  it('converte campos e blocos para as colunas da base', () => {
    const result = parseMaterialInput({
      descricao: 'APARELHO TELEF S/FIO PT',
      tipo_material: 'FERT',
      unidade_medida: 'PCE',
      ncm: '8542.31.20',
      eans: [{ categoria: 'IC', codigo: '17896637612569' }],
      dimensoes: [{ nome: 'LENGTH', quantidade: 1, unidade: 'CR' }],
      caracteristicas: [
        { nome: 'Z_PROG_CANAIS', valor: '1' },
        { nome: 'Z_PROG_CANAIS', valor: '2' },
      ],
      vendas: [{ salesOrganization: '1000', distributionChannel: '01', attributeInd1: false }],
      site: { siteCode: '1001 1002 1003', profitCenter: '41113' },
      campos_adicionais: { divisionCode: '01', formatTaxICMS: 'EXONERADO' },
    }, 'create')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      description: 'APARELHO TELEF S/FIO PT',
      material_type: 'FERT',
      unit_of_measure: 'PCE',
      ncm: '8542.31.20',
      eans: [{ category: 'IC', code: '17896637612569' }],
      dimensions: [{ name: 'LENGTH', quantity: '1', unit: 'CR' }],
      sales: [{ salesOrganization: '1000', distributionChannel: '01', attributeInd1: 'false' }],
      site: { siteCode: '1001 1002 1003', profitCenter: '41113' },
      additional_fields: { divisionCode: '01', formatTaxICMS: 'EXONERADO' },
    })
    expect(result.value.characteristics).toHaveLength(2)
  })

  it('recusa códigos que o PRO-MAT controla e campos desconhecidos', () => {
    const result = parseMaterialInput({ descricao: 'X', id_erp: '91', erp_status: 'integrado', cor: 'azul' }, 'create')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain('id_erp é definido pelo PRO-MAT')
      expect(result.errors).toContain('erp_status é definido pelo PRO-MAT')
      expect(result.errors).toContain('campo desconhecido: cor')
    }
  })

  it('alteração aceita só o que veio e não deixa apagar a descrição', () => {
    const partial = parseMaterialInput({ ncm: '73181500', grupo_mercadoria: null }, 'update')
    expect(partial).toEqual({ ok: true, value: { ncm: '73181500', material_group: null } })

    const cleared = parseMaterialInput({ descricao: null }, 'update')
    expect(cleared.ok).toBe(false)

    const empty = parseMaterialInput({}, 'update')
    expect(empty.ok).toBe(false)
  })

  it('aponta a linha do bloco com erro', () => {
    const result = parseMaterialInput({ descricao: 'X', dimensoes: [{ nome: 'HEIGHT', quantidade: 'muito', unidade: 'CR' }] }, 'create')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toContain('dimensoes[0].quantidade deve ser número')
  })

  it('devolve o material com chaves em português', () => {
    const api = toApiMaterial({
      id_sistema: 'MDM-000123',
      id_erp: null,
      description: 'PARAFUSO',
      eans: [{ category: 'HE', code: '7899298700104' }],
      characteristics: [{ name: 'Z_MODELO', value: '1' }],
      erp_status: 'pendente_erp',
      source: 'api',
    })
    expect(api).toMatchObject({
      id_sistema: 'MDM-000123',
      descricao: 'PARAFUSO',
      eans: [{ categoria: 'HE', codigo: '7899298700104' }],
      caracteristicas: [{ nome: 'Z_MODELO', valor: '1' }],
      erp_status: 'pendente_erp',
      origem: 'api',
    })
  })
})

describe('JSON de solicitação externa', () => {
  it('exige PDM e solicitante', () => {
    const result = parseRequestInput({ descricao: 'X' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain('pdm_codigo é obrigatório')
      expect(result.errors).toContain('solicitante é obrigatório')
    }
  })

  it('traduz urgência e mantém os atributos', () => {
    const result = parseRequestInput({
      pdm_codigo: 'PDM-001',
      solicitante: 'Sistema Compras',
      urgencia: 'Alta',
      atributos: { DIAMETRO: 'M8' },
    })
    expect(result).toMatchObject({ ok: true, value: { urgency: 'high', attributes: { DIAMETRO: 'M8' } } })
  })

  it('recusa urgência fora da lista', () => {
    const result = parseRequestInput({ pdm_codigo: 'PDM-001', solicitante: 'X', urgencia: 'urgente' })
    expect(result.ok).toBe(false)
  })
})
