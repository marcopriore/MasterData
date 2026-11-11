/** Aba "Atendidas" de Minhas Solicitações: o que o usuário fez em cada solicitação, sem banco. */
import { statusGroup } from '@/lib/request-status'

export type AttendedEventType = 'assigned' | 'approved' | 'rejected' | 'stage_change'

export const ATTENDED_EVENT_TYPES: AttendedEventType[] = ['assigned', 'approved', 'rejected', 'stage_change']

export type AttendedEvent = {
  request_id: number
  event_type: AttendedEventType
  created_at: string
}

export type AttendedAction = 'rejeitei' | 'aprovei' | 'movi' | 'iniciei'

export const ATTENDED_ACTION_LABEL: Record<AttendedAction, string> = {
  aprovei: 'Aprovei',
  rejeitei: 'Rejeitei',
  movi: 'Movi de etapa',
  iniciei: 'Só iniciei',
}

const ACTION_OF: Record<AttendedEventType, AttendedAction> = {
  approved: 'aprovei',
  rejected: 'rejeitei',
  stage_change: 'movi',
  assigned: 'iniciei',
}

export type AttendedRequestInfo = {
  id: number
  pdm_name: string
  description: string
  status: string
  step_label: string
}

export type AttendedRow = AttendedRequestInfo & {
  code: string
  /** Última decisão da pessoa (aprovar, rejeitar, mover); sem decisão, "iniciei". */
  my_action: AttendedAction
  my_last_at: string
  my_events: number
}

/**
 * Uma linha por solicitação em que a pessoa agiu, da ação mais recente para a mais antiga.
 * Solicitação que a RLS não devolveu (outro tenant, apagada) fica de fora.
 */
export function summarizeAttended(events: AttendedEvent[], requests: Map<number, AttendedRequestInfo>): AttendedRow[] {
  const byRequest = new Map<number, AttendedEvent[]>()
  for (const event of events) {
    byRequest.set(event.request_id, [...(byRequest.get(event.request_id) ?? []), event])
  }
  const rows: AttendedRow[] = []
  for (const [id, list] of byRequest) {
    const info = requests.get(id)
    if (!info) continue
    const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
    const decision = sorted.find((e) => e.event_type !== 'assigned')
    rows.push({
      ...info,
      code: `REQ-${String(id).padStart(4, '0')}`,
      my_action: ACTION_OF[(decision ?? sorted[0]).event_type],
      my_last_at: sorted[0].created_at,
      my_events: sorted.length,
    })
  }
  return rows.sort((a, b) => b.my_last_at.localeCompare(a.my_last_at))
}

export type AttendedState = {
  q: string
  acao: 'todas' | AttendedAction
  pagina: number
}

export const DEFAULT_ATTENDED: AttendedState = { q: '', acao: 'todas', pagina: 1 }

export const ATTENDED_PAGE_SIZE = 20

export function countByAction(rows: AttendedRow[]): Record<AttendedAction, number> {
  const out: Record<AttendedAction, number> = { aprovei: 0, rejeitei: 0, movi: 0, iniciei: 0 }
  for (const row of rows) out[row.my_action] += 1
  return out
}

export function filterAttended(rows: AttendedRow[], state: AttendedState): AttendedRow[] {
  const q = state.q.trim().toLowerCase()
  return rows.filter((row) => {
    if (state.acao !== 'todas' && row.my_action !== state.acao) return false
    if (!q) return true
    return [row.code, row.pdm_name, row.description].some((text) => text.toLowerCase().includes(q))
  })
}

export function applyAttended(rows: AttendedRow[], state: AttendedState) {
  const filtered = filterAttended(rows, state)
  const pages = Math.max(1, Math.ceil(filtered.length / ATTENDED_PAGE_SIZE))
  const page = Math.min(Math.max(1, state.pagina), pages)
  const start = (page - 1) * ATTENDED_PAGE_SIZE
  return { rows: filtered.slice(start, start + ATTENDED_PAGE_SIZE), total: filtered.length, page, pages }
}

/** Situação atual da solicitação, para o selo da lista. */
export function attendedSituation(status: string): 'andamento' | 'finalizada' | 'rejeitada' | 'cancelada' {
  const group = statusGroup(status)
  return group === 'done' ? 'finalizada' : group === 'rejected' ? 'rejeitada' : group === 'cancelled' ? 'cancelada' : 'andamento'
}
