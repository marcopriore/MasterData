import { describe, expect, it } from 'vitest'
import { buildErpDeletePayload, buildErpPayload, readCode, readMessage } from './payload'

const material = {
  id_sistema: 'MDM-000123',
  id_erp: null,
  description: 'APARELHO TELEF S/FIO PT',
  material_type: 'FERT',
  unit_of_measure: 'PCE',
  ncm: '8542.31.20',
  material_group: '402003',
  technical_attributes: {
    icms: 'EXONERADO',
    centro_lucro: '41113',
    li: 'N',
    potencia: { value: '1', unit: 'W' },
  },
  eans: [{ category: 'IC', code: '17896637612569' }],
  dimensions: [{ name: 'LENGTH', quantity: '1.0', unit: 'CR' }],
  sales: [{ salesOrganization: '1000', distributionChannel: '01' }],
  site: { siteCode: '1001 1002 1003' },
  characteristics: [{ name: 'Z_NECESSITA_LI', value: 'S' }, { name: 'Z_PROG_CANAIS', value: '1' }],
  additional_fields: { divisionCode: '01', type: 'HAWA' },
}

const fields = [
  { field_name: 'icms', erp_field: 'formatTaxICMS', erp_block: 'header' },
  { field_name: 'centro_lucro', erp_field: 'profitCenter', erp_block: 'site' },
  { field_name: 'li', erp_field: 'Z_NECESSITA_LI', erp_block: null },
  { field_name: 'potencia', erp_field: 'Z_POTENCIA', erp_block: 'characteristics' },
  { field_name: 'sem_valor', erp_field: 'Z_VAZIO', erp_block: null },
  { field_name: 'icms', erp_field: null, erp_block: 'header' },
]

describe('JSON do ERP', () => {
  const payload = buildErpPayload(material, fields)

  it('monta o cabeçalho com colunas, campos adicionais e dicionário', () => {
    expect(payload).toMatchObject({
      contentID: 'MDM-000123',
      type: 'HAWA',
      unitMeasure: 'PCE',
      ncmCode: '8542.31.20',
      internalGroup: '402003',
      divisionCode: '01',
      formatTaxICMS: 'EXONERADO',
      descriptions: { language: 'pt', name: 'APARELHO TELEF S/FIO PT' },
    })
    expect(payload).not.toHaveProperty('productId')
  })

  it('leva os blocos e põe cada campo do dicionário no bloco dele', () => {
    expect(payload.eans).toEqual([{ category: 'IC', code: '17896637612569' }])
    expect(payload.dimensions).toEqual([{ name: 'LENGTH', quantity: '1.0', unit: 'CR' }])
    expect(payload.sales).toEqual([{ salesOrganization: '1000', distributionChannel: '01' }])
    expect(payload.site).toEqual({ siteCode: '1001 1002 1003', profitCenter: '41113' })
    expect(payload.characteristics).toEqual([
      { name: 'Z_PROG_CANAIS', value: '1' },
      { name: 'Z_NECESSITA_LI', value: 'N' },
      { name: 'Z_POTENCIA', value: '1 W' },
    ])
  })

  it('alteração e eliminação levam o código do ERP', () => {
    expect(buildErpPayload({ ...material, id_erp: '91' }).productId).toBe('91')
    expect(buildErpDeletePayload({ ...material, id_erp: '91' })).toEqual({ productId: '91', contentID: 'MDM-000123' })
  })
})

describe('resposta do ERP', () => {
  it('lê o código no caminho configurado', () => {
    expect(readCode({ productId: 91 }, 'productId')).toBe('91')
    expect(readCode({ data: { productId: 'MAT-1' } }, 'data.productId')).toBe('MAT-1')
    expect(readCode({ items: [{ id: 'X' }] }, 'items.0.id')).toBe('X')
    expect(readCode({ data: {} }, 'data.productId')).toBeNull()
  })

  it('acha a mensagem de erro ou usa o texto cru', () => {
    expect(readMessage({ error: { message: 'NCM inválido' } }, '')).toBe('NCM inválido')
    expect(readMessage({ mensagem: 'Grupo inexistente' }, '')).toBe('Grupo inexistente')
    expect(readMessage(null, 'Bad Gateway')).toBe('Bad Gateway')
  })
})
