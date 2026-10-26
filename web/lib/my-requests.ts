/** Lista "Minhas Solicitações": situação, busca, filtro e paginação, sem banco. */

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
}

export type MyRequestSituation = 'andamento' | 'finalizada' | 'rejeitada'

export type MyRequestsState = {
  q: string
  situacao: 'todas' | MyRequestSituation
  /** status_key da etapa, vindo do gráfico da tela inicial */
  etapa: string | null
  pagina: number
}

export const MY_REQUESTS_PAGE_SIZE = 20

export const DEFAULT_MY_REQUESTS: MyRequestsState = { q: '', situacao: 'todas', etapa: null, pagina: 1 }

const FINAL = ['finalizado', 'completed', 'concluído', 'concluido', 'approved']
const REJECTED = ['rejected', 'rejeitado']

export function isRejectedStatus(status: string | null | undefined): boolean {
  return REJECTED.includes((status ?? '').trim().toLowerCase())
}

export function situationOf(status: string | null | undefined): MyRequestSituation {
  const s = (status ?? '').trim().toLowerCase()
  if (REJECTED.includes(s)) return 'rejeitada'
  if (FINAL.includes(s)) return 'finalizada'
  return 'andamento'
}

export function countBySituation(rows: MyRequestRow[]): Record<MyRequestSituation, number> {
  const out: Record<MyRequestSituation, number> = { andamento: 0, finalizada: 0, rejeitada: 0 }
  for (const row of rows) out[situationOf(row.status)] += 1
  return out
}

export function applyMyRequests(rows: MyRequestRow[], state: MyRequestsState) {
  const q = state.q.trim().toLowerCase()
  const etapa = state.etapa?.trim().toLowerCase() || null
  const filtered = rows.filter((row) => {
    if (state.situacao !== 'todas' && situationOf(row.status) !== state.situacao) return false
    if (etapa) {
      const wanted = REJECTED.includes(etapa) ? REJECTED : [etapa]
      if (!wanted.includes(row.status.trim().toLowerCase())) return false
    }
    if (!q) return true
    return [row.code, row.pdm_name, row.pdm_code, row.description].some((text) => text.toLowerCase().includes(q))
  })
  const pages = Math.max(1, Math.ceil(filtered.length / MY_REQUESTS_PAGE_SIZE))
  const page = Math.min(Math.max(1, state.pagina), pages)
  const start = (page - 1) * MY_REQUESTS_PAGE_SIZE
  return { rows: filtered.slice(start, start + MY_REQUESTS_PAGE_SIZE), total: filtered.length, page, pages }
}
