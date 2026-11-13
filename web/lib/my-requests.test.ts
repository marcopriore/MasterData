import { describe, expect, it } from 'vitest'
import {
  applyMyRequests,
  countBySituation,
  DEFAULT_MY_REQUESTS,
  MY_REQUESTS_PAGE_SIZE,
  resubmitHref,
  situationOf,
  type MyRequestRow,
} from './my-requests'

describe('reenvio da rejeitada pelo caminho do tipo', () => {
  it('cadastro reabre o assistente; alteração e ampliação, a tela delas com o material', () => {
    expect(resubmitHref({ id: 7 })).toBe('/requests/new?reenviar=7')
    expect(resubmitHref({ id: 7, request_type: 'alteracao', target_material_id: 30 })).toBe('/requests/alteracao/30?reenviar=7')
    expect(resubmitHref({ id: 7, request_type: 'ampliacao', target_material_id: 30 })).toBe('/requests/ampliacao/30?reenviar=7')
  })

  it('sem material de origem, alteração e ampliação não têm reenvio', () => {
    expect(resubmitHref({ id: 7, request_type: 'ampliacao', target_material_id: null })).toBeNull()
  })
})

const row = (id: number, extra: Partial<MyRequestRow> = {}): MyRequestRow => ({
  id,
  code: `REQ-${String(id).padStart(4, '0')}`,
  pdm_name: 'Parafuso',
  pdm_code: 'PAR',
  description: 'PARAFUSO SEX M8',
  status: 'cadastro',
  step_label: 'Central de Cadastro',
  urgency: 'low',
  created_at: null,
  assigned_to_name: null,
  rejection_reason: null,
  can_cancel: false,
  ...extra,
})

describe('situationOf', () => {
  it('separa andamento, finalizada e rejeitada', () => {
    expect(situationOf('compras')).toBe('andamento')
    expect(situationOf('finalizado')).toBe('finalizada')
    expect(situationOf('Rejected')).toBe('rejeitada')
    expect(situationOf('rejeitado')).toBe('rejeitada')
    expect(situationOf('cancelado')).toBe('cancelada')
  })
})

describe('applyMyRequests', () => {
  const rows = [
    row(1),
    row(2, { status: 'finalizado' }),
    row(3, { status: 'Rejected', pdm_name: 'Válvula', description: 'VALVULA ESFERA 2"' }),
  ]

  it('filtra por situação', () => {
    expect(applyMyRequests(rows, { ...DEFAULT_MY_REQUESTS, situacao: 'rejeitada' }).rows.map((r) => r.id)).toEqual([3])
  })

  it('busca por código, PDM e descrição', () => {
    expect(applyMyRequests(rows, { ...DEFAULT_MY_REQUESTS, q: 'req-0002' }).rows.map((r) => r.id)).toEqual([2])
    expect(applyMyRequests(rows, { ...DEFAULT_MY_REQUESTS, q: 'válvula' }).rows.map((r) => r.id)).toEqual([3])
    expect(applyMyRequests(rows, { ...DEFAULT_MY_REQUESTS, q: 'esfera' }).rows.map((r) => r.id)).toEqual([3])
  })

  it('filtro de etapa do gráfico casa rejected e rejeitado', () => {
    expect(applyMyRequests(rows, { ...DEFAULT_MY_REQUESTS, etapa: 'rejected' }).rows.map((r) => r.id)).toEqual([3])
    expect(applyMyRequests(rows, { ...DEFAULT_MY_REQUESTS, etapa: 'cadastro' }).rows.map((r) => r.id)).toEqual([1])
  })

  it('pagina e corrige página fora do intervalo', () => {
    const many = Array.from({ length: MY_REQUESTS_PAGE_SIZE + 5 }, (_, i) => row(i + 1))
    const second = applyMyRequests(many, { ...DEFAULT_MY_REQUESTS, pagina: 2 })
    expect(second.rows).toHaveLength(5)
    expect(second.pages).toBe(2)
    expect(applyMyRequests(many, { ...DEFAULT_MY_REQUESTS, pagina: 9 }).page).toBe(2)
  })

  it('conta por situação', () => {
    expect(countBySituation(rows)).toEqual({ andamento: 1, finalizada: 1, rejeitada: 1, cancelada: 0 })
  })
})
