/** Histórico do material (migration 042) + solicitação de origem, como a tela mostra. Sem banco. */

export type MaterialHistoryRow = {
  id: number
  event_type: 'created' | 'status' | 'erp' | 'edited' | string
  event_data: Record<string, unknown> | null
  user_name: string | null
  created_at: string
}

export type RequestEventLite = {
  id: number
  event_type: string
  message: string
  stage?: string | null
  user_name?: string | null
  created_at: string | null
}

export type TimelineTone = 'ok' | 'alert' | 'info' | 'muted'

export type TimelineItem = {
  key: string
  at: string
  title: string
  detail?: string
  who?: string | null
  tone: TimelineTone
}

const ERP_TEXT: Record<string, { title: string; tone: TimelineTone }> = {
  pendente_erp: { title: 'Aguardando envio ao ERP', tone: 'muted' },
  integrado: { title: 'Integrado ao ERP', tone: 'ok' },
  integrado_erp: { title: 'Integrado ao ERP', tone: 'ok' },
  erro_erp: { title: 'Falha na integração com o ERP', tone: 'alert' },
  eliminado: { title: 'Eliminado no ERP', tone: 'info' },
  erro_eliminacao: { title: 'Falha ao eliminar no ERP', tone: 'alert' },
  barrado_duplicidade: { title: 'Integração barrada por duplicidade', tone: 'alert' },
}

const COLUMN_LABEL: Record<string, string> = {
  description: 'Descrição',
  detailed_description: 'Descrição detalhada',
  pdm_code: 'PDM',
  material_type: 'Tipo de Material',
  unit_of_measure: 'Unidade de Medida',
  material_group: 'Grupo de Mercadorias',
  ncm: 'NCM',
}

const text = (value: unknown) => (value == null ? '' : String(value))

export function requestCode(id: number | string): string {
  return `REQ-${String(id).padStart(4, '0')}`
}

/**
 * Um item por momento, do mais recente para o mais antigo.
 * "integrando" é passagem (vem logo antes do resultado) e não aparece.
 */
export function buildTimeline(
  rows: MaterialHistoryRow[],
  requestEvents: RequestEventLite[],
  opts: { requestId?: number | null; labelOf: (fieldName: string) => string | undefined }
): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const row of rows) {
    const data = row.event_data ?? {}
    const base = { key: `m${row.id}`, at: row.created_at, who: row.user_name }
    if (row.event_type === 'created') {
      const req = data.request_id ?? opts.requestId
      items.push({
        ...base,
        title: req ? `Material criado a partir da solicitação ${requestCode(req as number)}` : data.source === 'api' ? 'Material criado pela API de integração' : 'Material criado na Base de Dados',
        tone: 'info',
      })
    } else if (row.event_type === 'status') {
      items.push({
        ...base,
        title: data.from ? `Status: ${text(data.from)} → ${text(data.to)}` : `Status alterado para ${text(data.to)}`,
        tone: data.to === 'Ativo' ? 'ok' : 'muted',
      })
    } else if (row.event_type === 'erp') {
      const to = text(data.to)
      if (to === 'integrando') continue
      const known = ERP_TEXT[to]
      const code = data.id_erp ? ` (código ${text(data.id_erp)})` : ''
      items.push({
        ...base,
        title: known ? `${known.title}${known.tone === 'ok' ? code : ''}` : `Situação no ERP: ${to || 'sem situação'}${code}`,
        detail: [data.message ? text(data.message) : '', data.simulated ? 'Simulação' : ''].filter(Boolean).join(' · ') || undefined,
        tone: known?.tone ?? 'muted',
      })
    } else if (row.event_type === 'edited') {
      const fields = Array.isArray(data.fields) ? (data.fields as unknown[]).map(String) : []
      const labels = [...new Set(fields.map((f) => opts.labelOf(f) ?? COLUMN_LABEL[f] ?? f))]
      items.push({
        ...base,
        title: 'Cadastro alterado',
        detail: labels.length > 6 ? `${labels.slice(0, 6).join(', ')} e mais ${labels.length - 6}` : labels.join(', '),
        tone: 'muted',
      })
    }
  }
  for (const event of requestEvents) {
    if (!event.created_at) continue
    items.push({
      key: `r${event.id}`,
      at: event.created_at,
      title: `Solicitação: ${event.message}`,
      who: event.user_name ?? null,
      tone: event.event_type === 'rejected' ? 'alert' : 'muted',
    })
  }
  return items.sort((a, b) => b.at.localeCompare(a.at))
}

export type OriginSummary = {
  attendants: Array<{ stage: string; name: string; at: string }>
}

/** Quem atendeu cada etapa (último "iniciou atendimento" da etapa), na ordem em que aconteceu. */
export function originAttendants(requestEvents: RequestEventLite[]): OriginSummary['attendants'] {
  const byStage = new Map<string, { stage: string; name: string; at: string }>()
  const ordered = [...requestEvents]
    .filter((e) => e.event_type === 'assigned' && e.stage && e.user_name && e.created_at)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  for (const e of ordered) byStage.set(e.stage!.toLowerCase(), { stage: e.stage!, name: e.user_name!, at: e.created_at! })
  return [...byStage.values()].sort((a, b) => a.at.localeCompare(b.at))
}
