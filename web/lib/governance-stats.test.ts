import { describe, expect, it } from 'vitest'
import { governanceIndicators, statusGroup } from './governance-stats'

const NOW = Date.parse('2026-10-26T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

describe('indicadores da governança', () => {
  it('agrupa os status, inclusive Rejected gravado pela rejeição', () => {
    expect(statusGroup('Rejected')).toBe('rejected')
    expect(statusGroup('finalizado')).toBe('done')
    expect(statusGroup('compras')).toBe('open')
  })

  it('em andamento, atrasadas, taxa de rejeição sobre as decididas e ciclo médio', () => {
    const stats = governanceIndicators(
      [
        { id: 1, status: 'cadastro', createdAt: daysAgo(1) },
        { id: 2, status: 'compras', createdAt: daysAgo(10) },
        { id: 3, status: 'finalizado', createdAt: daysAgo(8) },
        { id: 4, status: 'finalizado', createdAt: daysAgo(6) },
        { id: 5, status: 'Rejected', createdAt: daysAgo(3) },
        { id: 6, status: 'cancelado', createdAt: daysAgo(2) },
      ],
      { 3: daysAgo(4), 4: daysAgo(4) },
      NOW
    )
    expect(stats).toEqual({
      total: 6,
      em_andamento: 2,
      atrasadas: 1,
      finalizadas: 2,
      rejeitadas: 1,
      canceladas: 1,
      taxa_rejeicao: 33.3,
      tempo_medio_ciclo: 3,
      idade_media_andamento: 5.5,
    })
  })

  it('atrasada pelo prazo da etapa, contado de quando entrou nela', () => {
    const stats = governanceIndicators(
      [
        // aberta há 20 dias, mas entrou em Compras há 1: dentro do prazo de 2 dias
        { id: 1, status: 'compras', createdAt: daysAgo(20), stageEnteredAt: daysAgo(1) },
        // em Fiscal há 4 dias, prazo 3: atrasada
        { id: 2, status: 'fiscal', createdAt: daysAgo(6), stageEnteredAt: daysAgo(4) },
        // MRP sem prazo configurado: vale o padrão de 5 dias
        { id: 3, status: 'mrp', createdAt: daysAgo(4), stageEnteredAt: daysAgo(4) },
      ],
      {},
      NOW,
      { compras: 2, fiscal: 3, mrp: null }
    )
    expect(stats.atrasadas).toBe(1)
  })

  it('sem decisão nem finalizada com data: taxa 0 e ciclo sem valor', () => {
    const stats = governanceIndicators([{ id: 1, status: 'mrp', createdAt: daysAgo(2) }], {}, NOW)
    expect(stats.taxa_rejeicao).toBe(0)
    expect(stats.tempo_medio_ciclo).toBeNull()
    expect(stats.idade_media_andamento).toBe(2)
  })
})
