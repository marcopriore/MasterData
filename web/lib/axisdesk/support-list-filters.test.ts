import { describe, expect, it } from 'vitest'
import {
  applySupportListFilters,
  buildSupportListSearchParams,
  parseSupportListFilters,
  SUPPORT_LIST_DEFAULT_FILTERS,
} from './support-list-filters'
import type { AxisDeskChamado } from './types'

const ticket = (id: string, extra: Partial<AxisDeskChamado> = {}): AxisDeskChamado => ({
  id,
  tenant_id_externo: '2',
  tipo: 'incidente',
  titulo: `Chamado ${id}`,
  descricao: '',
  status: 'aberto',
  prioridade: 'media',
  created_at: '2026-10-20T12:00:00Z',
  solicitante: { id_externo: 'u1', nome: 'Ana', email: 'ana@empresa.com' },
  ...extra,
})

describe('filtros da lista de suporte', () => {
  it('ida e volta pela URL', () => {
    const filters = { ...SUPPORT_LIST_DEFAULT_FILTERS, q: 'erro', status: ['aberto', 'concluido'], viewAll: true, page: 3 }
    expect(parseSupportListFilters(buildSupportListSearchParams(filters))).toEqual(filters)
  })

  it('sem "visualizar todos", mostra só os do usuário', () => {
    const tickets = [ticket('1'), ticket('2', { solicitante: { id_externo: 'u2', nome: 'Bia', email: 'bia@empresa.com' } })]
    const mine = applySupportListFilters(tickets, SUPPORT_LIST_DEFAULT_FILTERS, { userId: 'u1' })
    expect(mine.map((t) => t.id)).toEqual(['1'])
    const all = applySupportListFilters(tickets, { ...SUPPORT_LIST_DEFAULT_FILTERS, viewAll: true }, { userId: 'u1' })
    expect(all).toHaveLength(2)
  })

  it('reconhece o usuário pelo e-mail quando o id não bate', () => {
    const tickets = [ticket('1', { solicitante: { nome: 'Ana', email: 'ANA@empresa.com' } })]
    expect(applySupportListFilters(tickets, SUPPORT_LIST_DEFAULT_FILTERS, { email: 'ana@empresa.com' })).toHaveLength(1)
  })

  it('status em seleção múltipla', () => {
    const tickets = [ticket('1'), ticket('2', { status: 'concluido' }), ticket('3', { status: 'cancelado' })]
    const filtered = applySupportListFilters(tickets, { ...SUPPORT_LIST_DEFAULT_FILTERS, viewAll: true, status: ['aberto', 'concluido'] })
    expect(filtered.map((t) => t.id)).toEqual(['1', '2'])
  })

  it('período de criação', () => {
    const tickets = [ticket('1'), ticket('2', { created_at: '2026-09-01T12:00:00Z' })]
    const filtered = applySupportListFilters(tickets, { ...SUPPORT_LIST_DEFAULT_FILTERS, viewAll: true, criadoDe: '2026-10-01' })
    expect(filtered.map((t) => t.id)).toEqual(['1'])
  })
})
