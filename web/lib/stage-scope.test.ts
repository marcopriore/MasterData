import { describe, expect, it } from 'vitest'
import { requestsInStageScope, seesAllStages, stageScope } from './stage-scope'

const columns = ['cadastro', 'compras', 'mrp', 'fiscal', 'contabilidade']
const requests = [
  { id: 1, status: 'cadastro' },
  { id: 2, status: 'compras' },
  { id: 3, status: 'contabilidade' },
  { id: 4, status: 'contabilidade' },
  { id: 5, status: 'completed' },
  { id: 6, status: 'Rejected' },
  { id: 7, status: 'cancelado' },
  { id: 8, status: 'etapa_antiga' },
]
const ids = (list: Array<{ id: number }>) => list.map((r) => r.id)

describe('Governança: o que cada usuário vê', () => {
  it('usuário de etapa vê só a coluna dele, como no kanban', () => {
    const scope = stageScope('CONTABILIDADE', false)
    // Finalizada fica na última coluna do kanban (aqui, Contabilidade).
    expect(ids(requestsInStageScope(requests, columns, scope))).toEqual([3, 4, 5])
    expect(ids(requestsInStageScope(requests, columns, stageScope('compras', false)))).toEqual([2])
  })

  it('status fora do workflow cai na primeira coluna', () => {
    expect(ids(requestsInStageScope(requests, columns, stageScope('CADASTRO', false)))).toEqual([1, 8])
  })

  it('etapa que não existe no workflow não vê nada', () => {
    expect(requestsInStageScope(requests, ['cadastro', 'compras'], stageScope('MRP', false))).toEqual([])
  })

  it('ADMIN, Master, sistema e papel sem etapa veem tudo', () => {
    expect(seesAllStages({ canManageAllStages: false, roleName: 'ADMIN', roleType: 'operacional' })).toBe(true)
    expect(seesAllStages({ canManageAllStages: true, roleName: 'MRP', roleType: 'operacional' })).toBe(true)
    expect(seesAllStages({ canManageAllStages: false, roleName: 'X', roleType: 'sistema' })).toBe(true)
    expect(seesAllStages({ canManageAllStages: false, roleName: 'MRP', roleType: 'operacional' })).toBe(false)
    expect(stageScope('GESTOR', false)).toBeNull()
    expect(requestsInStageScope(requests, columns, stageScope('MRP', true))).toHaveLength(requests.length)
  })
})
