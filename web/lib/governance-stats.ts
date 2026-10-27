/** Indicadores da governança, calculados sobre as solicitações que a tela mostra (workflow e filtros). */

export const DONE_STATUSES = ['finalizado', 'completed', 'concluido', 'concluído', 'approved']
export const REJECTED_STATUSES = ['rejected', 'rejeitado']
/** Em andamento há mais que isso desde a abertura conta como atrasada. */
export const LATE_AFTER_DAYS = 5

const DAY_MS = 24 * 60 * 60 * 1000

export type StatsInput = { id: number | string; status: string | null; createdAt: string | null }

export type GovernanceIndicators = {
  total: number
  em_andamento: number
  atrasadas: number
  finalizadas: number
  rejeitadas: number
  /** Rejeitadas sobre as decididas (finalizadas + rejeitadas), em %. */
  taxa_rejeicao: number
  /** Média em dias da abertura até a aprovação final; null sem finalizada com data. */
  tempo_medio_ciclo: number | null
  /** Média em dias desde a abertura das que estão em andamento; null sem nenhuma em andamento. */
  idade_media_andamento: number | null
}

export function statusGroup(status: string | null | undefined): 'done' | 'rejected' | 'open' {
  const s = (status ?? '').trim().toLowerCase()
  if (DONE_STATUSES.includes(s)) return 'done'
  if (REJECTED_STATUSES.includes(s)) return 'rejected'
  return 'open'
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function governanceIndicators(
  items: StatsInput[],
  finishedAt: Record<string, string>,
  now: number = Date.now()
): GovernanceIndicators {
  let open = 0
  let late = 0
  let done = 0
  let rejected = 0
  const cycles: number[] = []
  const ages: number[] = []

  for (const item of items) {
    const group = statusGroup(item.status)
    const created = item.createdAt ? Date.parse(item.createdAt) : NaN
    if (group === 'open') {
      open++
      if (Number.isFinite(created)) {
        ages.push((now - created) / DAY_MS)
        if (now - created > LATE_AFTER_DAYS * DAY_MS) late++
      }
    } else if (group === 'done') {
      done++
      const finished = finishedAt[String(item.id)] ? Date.parse(finishedAt[String(item.id)]) : NaN
      if (Number.isFinite(created) && Number.isFinite(finished) && finished >= created) {
        cycles.push((finished - created) / DAY_MS)
      }
    } else {
      rejected++
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
    taxa_rejeicao: decided ? round1((rejected / decided) * 100) : 0,
    tempo_medio_ciclo: average(cycles),
    idade_media_andamento: average(ages),
  }
}
