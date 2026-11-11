import { describe, expect, it } from 'vitest'
import { progressPercent, stageProgress } from './stage-progress'

const steps = [
  { status_key: 'cadastro', step_name: 'Cadastro', order: 1, is_active: true },
  { status_key: 'compras', step_name: 'Compras', order: 2, is_active: true },
  { status_key: 'qualidade', step_name: 'Qualidade', order: 3, is_active: false },
  { status_key: 'mrp', step_name: 'MRP', order: 4, is_active: true },
  { status_key: 'finalizado', step_name: 'Finalizado', order: 5, is_active: true },
]

describe('andamento pelas etapas do workflow', () => {
  it('usa as etapas ativas, na ordem, sem a etapa final', () => {
    expect(stageProgress(steps, 'cadastro').map((s) => s.label)).toEqual(['Cadastro', 'Compras', 'MRP'])
  })

  it('antes da atual concluída, a atual em andamento, as seguintes pendentes', () => {
    const items = stageProgress(steps, 'Compras')
    expect(items.map((s) => s.state)).toEqual(['done', 'current', 'pending'])
    expect(progressPercent(items)).toBe(50)
  })

  it('finalizada conclui tudo; rejeitada e cancelada interrompem', () => {
    expect(stageProgress(steps, 'finalizado').every((s) => s.state === 'done')).toBe(true)
    expect(progressPercent(stageProgress(steps, 'finalizado'))).toBe(100)
    expect(stageProgress(steps, 'Rejected').every((s) => s.state === 'stopped')).toBe(true)
    expect(stageProgress(steps, 'cancelado').every((s) => s.state === 'stopped')).toBe(true)
  })

  it('status fora do workflow deixa tudo pendente; sem etapas, nada', () => {
    expect(stageProgress(steps, 'pending').every((s) => s.state === 'pending')).toBe(true)
    expect(progressPercent([])).toBe(0)
  })
})
