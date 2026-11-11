'use client'

import { useEffect, useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { getMaterialHistory, getRequestHistory, getRequestOrigin, requestStatusLabel } from '@/lib/supabase-api'
import {
  buildTimeline,
  originAttendants,
  requestCode,
  type MaterialHistoryRow,
  type RequestEventLite,
  type TimelineTone,
} from '@/lib/material-timeline'
import { PageLoading } from '@/components/ui/page-loading'

const DOT: Record<TimelineTone, string> = {
  ok: 'bg-green-500',
  alert: 'bg-red-500',
  info: 'bg-blue-500',
  muted: 'bg-slate-400',
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** Seção Histórico do detalhe do material: origem (solicitação, solicitante, atendentes) e os momentos. */
export function MaterialHistory({
  materialId,
  requestId,
  createdAt,
  labelOf,
}: {
  materialId: number
  requestId: number | null
  createdAt: string | null
  labelOf: (fieldName: string) => string | undefined
}) {
  const [rows, setRows] = useState<MaterialHistoryRow[]>([])
  const [requestEvents, setRequestEvents] = useState<RequestEventLite[]>([])
  const [origin, setOrigin] = useState<{ requester: string | null; created_at: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed(false)
    Promise.all([
      getMaterialHistory(materialId),
      requestId ? getRequestHistory(requestId).catch(() => []) : Promise.resolve([]),
      requestId ? getRequestOrigin(requestId).catch(() => null) : Promise.resolve(null),
    ])
      .then(([history, events, req]) => {
        if (cancelled) return
        setRows(history)
        setRequestEvents(events.map((e) => ({ ...e, created_at: e.created_at ?? null })))
        setOrigin(req)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [materialId, requestId])

  const items = useMemo(() => buildTimeline(rows, requestEvents, { requestId, labelOf }), [rows, requestEvents, requestId, labelOf])
  const attendants = useMemo(() => originAttendants(requestEvents), [requestEvents])

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 sm:col-span-2 dark:border-zinc-700/50 dark:bg-card">
      <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
        <History className="size-4" />
        Histórico
      </h3>

      {loading ? (
        <PageLoading label="Carregando histórico…" minHeight="min-h-[8rem]" />
      ) : failed ? (
        <p className="text-sm text-muted-foreground">Não foi possível carregar o histórico.</p>
      ) : (
        <div className="space-y-5">
          <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-3 dark:border-zinc-700/50 dark:bg-muted/20">
            <div>
              <dt className="text-xs text-muted-foreground">Criado em</dt>
              <dd className="mt-0.5 font-medium">{formatDateTime(createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Origem</dt>
              <dd className="mt-0.5 font-medium">
                {requestId ? `Solicitação ${requestCode(requestId)}` : 'Base de Dados (sem solicitação)'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Solicitante</dt>
              <dd className="mt-0.5 font-medium">
                {origin?.requester ? `${origin.requester} · ${formatDateTime(origin.created_at)}` : '—'}
              </dd>
            </div>
            {attendants.length > 0 && (
              <div className="sm:col-span-3">
                <dt className="text-xs text-muted-foreground">Atendentes</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {attendants.map((a) => (
                    <span key={a.stage} className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-card">
                      <span className="mr-1 text-muted-foreground">{requestStatusLabel(a.stage)}:</span>
                      {a.name}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum momento registrado ainda.</p>
          ) : (
            <ol className="space-y-3 border-l border-slate-200 pl-4 dark:border-zinc-700">
              {items.map((item) => (
                <li key={item.key} className="relative text-sm">
                  <span className={`absolute -left-[21px] top-1.5 size-2.5 rounded-full ${DOT[item.tone]}`} aria-hidden="true" />
                  <p className="font-medium text-slate-900 dark:text-foreground">{item.title}</p>
                  {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
                  <p className="text-xs text-muted-foreground">
                    {item.who ?? 'Sistema'} · {formatDateTime(item.at)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
