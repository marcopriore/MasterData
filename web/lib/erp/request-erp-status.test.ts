import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  ops: [] as Array<[string, unknown[]]>,
  checked: [] as Array<{ id: number }>,
}))

vi.mock('@/lib/supabase/admin', () => {
  const builder: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'in']) {
    builder[op] = (...args: unknown[]) => {
      state.ops.push([op, args])
      return builder
    }
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: state.rows, error: null }).then(resolve)
  return { supabaseAdmin: { from: () => builder } }
})

vi.mock('@/lib/erp/duplicate-guard', () => ({
  findDuplicateBlocks: async (_tenant: number, materials: Array<{ id: number }>) => {
    state.checked = materials
    return new Map(materials.map((m) => [m.id, m.id === 7 ? { codes: ['MAT-9'], reason: 'x' } : null]))
  },
}))

import { loadRequestErpInfo } from './request-erp-status'

const material = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  tenant_id: 2,
  id_sistema: `MAT-${id}`,
  id_erp: null,
  status: 'Ativo',
  erp_status: 'pendente_erp',
  erp_error_message: null,
  ...over,
})

beforeEach(() => {
  state.rows = []
  state.ops = []
  state.checked = []
})

describe('loadRequestErpInfo', () => {
  it('uma consulta: material da solicitação, ou o de origem quando é alteração', async () => {
    state.rows = [
      { id: 100, born: [material(7)], target: null },
      { id: 101, born: [], target: material(8, { erp_status: 'integrado' }) },
      { id: 102, born: [], target: null },
    ]
    const items = await loadRequestErpInfo(2, [100, 101, 102, 103])

    expect(items.map((i) => [i.request_id, i.material?.id ?? null, i.duplicate_codes])).toEqual([
      [100, 7, ['MAT-9']],
      [101, 8, []],
      [102, null, []],
      [103, null, []],
    ])
    expect(state.ops).toContainEqual(['eq', ['tenant_id', 2]])
    expect(String(state.ops.find(([op]) => op === 'select')?.[1][0])).toContain('target:material_database!target_material_id(')
  })

  it('a trava só olha material pendente ou com erro no ERP e não obsoleto, cada um uma vez', async () => {
    state.rows = [
      { id: 1, born: [material(7)], target: null },
      { id: 2, born: [], target: material(7) },
      { id: 3, born: [material(8, { erp_status: 'erro_erp', status: 'Obsoleto' })], target: null },
      { id: 4, born: [material(9, { erp_status: 'integrado' })], target: null },
    ]
    await loadRequestErpInfo(2, [1, 2, 3, 4])
    expect(state.checked.map((m) => m.id)).toEqual([7])
  })

  it('material de outro tenant não aparece', async () => {
    state.rows = [{ id: 1, born: [material(7, { tenant_id: 3 })], target: null }]
    const [item] = await loadRequestErpInfo(2, [1])
    expect(item.material).toBeNull()
  })

  it('sem ids, nenhuma consulta', async () => {
    expect(await loadRequestErpInfo(2, [])).toEqual([])
    expect(state.ops).toHaveLength(0)
  })
})
