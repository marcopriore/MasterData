import { describe, expect, it } from 'vitest'
import { applyAttended, countByAction, DEFAULT_ATTENDED, summarizeAttended, type AttendedRequestInfo } from './attended-requests'

const info = (id: number, extra: Partial<AttendedRequestInfo> = {}): AttendedRequestInfo => ({
  id,
  pdm_name: 'VALVULA',
  description: `VALVULA ${id}`,
  status: 'compras',
  step_label: 'Compras',
  ...extra,
})

describe('solicitações atendidas', () => {
  const requests = new Map([1, 2, 3].map((id) => [id, info(id)]))

  it('a ação é a última decisão; sem decisão, "só iniciei"', () => {
    const rows = summarizeAttended(
      [
        { request_id: 1, event_type: 'assigned', created_at: '2026-10-01T10:00:00Z' },
        { request_id: 1, event_type: 'approved', created_at: '2026-10-01T11:00:00Z' },
        { request_id: 1, event_type: 'assigned', created_at: '2026-10-05T09:00:00Z' },
        { request_id: 2, event_type: 'assigned', created_at: '2026-10-03T10:00:00Z' },
        { request_id: 3, event_type: 'rejected', created_at: '2026-10-02T10:00:00Z' },
      ],
      requests
    )
    expect(rows.map((r) => [r.code, r.my_action, r.my_events])).toEqual([
      ['REQ-0001', 'aprovei', 3],
      ['REQ-0002', 'iniciei', 1],
      ['REQ-0003', 'rejeitei', 1],
    ])
    expect(rows[0].my_last_at).toBe('2026-10-05T09:00:00Z')
  })

  it('solicitação que não voltou do banco fica de fora', () => {
    const rows = summarizeAttended([{ request_id: 9, event_type: 'approved', created_at: '2026-10-01T10:00:00Z' }], requests)
    expect(rows).toEqual([])
  })

  it('conta por ação e filtra por ação e busca', () => {
    const rows = summarizeAttended(
      [
        { request_id: 1, event_type: 'approved', created_at: '2026-10-01T10:00:00Z' },
        { request_id: 2, event_type: 'stage_change', created_at: '2026-10-02T10:00:00Z' },
        { request_id: 3, event_type: 'approved', created_at: '2026-10-03T10:00:00Z' },
      ],
      requests
    )
    expect(countByAction(rows)).toEqual({ aprovei: 2, rejeitei: 0, movi: 1, iniciei: 0 })
    expect(applyAttended(rows, { ...DEFAULT_ATTENDED, acao: 'aprovei' }).total).toBe(2)
    expect(applyAttended(rows, { ...DEFAULT_ATTENDED, q: 'req-0002' }).rows.map((r) => r.id)).toEqual([2])
  })
})
