'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, FilePlus, FileText, Loader2, Search, X } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { useUser } from '@/contexts/user-context'
import {
  getMyRequests,
  getRequestHistory,
  getRequestsErpStatus,
  requestStatusLabel,
  type HistoryEvent,
} from '@/lib/supabase-api'
import {
  applyMyRequests,
  countBySituation,
  DEFAULT_MY_REQUESTS,
  MY_REQUESTS_PAGE_SIZE,
  situationOf,
  type MyRequestRow,
  type MyRequestsState,
  type MyRequestSituation,
} from '@/lib/my-requests'
import { requestErpState, type RequestErpInfo } from '@/lib/request-erp-state'
import { ErpStateBadge } from '@/components/governance/request-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const SITUATION_LABEL: Record<MyRequestSituation, string> = {
  andamento: 'Em andamento',
  finalizada: 'Finalizadas',
  rejeitada: 'Rejeitadas',
}

const URGENCY_LABEL = { low: 'Baixa', medium: 'Média', high: 'Alta' } as const

function formatDate(iso: string | null, withTime = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return withTime ? `${date} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : date
}

function StageBadge({ row }: { row: MyRequestRow }) {
  const situation = situationOf(row.status)
  const cls =
    situation === 'rejeitada'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
      : situation === 'finalizada'
        ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-900/30 dark:text-green-400'
        : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{row.step_label}</span>
}

function MyRequestsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, can } = useUser()
  const [rows, setRows] = useState<MyRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erpInfo, setErpInfo] = useState<Map<number, RequestErpInfo>>(new Map())
  const [state, setState] = useState<MyRequestsState>(DEFAULT_MY_REQUESTS)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [history, setHistory] = useState<HistoryEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await getMyRequests()
      setRows(list)
      const finalized = list.filter((r) => situationOf(r.status) === 'finalizada').map((r) => r.id)
      const items = finalized.length ? await getRequestsErpStatus(finalized) : []
      setErpInfo(new Map(items.map((item) => [item.request_id, item])))
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Falha ao carregar suas solicitações')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) void load()
  }, [user, load])

  const statusParam = searchParams.get('status')
  const reqParam = searchParams.get('req')
  useEffect(() => {
    if (statusParam) setState((prev) => ({ ...prev, etapa: statusParam.toLowerCase(), pagina: 1 }))
  }, [statusParam])
  useEffect(() => {
    const id = Number(reqParam)
    if (Number.isInteger(id) && id > 0) setDetailId(id)
  }, [reqParam])

  useEffect(() => {
    if (detailId == null) return
    let cancelled = false
    setHistory([])
    setHistoryLoading(true)
    getRequestHistory(detailId)
      .then((events) => { if (!cancelled) setHistory(events) })
      .catch(() => { if (!cancelled) setHistory([]) })
      .finally(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true }
  }, [detailId])

  const result = useMemo(() => applyMyRequests(rows, state), [rows, state])
  const counts = useMemo(() => countBySituation(rows), [rows])
  const attention = useMemo(
    () => [...erpInfo.values()].filter((info) => requestErpState(info).tone === 'alert').length,
    [erpInfo]
  )
  const detail = detailId != null ? rows.find((r) => r.id === detailId) ?? null : null
  const detailErp = detailId != null && erpInfo.has(detailId) ? requestErpState(erpInfo.get(detailId)!) : null
  const detailMaterial = detailId != null ? erpInfo.get(detailId)?.material ?? null : null

  const update = (changes: Partial<MyRequestsState>) =>
    setState((prev) => ({ ...prev, ...changes, pagina: 'pagina' in changes ? changes.pagina ?? 1 : 1 }))

  const clearUrl = () => router.replace('/requests', { scroll: false })
  const closeDetail = () => {
    setDetailId(null)
    if (reqParam) clearUrl()
  }

  const hasFilter = state.q.trim() !== '' || state.situacao !== 'todas' || state.etapa != null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-foreground">
            <FileText className="size-6" />
            Minhas Solicitações
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhe as solicitações de cadastro que você abriu</p>
        </div>
        {can('can_submit_request') && (
          <Link href="/requests/new">
            <Button className="gap-2 bg-[#C69A46] text-[#0F1C38] hover:bg-[#C69A46]/90">
              <FilePlus className="size-4" />
              Nova Solicitação
            </Button>
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {(['andamento', 'finalizada', 'rejeitada'] as const).map((situation) => (
          <button
            key={situation}
            type="button"
            onClick={() => update({ situacao: state.situacao === situation ? 'todas' : situation })}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              state.situacao === situation
                ? 'border-[#0F1C38] bg-[#0F1C38] text-white dark:border-[#C69A46] dark:bg-[#C69A46]/20'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-zinc-700 dark:bg-card'
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{SITUATION_LABEL[situation]}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{counts[situation]}</p>
          </button>
        ))}
        <div
          className={`rounded-xl border px-4 py-3 ${
            attention
              ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
              : 'border-slate-200 bg-white dark:border-zinc-700 dark:bg-card'
          }`}
          title="Finalizadas cujo material ainda não chegou ao ERP"
        >
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">Material fora do ERP</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{attention}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700/50 dark:bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-zinc-700">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={state.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Buscar por código, PDM ou descrição"
              className="pl-9"
            />
          </div>
          {state.etapa && (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
              Etapa: {requestStatusLabel(state.etapa)}
              <button
                type="button"
                aria-label="Remover filtro de etapa"
                onClick={() => {
                  update({ etapa: null })
                  clearUrl()
                }}
              >
                <X className="size-3" />
              </button>
            </span>
          )}
          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => {
                setState(DEFAULT_MY_REQUESTS)
                clearUrl()
              }}
            >
              <X className="size-4" />
              Limpar filtros
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-muted/30">
              <tr className="text-left">
                <th className="w-28 px-4 py-3 font-semibold text-slate-700 dark:text-foreground">Código</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-foreground">Material</th>
                <th className="w-48 px-4 py-3 font-semibold text-slate-700 dark:text-foreground">Etapa</th>
                <th className="w-44 px-4 py-3 font-semibold text-slate-700 dark:text-foreground">Atendente</th>
                <th className="w-28 px-4 py-3 font-semibold text-slate-700 dark:text-foreground">Aberta em</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </td>
                </tr>
              ) : result.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    {rows.length === 0 ? 'Você ainda não abriu nenhuma solicitação.' : 'Nenhuma solicitação com esses filtros.'}
                  </td>
                </tr>
              ) : (
                result.rows.map((row) => {
                  const erp = erpInfo.has(row.id) ? requestErpState(erpInfo.get(row.id)!) : null
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setDetailId(row.id)}
                      className={`cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors hover:bg-slate-50 dark:border-zinc-700/40 dark:hover:bg-muted/30 ${
                        erp?.tone === 'alert' ? 'bg-red-50/60 dark:bg-red-950/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#0F1C38] dark:text-[#C69A46]">{row.code}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 dark:text-foreground">{row.pdm_name}</p>
                        <p className="line-clamp-1 font-mono text-xs text-muted-foreground">{row.description || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StageBadge row={row} />
                          {erp && <ErpStateBadge state={erp} />}
                        </div>
                        {row.rejection_reason && (
                          <p className="mt-1 line-clamp-1 text-xs text-red-700 dark:text-red-300" title={row.rejection_reason}>
                            {row.rejection_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-foreground">
                        {row.assigned_to_name ?? <span className="italic text-muted-foreground">{situationOf(row.status) === 'andamento' ? 'Aguardando' : '—'}</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(row.created_at)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-muted-foreground dark:border-zinc-700">
          <span>
            {result.total === 0
              ? '0 solicitações'
              : `${(result.page - 1) * MY_REQUESTS_PAGE_SIZE + 1}–${Math.min(result.page * MY_REQUESTS_PAGE_SIZE, result.total)} de ${result.total}`}
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

      <Dialog open={detailId != null} onOpenChange={(open) => { if (!open) closeDetail() }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-slate-200 bg-white text-slate-900 dark:border-zinc-700/50 dark:bg-card dark:text-foreground">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-[#C69A46]">
              {detail ? `${detail.code} — ${detail.pdm_name}` : 'Solicitação'}
            </DialogTitle>
          </DialogHeader>
          {!detail ? (
            <p className="text-sm text-muted-foreground">
              {loading ? 'Carregando…' : 'Solicitação não encontrada entre as suas.'}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-700/50 dark:bg-muted/20">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Descrição gerada</p>
                <code className="break-words font-mono text-sm font-bold text-[#0F1C38] dark:text-[#C69A46]">{detail.description || '—'}</code>
              </div>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Etapa</dt>
                  <dd className="mt-0.5"><StageBadge row={detail} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Atendente</dt>
                  <dd className="mt-0.5">{detail.assigned_to_name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Urgência</dt>
                  <dd className="mt-0.5">{URGENCY_LABEL[detail.urgency] ?? detail.urgency}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Aberta em</dt>
                  <dd className="mt-0.5">{formatDate(detail.created_at, true)}</dd>
                </div>
              </dl>

              {situationOf(detail.status) === 'rejeitada' && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                  <p className="font-semibold">Solicitação rejeitada</p>
                  <p className="mt-1">{detail.rejection_reason || 'Sem justificativa registrada.'}</p>
                </div>
              )}

              {detailErp && (
                <div
                  className={
                    detailErp.tone === 'alert'
                      ? 'rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200'
                      : 'rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-zinc-700/50 dark:bg-muted/20'
                  }
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Material</p>
                  <p className="mt-1 font-semibold">
                    {detailErp.tone === 'alert' && <AlertTriangle className="-mt-0.5 mr-1.5 inline size-4" />}
                    {detailMaterial?.id_sistema ? `${detailMaterial.id_sistema} · ` : ''}
                    {detailErp.label}
                  </p>
                  {detailErp.tone === 'alert' && (
                    <p className="mt-1">
                      {detailErp.kind === 'sem_material' ? detailErp.detail : 'A área de Cadastro está tratando o envio ao ERP.'}
                    </p>
                  )}
                  {detailMaterial && can('can_view_database') && (
                    <Link
                      href={`/database/${detailMaterial.id}`}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
                    >
                      <ExternalLink className="size-3.5" />
                      Abrir na Base de Dados
                    </Link>
                  )}
                </div>
              )}

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
                        <p className="text-xs text-muted-foreground">
                          {evt.user_name ?? 'Sistema'} · {formatDate(evt.created_at, true)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Toaster position="top-right" richColors />
    </div>
  )
}

export default function MyRequestsPage() {
  return (
    <Suspense fallback={null}>
      <MyRequestsContent />
    </Suspense>
  )
}
