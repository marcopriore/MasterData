/**
 * Situação de uma solicitação pelo status gravado. Único lugar com estas listas: o banco usa a mesma
 * regra em public.is_closed_status() (migration 036).
 */
export const DONE_STATUSES = ['finalizado', 'completed', 'concluido', 'concluído', 'approved']
export const REJECTED_STATUSES = ['rejected', 'rejeitado']
export const CANCELLED_STATUSES = ['cancelado', 'cancelled']

export type StatusGroup = 'done' | 'rejected' | 'cancelled' | 'open'

export function statusGroup(status: string | null | undefined): StatusGroup {
  const s = (status ?? '').trim().toLowerCase()
  if (DONE_STATUSES.includes(s)) return 'done'
  if (REJECTED_STATUSES.includes(s)) return 'rejected'
  if (CANCELLED_STATUSES.includes(s)) return 'cancelled'
  return 'open'
}

export const isDoneStatus = (status: string | null | undefined) => statusGroup(status) === 'done'
export const isRejectedStatus = (status: string | null | undefined) => statusGroup(status) === 'rejected'
export const isCancelledStatus = (status: string | null | undefined) => statusGroup(status) === 'cancelled'
/** Fora do fluxo: finalizada, rejeitada ou cancelada. */
export const isClosedStatus = (status: string | null | undefined) => statusGroup(status) !== 'open'
