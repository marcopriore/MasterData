/** Indicadores da governança, calculados sobre as solicitações que a tela mostra (workflow e filtros). */
import { statusGroup } from '@/lib/request-status'

export { CANCELLED_STATUSES, DONE_STATUSES, REJECTED_STATUSES, statusGroup } from '@/lib/request-status'

/** Prazo usado na etapa que não tem prazo configurado no workflow (workflow_config.sla_days). */
export const DEFAULT_STAGE_SLA_DAYS = 5

const DAY_MS = 24 * 60 * 60 * 1000

export type StatsInput = {
  id: number | string
  status: string | null
  createdAt: string | null
  /** Quando entrou na etapa atual (material_requests.stage_entered_at); sem ele, a abertura. */
  stageEnteredAt?: string | null
}

export type GovernanceIndicators = {
  total: number
  em_andamento: number
  atrasadas: number
  finalizadas: number
  rejeitadas: number
  canceladas: number
  /** Rejeitadas sobre as decididas (finalizadas + rejeitadas), em %. Cancelada não é decisão. */
  taxa_rejeicao: number
  /** Média em dias da abertura até a aprovação final; null sem finalizada com data. */
  tempo_medio_ciclo: number | null
  /** Média em dias desde a abertura das que estão em andamento; null sem nenhuma em andamento. */
  idade_media_andamento: number | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * slaByStage: prazo em dias de cada etapa (status_key em minúsculas). Atrasada = em andamento e parada
 * na etapa atual além do prazo dela (DEFAULT_STAGE_SLA_DAYS quando a etapa não tem prazo).
 */
export function governanceIndicators(
  items: StatsInput[],
  finishedAt: Record<string, string>,
  now: number = Date.now(),
  slaByStage: Record<string, number | null> = {}
): GovernanceIndicators {
  let open = 0
  let late = 0
  let done = 0
  let rejected = 0
  let cancelled = 0
  const cycles: number[] = []
  const ages: number[] = []

  for (const item of items) {
    const group = statusGroup(item.status)
    const created = item.createdAt ? Date.parse(item.createdAt) : NaN
    if (group === 'open') {
      open++
      if (Number.isFinite(created)) ages.push((now - created) / DAY_MS)
      const entered = item.stageEnteredAt ? Date.parse(item.stageEnteredAt) : created
      const sla = slaByStage[(item.status ?? '').trim().toLowerCase()] ?? DEFAULT_STAGE_SLA_DAYS
      if (Number.isFinite(entered) && now - entered > sla * DAY_MS) late++
    } else if (group === 'done') {
      done++
      const finished = finishedAt[String(item.id)] ? Date.parse(finishedAt[String(item.id)]) : NaN
      if (Number.isFinite(created) && Number.isFinite(finished) && finished >= created) {
        cycles.push((finished - created) / DAY_MS)
      }
    } else if (group === 'rejected') {
      rejected++
    } else {
      cancelled++
    }
  }

  const decided = done + rejected
  const average = (values: number[]) => (values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null)
  return {
    total: items.length,
    em_andamento: open,
    atrasadas: late,
    finalizadas: done,
    rejeitadas: rejected,
    canceladas: cancelled,
    taxa_rejeicao: decided ? round1((rejected / decided) * 100) : 0,
    tempo_medio_ciclo: average(cycles),
    idade_media_andamento: average(ages),
  }
}
