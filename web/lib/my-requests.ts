/** Lista "Minhas Solicitações": situação, busca, filtro e paginação, sem banco. */
import { REJECTED_STATUSES, statusGroup } from '@/lib/request-status'

export { isRejectedStatus } from '@/lib/request-status'

export type MyRequestRow = {
  id: number
  code: string
  pdm_name: string
  pdm_code: string
  description: string
  status: string
  step_label: string
  urgency: 'low' | 'medium' | 'high'
  created_at: string | null
  assigned_to_name: string | null
  rejection_reason: string | null
  /** Ainda na primeira etapa e sem atendente: o próprio solicitante pode cancelar (cancel_request). */
  can_cancel: boolean
}

export type MyRequestSituation = 'andamento' | 'finalizada' | 'rejeitada' | 'cancelada'

export type MyRequestsState = {
  q: string
  situacao: 'todas' | MyRequestSituation
  /** status_key da etapa, vindo do gráfico da tela inicial */
  etapa: string | null
  pagina: number
}

export const MY_REQUESTS_PAGE_SIZE = 20

export const DEFAULT_MY_REQUESTS: MyRequestsState = { q: '', situacao: 'todas', etapa: null, pagina: 1 }

const SITUATION = { open: 'andamento', done: 'finalizada', rejected: 'rejeitada', cancelled: 'cancelada' } as const

export function situationOf(status: string | null | undefined): MyRequestSituation {
  return SITUATION[statusGroup(status)]
}

export function countBySituation(rows: MyRequestRow[]): Record<MyRequestSituation, number> {
  const out: Record<MyRequestSituation, number> = { andamento: 0, finalizada: 0, rejeitada: 0, cancelada: 0 }
  for (const row of rows) out[situationOf(row.status)] += 1
  return out
}

/** Linhas que passam na busca e nos filtros, sem paginar (a exportação leva todas). */
export function filterMyRequests(rows: MyRequestRow[], state: MyRequestsState): MyRequestRow[] {
  const q = state.q.trim().toLowerCase()
  const etapa = state.etapa?.trim().toLowerCase() || null
  return rows.filter((row) => {
    if (state.situacao !== 'todas' && situationOf(row.status) !== state.situacao) return false
    if (etapa) {
      const wanted = REJECTED_STATUSES.includes(etapa) ? REJECTED_STATUSES : [etapa]
      if (!wanted.includes(row.status.trim().toLowerCase())) return false
    }
    if (!q) return true
    return [row.code, row.pdm_name, row.pdm_code, row.description].some((text) => text.toLowerCase().includes(q))
  })
}

export function applyMyRequests(rows: MyRequestRow[], state: MyRequestsState) {
  const filtered = filterMyRequests(rows, state)
  const pages = Math.max(1, Math.ceil(filtered.length / MY_REQUESTS_PAGE_SIZE))
  const page = Math.min(Math.max(1, state.pagina), pages)
  const start = (page - 1) * MY_REQUESTS_PAGE_SIZE
  return { rows: filtered.slice(start, start + MY_REQUESTS_PAGE_SIZE), total: filtered.length, page, pages }
}
