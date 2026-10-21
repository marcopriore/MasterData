import { describe, expect, it } from 'vitest'
import { parseMaterialInput, parseRequestInput } from '@/lib/material-api/payload'
import {
  inboundEndpoints,
  MATERIAL_CREATE_EXAMPLE,
  MATERIAL_FIELDS,
  MATERIAL_UPDATE_EXAMPLE,
  outboundOperations,
  REQUEST_CREATE_EXAMPLE,
  REQUEST_FIELDS,
} from './catalog'
import { buildOpenApi } from './openapi'

describe('documentação bate com o contrato', () => {
  it('os exemplos de entrada passam na validação das rotas', () => {
    expect(parseMaterialInput(MATERIAL_CREATE_EXAMPLE, 'create').ok).toBe(true)
    expect(parseMaterialInput(MATERIAL_UPDATE_EXAMPLE, 'update').ok).toBe(true)
    expect(parseRequestInput(REQUEST_CREATE_EXAMPLE).ok).toBe(true)
  })

  it('todo campo documentado é aceito pela validação', () => {
    for (const field of MATERIAL_FIELDS) {
      const result = parseMaterialInput({ descricao: 'X', [field.name]: null }, 'create')
      if (!result.ok) expect(result.errors.join(), field.name).not.toContain('campo desconhecido')
    }
    for (const field of REQUEST_FIELDS) {
      const result = parseRequestInput({ pdm_codigo: 'P', solicitante: 'S', [field.name]: field.name === 'atributos' ? {} : 'x' })
      if (!result.ok) expect(result.errors.join(), field.name).not.toContain('campo desconhecido')
    }
  })

  it('toda rota documenta o 401 da chave', () => {
    for (const endpoint of inboundEndpoints()) {
      expect(endpoint.errors.map((error) => error.status), endpoint.id).toContain(401)
    }
  })

  it('o JSON do ERP de exemplo sai da função que faz a chamada', () => {
    const [create, update, remove] = outboundOperations()
    expect(create.payload).toMatchObject({ contentID: 'MDM-000123', type: 'FERT', ncmCode: '8542.31.20', formatTaxICMS: 'EXONERADO' })
    expect(create.payload).not.toHaveProperty('productId')
    expect(update.payload).toMatchObject({ productId: '91' })
    expect(remove.payload).toEqual({ productId: '91', contentID: 'MDM-000123' })
  })

  it('o OpenAPI tem as quatro rotas e a chave no header', () => {
    const spec = buildOpenApi('https://promat.exemplo.com')
    expect(Object.keys(spec.paths).sort()).toEqual([
      '/api/v1/materials',
      '/api/v1/materials/{codigo}',
      '/api/v1/requests',
      '/api/v1/requests/{id}',
    ])
    expect(Object.keys(spec.paths['/api/v1/materials']).sort()).toEqual(['get', 'post'])
    expect(spec.components.securitySchemes.apiKey).toEqual({ type: 'apiKey', in: 'header', name: 'x-api-key' })
  })
})
