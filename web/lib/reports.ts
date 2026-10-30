/** Relatórios: tipos das consultas do banco (migration 029), agrupamentos e linhas de planilha. Sem banco. */

export type FlowRow = {
  stage: string
  entered: number
  avg_hours: number | null
  max_hours: number | null
  current_open: number
}

export type ProductivityRow = {
  user_id: string
  user_name: string
  role_name: string | null
  attended: number
  approved: number
  rejected: number
  moved: number
  avg_decision_hours: number | null
}

export type MaterialBaseRow = {
  pdm_code: string
  pdm_name: string
  total: number
  ativos: number
  bloqueados: number
  obsoletos: number
  pendente_erp: number
  integrados: number
  erro_erp: number
  duplicados: number
}

/** report_rejections (migration 036): rejeições no período por etapa e motivo. */
export type RejectionRow = {
  stage: string
  reason: string
  total: number
}

export type RejectionGroup = { key: string; total: number }

/** Totais por etapa e por motivo, do maior para o menor. */
export function rejectionsBy(rows: RejectionRow[], field: 'stage' | 'reason'): RejectionGroup[] {
  const totals = new Map<string, number>()
  for (const row of rows) totals.set(row[field], (totals.get(row[field]) ?? 0) + row.total)
  return [...totals.entries()].map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total)
}

export type AreaRow = {
  area: string
  people: number
  attended: number
  approved: number
  rejected: number
  avg_decision_hours: number | null
}

/** O RPC devolve bigint e numeric como texto; tudo vira número aqui. */
export function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Últimos 30 dias, em AAAA-MM-DD (formato do input type="date"). */
export function defaultPeriod(today = new Date()): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const start = new Date(today)
  start.setDate(start.getDate() - 30)
  return { from: fmt(start), to: fmt(today) }
}

/** Intervalo do banco: do início do dia "de" até o fim do dia "até", no fuso do navegador. */
export function periodToRange(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

/** Horas em texto curto: "3,5 h" até 48 h, depois "2,1 dias". */
export function formatHours(hours: number | null): string {
  if (hours == null) return '—'
  if (hours < 48) return `${hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
  return `${(hours / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`
}

/** Produtividade por área (papel de etapa). Média ponderada pelas decisões de cada pessoa. */
export function productivityByArea(rows: ProductivityRow[]): AreaRow[] {
  const byArea = new Map<string, AreaRow & { weighted: number; decisions: number }>()
  for (const row of rows) {
    const area = row.role_name?.trim() || 'Sem área'
    const current = byArea.get(area) ?? { area, people: 0, attended: 0, approved: 0, rejected: 0, avg_decision_hours: null, weighted: 0, decisions: 0 }
    current.people += 1
    current.attended += row.attended
    current.approved += row.approved
    current.rejected += row.rejected
    const decisions = row.approved + row.rejected
    if (row.avg_decision_hours != null && decisions > 0) {
      current.weighted += row.avg_decision_hours * decisions
      current.decisions += decisions
    }
    byArea.set(area, current)
  }
  return [...byArea.values()]
    .map(({ weighted, decisions, ...area }) => ({
      ...area,
      avg_decision_hours: decisions > 0 ? Math.round((weighted / decisions) * 10) / 10 : null,
    }))
    .sort((a, b) => b.approved + b.rejected - (a.approved + a.rejected))
}

export function totalsOfBase(rows: MaterialBaseRow[]): Omit<MaterialBaseRow, 'pdm_code' | 'pdm_name'> {
  const keys = ['total', 'ativos', 'bloqueados', 'obsoletos', 'pendente_erp', 'integrados', 'erro_erp', 'duplicados'] as const
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Omit<MaterialBaseRow, 'pdm_code' | 'pdm_name'>
  for (const row of rows) for (const k of keys) out[k] += row[k]
  return out
}
