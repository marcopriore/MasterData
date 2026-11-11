'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { getMyAttendedRequests, getRequestHistory, type HistoryEvent } from '@/lib/supabase-api'
import {
  applyAttended,
  ATTENDED_ACTION_LABEL,
  ATTENDED_PAGE_SIZE,
  attendedSituation,
  countByAction,
  DEFAULT_ATTENDED,
  filterAttended,
  type AttendedAction,
  type AttendedRow,
  type AttendedState,
} from '@/lib/attended-requests'
import { exportRowsToXlsx } from '@/lib/export-xlsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageLoading } from '@/components/ui/page-loading'

const ACTIONS: AttendedAction[] = ['aprovei', 'rejeitei', 'movi', 'iniciei']

const ACTION_CLASS: Record<AttendedAction, string> = {
  aprovei: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-900/30 dark:text-green-400',
  rejeitei: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  movi: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-300',
  iniciei: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
}

const SITUATION_CLASS = {
  andamento: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  finalizada: 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-900/30 dark:text-green-400',
  rejeitada: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  cancelada: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
} as const

const pill = 'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium'

function formatDate(iso: string | null, withTime = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return withTime ? `${date} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : date
}

/** Solicitações em que o usuário agiu como atendente: o que fez por último e onde a solicitação está agora. */
export function AttendedRequests() {
  const [rows, setRows] = useState<AttendedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState<AttendedState>(DEFAULT_ATTENDED)
  const [exporting, setExporting] = useState(false)
  const [detail, setDetail] = useState<AttendedRow | null>(null)
  const [history, setHistory] = useState<HistoryEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await getMyAttendedRequests())
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Falha ao carregar as solicitações atendidas')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!detail) return
    let cancelled = false
    setHistory([])
    setHistoryLoading(true)
    getRequestHistory(detail.id)
      .then((events) => { if (!cancelled) setHistory(events) })
      .catch(() => { if (!cancelled) setHistory([]) })
      .finally(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true }
  }, [detail])

  const result = useMemo(() => applyAttended(rows, state), [rows, state])
  const counts = useMemo(() => countByAction(rows), [rows])
  const update = (changes: Partial<AttendedState>) =>
    setState((prev) => ({ ...prev, ...changes, pagina: 'pagina' in changes ? changes.pagina ?? 1 : 1 }))
  const hasFilter = state.q.trim() !== '' || state.acao !== 'todas'

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportRowsToXlsx(
        filterAttended(rows, state).map((row) => ({
          'Código': row.code,
          'PDM': row.pdm_name,
          'Descrição': row.description,
          'O que fiz': ATTENDED_ACTION_LABEL[row.my_action],
          'Última ação em': formatDate(row.my_last_at, true),
          'Etapa atual': row.step_label,
        })),
        'Atendidas',
        'solicitacoes_atendidas'
      )
    } catch (err) {
      toast.error('Falha ao exportar', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        {ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => update({ acao: state.acao === action ? 'todas' : action })}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              state.acao === action
                ? 'border-[#0F1C38] bg-[#0F1C38] text-white dark:border-[#C69A46] dark:bg-[#C69A46]/20'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-zinc-700 dark:bg-card'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{ATTENDED_ACTION_LABEL[action]}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{counts[action]}</p>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700/50 dark:bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-zinc-700">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={state.q} onChange={(e) => update({ q: e.target.value })} placeholder="Buscar por código, PDM ou descrição" className="pl-9" />
          </div>
          {hasFilter && (
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setState(DEFAULT_ATTENDED)}>
              <X className="size-4" />
              Limpar filtros
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={exporting || rows.length === 0}>
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Exportar Excel
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-muted/30">
              <tr className="text-left">
                <th className="w-28 px-4 py-3 font-semibold text-slate-700 dark:text-foreground">Código</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-foreground">Material</th>
                <th className="w-40 px-4 py-3 font-semibold text-slate-700 dark:text-foreground">O que fiz</th>
                <th className="w-40 px-4 py-3 font-semibold text-slate-700 dark:text-foreground">Última ação</th>
                <th className="w-48 px-4 py-3 font-semibold text-slate-700 dark:text-foreground">Etapa atual</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5}><PageLoading label="Carregando solicitações atendidas…" minHeight="min-h-[12rem]" /></td></tr>
              ) : result.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    {rows.length === 0 ? 'Você ainda não atendeu nenhuma solicitação.' : 'Nenhuma solicitação com esses filtros.'}
                  </td>
                </tr>
              ) : (
                result.rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setDetail(row)}
                    className="cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors hover:bg-slate-50 dark:border-zinc-700/40 dark:hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[#0F1C38] dark:text-[#C69A46]">{row.code}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-foreground">{row.pdm_name}</p>
                      <p className="line-clamp-1 font-mono text-xs text-muted-foreground">{row.description || '—'}</p>
                    </td>
                    <td className="px-4 py-3"><span className={`${pill} ${ACTION_CLASS[row.my_action]}`}>{ATTENDED_ACTION_LABEL[row.my_action]}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(row.my_last_at, true)}</td>
                    <td className="px-4 py-3"><span className={`${pill} ${SITUATION_CLASS[attendedSituation(row.status)]}`}>{row.step_label}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-muted-foreground dark:border-zinc-700">
          <span>
            {result.total === 0
              ? '0 solicitações'
              : `${(result.page - 1) * ATTENDED_PAGE_SIZE + 1}–${Math.min(result.page * ATTENDED_PAGE_SIZE, result.total)} de ${result.total}`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1" disabled={result.page <= 1} onClick={() => update({ pagina: result.page - 1 })}>
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <span className="tabular-nums">Página {result.page} de {result.pages}</span>
            <Button variant="outline" size="sm" className="h-8 gap-1" disabled={result.page >= result.pages} onClick={() => update({ pagina: result.page + 1 })}>
              Próxima
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={detail != null} onOpenChange={(open) => { if (!open) setDetail(null) }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-200 bg-white text-slate-900 dark:border-zinc-700/50 dark:bg-card dark:text-foreground">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-[#C69A46]">{detail ? `${detail.code} — ${detail.pdm_name}` : 'Solicitação'}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-700/50 dark:bg-muted/20">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Descrição gerada</p>
                <code className="break-words font-mono text-sm font-bold text-[#0F1C38] dark:text-[#C69A46]">{detail.description || '—'}</code>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">O que fiz</dt>
                  <dd className="mt-0.5"><span className={`${pill} ${ACTION_CLASS[detail.my_action]}`}>{ATTENDED_ACTION_LABEL[detail.my_action]}</span></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Etapa atual</dt>
                  <dd className="mt-0.5"><span className={`${pill} ${SITUATION_CLASS[attendedSituation(detail.status)]}`}>{detail.step_label}</span></dd>
                </div>
              </dl>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Histórico</p>
                {historyLoading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Carregando…
                  </p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
                ) : (
                  <ol className="space-y-3 border-l border-slate-200 pl-4 dark:border-zinc-700">
                    {history.map((evt) => (
                      <li key={evt.id} className="text-sm">
                        <p className="font-medium text-slate-900 dark:text-foreground">{evt.message}</p>
                        <p className="text-xs text-muted-foreground">{evt.user_name ?? 'Sistema'} · {formatDate(evt.created_at, true)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
