import { describe, expect, it } from 'vitest'
import { classifyErpSyncAction, summarizeErpSyncPlans } from './sync-action'

describe('classifyErpSyncAction', () => {
  it('Ativo sem id_erp → criar', () => {
    expect(classifyErpSyncAction({ status: 'Ativo', id_erp: null, erp_status: 'pendente_erp' })).toEqual({
      action: 'criar',
    })
  })

  it('Ativo com id_erp → alterar', () => {
    expect(classifyErpSyncAction({ status: 'Ativo', id_erp: '91', erp_status: 'erro_erp' })).toEqual({
      action: 'alterar',
    })
  })

  it('Obsoleto com id_erp e pendente → eliminar', () => {
    expect(classifyErpSyncAction({ status: 'Obsoleto', id_erp: '91', erp_status: 'pendente_erp' })).toEqual({
      action: 'eliminar',
    })
  })

  it('Obsoleto sem id_erp → skip local', () => {
    const plan = classifyErpSyncAction({ status: 'Obsoleto', id_erp: null, erp_status: 'pendente_erp' })
    expect(plan.action).toBe('skip')
  })

  it('Bloqueado nunca elimina', () => {
    const plan = classifyErpSyncAction({ status: 'Bloqueado', id_erp: '91', erp_status: 'pendente_erp' })
    expect(plan.action).toBe('skip')
    if (plan.action === 'skip') expect(plan.reason.toLowerCase()).toContain('bloqueado')
  })

  it('integrando → skip', () => {
    expect(classifyErpSyncAction({ status: 'Ativo', id_erp: '91', erp_status: 'integrando' }).action).toBe('skip')
  })

  it('já integrado → skip', () => {
    expect(classifyErpSyncAction({ status: 'Ativo', id_erp: '91', erp_status: 'integrado_erp' }).action).toBe('skip')
  })
})

describe('summarizeErpSyncPlans', () => {
  it('conta por ação', () => {
    expect(
      summarizeErpSyncPlans([
        { action: 'criar' },
        { action: 'alterar' },
        { action: 'eliminar' },
        { action: 'eliminar' },
        { action: 'skip', reason: 'x' },
      ])
    ).toEqual({ criar: 1, alterar: 1, eliminar: 2, skip: 1 })
  })
})
