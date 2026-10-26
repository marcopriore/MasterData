import { describe, expect, it } from 'vitest'
import { kanbanMoveBlock } from './kanban-move'

describe('kanbanMoveBlock', () => {
  it('etapa intermediária pode ser arrastada', () => {
    expect(kanbanMoveBlock('cadastro', 'compras', 'finalizado')).toBeNull()
    expect(kanbanMoveBlock('mrp', 'cadastro', 'finalizado')).toBeNull()
  })

  it('não finaliza pelo arraste', () => {
    expect(kanbanMoveBlock('contabilidade', 'finalizado', 'finalizado')).toMatch(/Aprovar/)
    expect(kanbanMoveBlock('contabilidade', 'completed', 'finalizado')).toMatch(/Aprovar/)
  })

  it('última etapa com nome próprio também conta como final', () => {
    expect(kanbanMoveBlock('fiscal', 'encerrado', 'encerrado')).toMatch(/Aprovar/)
  })

  it('não rejeita pelo arraste', () => {
    expect(kanbanMoveBlock('compras', 'rejeitado', 'finalizado')).toMatch(/justificativa/)
  })

  it('finalizada ou rejeitada não volta pelo arraste', () => {
    expect(kanbanMoveBlock('finalizado', 'cadastro', 'finalizado')).toMatch(/não volta/)
    expect(kanbanMoveBlock('rejeitado', 'cadastro', 'finalizado')).toMatch(/não volta/)
  })

  it('não diferencia maiúsculas', () => {
    expect(kanbanMoveBlock('Cadastro', 'FINALIZADO', 'finalizado')).not.toBeNull()
  })
})
