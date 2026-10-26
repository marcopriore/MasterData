import { describe, expect, it } from 'vitest'
import { canSyncFromRequest, requestErpState, type RequestErpMaterial } from './request-erp-state'

const material = (extra: Partial<RequestErpMaterial> = {}): RequestErpMaterial => ({
  id: 1,
  id_sistema: 'MDM-000001',
  id_erp: null,
  status: 'Ativo',
  erp_status: 'pendente_erp',
  erp_error_message: null,
  ...extra,
})

describe('requestErpState', () => {
  it('duplicado fica em alerta e não sincroniza pela solicitação', () => {
    const state = requestErpState({ request_id: 1, material: material(), duplicate_codes: ['MDM-000002'] })
    expect(state.kind).toBe('duplicado')
    expect(state.tone).toBe('alert')
    expect(canSyncFromRequest(state)).toBe(false)
  })

  it('duplicidade vale também para material em erro', () => {
    const state = requestErpState({ request_id: 1, material: material({ erp_status: 'erro_erp' }), duplicate_codes: ['MDM-000002'] })
    expect(state.kind).toBe('duplicado')
  })

  it('erro do ERP mostra a mensagem e permite nova tentativa', () => {
    const state = requestErpState({ request_id: 1, material: material({ erp_status: 'erro_erp', erp_error_message: 'NCM inválido' }), duplicate_codes: [] })
    expect(state.kind).toBe('erro')
    if (state.tone === 'alert') expect(state.detail).toBe('NCM inválido')
    expect(canSyncFromRequest(state)).toBe(true)
  })

  it('pendente fica em alerta e permite sincronizar', () => {
    const state = requestErpState({ request_id: 1, material: material(), duplicate_codes: [] })
    expect(state.kind).toBe('pendente')
    expect(canSyncFromRequest(state)).toBe(true)
  })

  it('integrado não alerta', () => {
    const state = requestErpState({ request_id: 1, material: material({ erp_status: 'integrado_erp', id_erp: '91' }), duplicate_codes: [] })
    expect(state).toEqual({ kind: 'integrado', tone: 'ok', label: 'ERP 91' })
  })

  it('integrado ignora duplicidade calculada depois', () => {
    const state = requestErpState({ request_id: 1, material: material({ erp_status: 'integrado_erp' }), duplicate_codes: ['MDM-000002'] })
    expect(state.kind).toBe('integrado')
  })

  it('finalizada sem material alerta e não sincroniza', () => {
    const state = requestErpState({ request_id: 1, material: null, duplicate_codes: [] })
    expect(state.kind).toBe('sem_material')
    expect(canSyncFromRequest(state)).toBe(false)
  })

  it('Obsoleto e integrando não alertam', () => {
    expect(requestErpState({ request_id: 1, material: material({ status: 'Obsoleto' }), duplicate_codes: [] }).tone).toBe('neutral')
    expect(requestErpState({ request_id: 1, material: material({ erp_status: 'integrando' }), duplicate_codes: [] }).tone).toBe('info')
  })
})
