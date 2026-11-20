import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { doneRequestIds, finalizedRequestIds, listRequests, pickWorkflowId, requestsFinishedAt } from './governance'
import type { ApiRequest, WorkflowHeader } from '@/lib/supabase-api'

type Call = { table: string; ops: Array<[string, unknown[]]> }

/** Cliente falso: registra a cadeia de cada consulta e responde pelo nome da tabela. */
function fakeDb(respond: (call: Call) => { data: unknown; error?: unknown }) {
  const calls: Call[] = []
  const db = {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const builder: Record<string, unknown> = {}
      for (const op of ['select', 'eq', 'in', 'or', 'order', 'range', 'limit']) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, args])
          return builder
        }
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ error: null, ...respond(call) }).then(resolve, reject)
      return builder
    },
  }
  return { db: db as unknown as SupabaseClient, calls }
}

const wf = (id: number, request_type: WorkflowHeader['request_type'], is_active: boolean): WorkflowHeader =>
  ({ id, name: `W${id}`, request_type, is_active })

describe('pickWorkflowId', () => {
  const list = [wf(1, 'cadastro', false), wf(2, 'cadastro', true), wf(3, 'alteracao', false)]

  it('prefere o ativo do tipo; sem ativo, o primeiro do tipo', () => {
    expect(pickWorkflowId(list, 'cadastro')).toBe(2)
    expect(pickWorkflowId(list, 'alteracao')).toBe(3)
  })

  it('sem workflow do tipo: nenhum, ou qualquer um quando pedido', () => {
    expect(pickWorkflowId(list, 'ampliacao')).toBeNull()
    expect(pickWorkflowId(list, 'ampliacao', true)).toBe(2)
    expect(pickWorkflowId([], 'cadastro', true)).toBeNull()
  })

  it('workflow sem tipo conta como cadastro', () => {
    expect(pickWorkflowId([{ id: 9, name: 'antigo', is_active: true }], 'cadastro')).toBe(9)
  })
})

describe('listas derivadas do quadro', () => {
  const reqs = [
    { id: 1, status: 'finalizado' },
    { id: 2, status: 'cadastro' },
    { id: 3, status: 'completed' },
    { id: 4, status: 'rejeitado' },
  ] as ApiRequest[]

  it('finalizadas e concluídas mantêm a ordem da lista (a chave do cache depende dela)', () => {
    expect(finalizedRequestIds(reqs)).toEqual([1, 3])
    expect(doneRequestIds(reqs)).toEqual([1, 3])
  })
})

describe('listRequests', () => {
  it('traz o responsável na mesma consulta e os atributos de cada PDM numa consulta só', async () => {
    const { db, calls } = fakeDb((call) => {
      if (call.table === 'material_requests') {
        return {
          data: [
            { id: 10, status: 'cadastro', pdm_id: 5, assigned_to_id: 'u1', assignee: { name: 'Ana' }, pdm_templates: { id: 5, name: 'PARAFUSO' }, created_at: '2026-01-01' },
            { id: 11, status: 'compras', pdm_id: 5, assigned_to_id: 'u2', assignee: null, pdm_templates: { id: 5, name: 'PARAFUSO' }, created_at: '2026-01-02' },
            { id: 12, status: 'mrp', pdm_id: 6, assigned_to_id: null, assignee: null, pdm_templates: [{ id: 6, name: 'PORCA' }], created_at: '2026-01-03' },
          ],
        }
      }
      return { data: [{ id: 5, attributes: [{ id: 'd', name: 'Diâmetro', dataType: 'lov', allowedValues: [{ value: 'M8' }] }] }] }
    })

    const rows = await listRequests(db, { workflowId: 2, closedSinceDays: 90 })

    expect(rows.map((r) => [r.id, r.assigned_to_name, r.pdm_name])).toEqual([
      [10, 'Ana', 'PARAFUSO'],
      [11, null, 'PARAFUSO'],
      [12, null, 'PORCA'],
    ])
    expect(rows[0].pdm_attributes).toEqual({
      d: { label: 'Diâmetro', type: 'select', options: ['M8'], includeInDescription: undefined, abbreviation: undefined, allowedValues: [{ value: 'M8' }] },
    })
    expect(rows[2].pdm_attributes).toEqual({})
    expect(rows[0].request_type).toBe('cadastro')

    const main = calls.find((c) => c.table === 'material_requests')!
    expect(main.ops.find(([op]) => op === 'select')?.[1][0]).toContain('assignee:users!assigned_to_id(name)')
    expect(main.ops).toContainEqual(['eq', ['workflow_id', 2]])
    expect(main.ops.some(([op, args]) => op === 'or' && String(args[0]).startsWith('is_closed.eq.false,stage_entered_at.gte.'))).toBe(true)
    const pdmCall = calls.find((c) => c.table === 'pdm_templates')!
    expect(pdmCall.ops).toContainEqual(['in', ['id', [5, 6]]])
    expect(calls).toHaveLength(2)
  })

  it('pagina além de 1000 linhas', async () => {
    const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: from + i, pdm_templates: null }))
    let served = 0
    const { db } = fakeDb((call) => {
      if (call.table !== 'material_requests') return { data: [] }
      const data = served === 0 ? page(0, 1000) : page(1000, 3)
      served += 1
      return { data }
    })
    const rows = await listRequests(db)
    expect(rows).toHaveLength(1003)
  })
})

describe('requestsFinishedAt', () => {
  it('fica com a última aprovação final de cada solicitação, em lotes de 200 em paralelo', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => i + 1)
    const { db, calls } = fakeDb(() => ({
      data: [
        { request_id: 1, created_at: '2026-01-01T00:00:00Z' },
        { request_id: 1, created_at: '2026-02-01T00:00:00Z' },
      ],
    }))
    const out = await requestsFinishedAt(db, ids)
    expect(out['1']).toBe('2026-02-01T00:00:00Z')
    expect(calls).toHaveLength(2)
  })

  it('sem ids, nenhuma consulta', async () => {
    const { db, calls } = fakeDb(() => ({ data: [] }))
    expect(await requestsFinishedAt(db, [])).toEqual({})
    expect(calls).toHaveLength(0)
  })
})
