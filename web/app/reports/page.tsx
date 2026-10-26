'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, Loader2, RefreshCw } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { useUser } from '@/contexts/user-context'
import {
  getReportFlow,
  getReportMaterialBase,
  getReportProductivity,
  getWorkflowConfig,
  requestStatusLabel,
} from '@/lib/supabase-api'
import {
  defaultPeriod,
  formatHours,
  periodToRange,
  productivityByArea,
  totalsOfBase,
  type FlowRow,
  type MaterialBaseRow,
  type ProductivityRow,
} from '@/lib/reports'
import { exportRowsToXlsx } from '@/lib/export-xlsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Tab = 'fluxo' | 'produtividade' | 'base'

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: 'alert' }) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        tone === 'alert'
          ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
          : 'border-slate-200 bg-white dark:border-zinc-700 dark:bg-card'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-foreground">{value}</p>
    </div>
  )
}

/** Barra proporcional ao maior valor da coluna. */
function Bar({ value, max, tone = 'navy' }: { value: number; max: number; tone?: 'navy' | 'gold' | 'red' }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  const color = tone === 'gold' ? 'bg-[#C69A46]' : tone === 'red' ? 'bg-red-500' : 'bg-[#0F1C38] dark:bg-slate-300'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  )
}

const th = 'px-4 py-3 text-left font-semibold text-slate-700 dark:text-foreground'
const td = 'px-4 py-3'

export default function ReportsPage() {
  const { can, ready } = useUser()
  const allowed = can('can_view_reports')
  const [tab, setTab] = useState<Tab>('fluxo')
  const [period, setPeriod] = useState(defaultPeriod)
  const [stepNames, setStepNames] = useState<Map<string, { name: string; order: number }>>(new Map())
  const [flow, setFlow] = useState<FlowRow[]>([])
  const [people, setPeople] = useState<ProductivityRow[]>([])
  const [base, setBase] = useState<MaterialBaseRow[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    if (!period.from || !period.to || period.from > period.to) {
      toast.error('Período inválido.')
      return
    }
    setLoading(true)
    const range = periodToRange(period.from, period.to)
    try {
      const [flowRows, peopleRows, baseRows, steps] = await Promise.all([
        getReportFlow(range.from, range.to),
        getReportProductivity(range.from, range.to),
        getReportMaterialBase(),
        getWorkflowConfig().catch(() => []),
      ])
      setFlow(flowRows)
      setPeople(peopleRows)
      setBase(baseRows)
      setStepNames(new Map(steps.map((s) => [s.status_key.toLowerCase(), { name: s.step_name, order: s.order }])))
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Não foi possível carregar os relatórios.')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    if (ready && allowed) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, allowed])

  const stageLabel = useCallback((stage: string) => stepNames.get(stage)?.name ?? requestStatusLabel(stage), [stepNames])
  const flowSorted = useMemo(
    () => [...flow].sort((a, b) => (stepNames.get(a.stage)?.order ?? 99) - (stepNames.get(b.stage)?.order ?? 99)),
    [flow, stepNames]
  )
  const areas = useMemo(() => productivityByArea(people), [people])
  const peopleSorted = useMemo(() => [...people].sort((a, b) => b.approved + b.rejected - (a.approved + a.rejected)), [people])
  const baseSorted = useMemo(() => [...base].sort((a, b) => b.total - a.total), [base])
  const baseTotals = useMemo(() => totalsOfBase(base), [base])

  const maxAvg = Math.max(0, ...flow.map((r) => r.avg_hours ?? 0))
  const maxOpen = Math.max(0, ...flow.map((r) => r.current_open))
  const maxDecisions = Math.max(0, ...people.map((r) => r.approved + r.rejected))
  const maxTotal = Math.max(0, ...base.map((r) => r.total))
  const slowest = flow.reduce<FlowRow | null>((acc, r) => ((r.avg_hours ?? -1) > (acc?.avg_hours ?? -1) ? r : acc), null)

  async function handleExport() {
    setExporting(true)
    try {
      if (tab === 'fluxo') {
        await exportRowsToXlsx(
          flowSorted.map((r) => ({
            Etapa: stageLabel(r.stage),
            'Entradas no período': r.entered,
            'Tempo médio (h)': r.avg_hours ?? '',
            'Maior tempo (h)': r.max_hours ?? '',
            'Na etapa agora': r.current_open,
          })),
          'Fluxo',
          `relatorio_fluxo_${period.from}_${period.to}`
        )
      } else if (tab === 'produtividade') {
        await exportRowsToXlsx(
          peopleSorted.map((r) => ({
            Pessoa: r.user_name,
            Área: r.role_name ?? '',
            Atendimentos: r.attended,
            Aprovações: r.approved,
            Rejeições: r.rejected,
            'Movidas no kanban': r.moved,
            'Tempo médio de decisão (h)': r.avg_decision_hours ?? '',
          })),
          'Produtividade',
          `relatorio_produtividade_${period.from}_${period.to}`
        )
      } else {
        await exportRowsToXlsx(
          baseSorted.map((r) => ({
            'Código PDM': r.pdm_code,
            PDM: r.pdm_name,
            Total: r.total,
            Ativos: r.ativos,
            Bloqueados: r.bloqueados,
            Obsoletos: r.obsoletos,
            'Pendente ERP': r.pendente_erp,
            Integrados: r.integrados,
            'Erro ERP': r.erro_erp,
            Duplicados: r.duplicados,
          })),
          'Base de materiais',
          'relatorio_base_materiais'
        )
      }
      toast.success('Planilha exportada.')
    } catch {
      toast.error('Não foi possível exportar a planilha.')
    } finally {
      setExporting(false)
    }
  }

  if (ready && !allowed) {
    return <p className="text-sm text-muted-foreground">Você não tem acesso aos relatórios. Peça a permissão "Ver Relatórios" ao administrador.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-foreground">
            <BarChart3 className="size-6" />
            Relatórios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Fluxo das solicitações, produtividade das áreas e situação da base de materiais</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">De</p>
            <Input type="date" value={period.from} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} className="h-9 w-40" />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Até</p>
            <Input type="date" value={period.to} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} className="h-9 w-40" />
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Atualizar
          </Button>
          <Button size="sm" className="h-9 gap-2" onClick={() => void handleExport()} disabled={exporting || loading}>
            <Download className="size-4" />
            {exporting ? 'Exportando…' : 'Exportar Excel'}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="fluxo">Fluxo</TabsTrigger>
          <TabsTrigger value="produtividade">Produtividade</TabsTrigger>
          <TabsTrigger value="base">Base de materiais</TabsTrigger>
        </TabsList>

        <TabsContent value="fluxo" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Entradas em etapas no período" value={flow.reduce((s, r) => s + r.entered, 0)} />
            <Kpi label="Solicitações em andamento agora" value={flow.reduce((s, r) => s + r.current_open, 0)} />
            <Kpi
              label="Etapa mais lenta (média)"
              value={slowest?.avg_hours != null ? `${stageLabel(slowest.stage)} · ${formatHours(slowest.avg_hours)}` : '—'}
              tone={slowest?.avg_hours != null ? 'alert' : undefined}
            />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-zinc-700/50 dark:bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-muted/30">
                <tr>
                  <th className={th}>Etapa</th>
                  <th className={`${th} text-right`}>Entradas no período</th>
                  <th className={`${th} w-64`}>Tempo médio na etapa</th>
                  <th className={`${th} text-right`}>Maior tempo</th>
                  <th className={`${th} w-56`}>Na etapa agora</th>
                </tr>
              </thead>
              <tbody>
                {flowSorted.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">{loading ? 'Carregando…' : 'Sem movimento no período.'}</td></tr>
                ) : flowSorted.map((r) => (
                  <tr key={r.stage} className="border-b border-slate-100 last:border-b-0 dark:border-zinc-700/40">
                    <td className={`${td} font-medium`}>{stageLabel(r.stage)}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.entered}</td>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <span className="w-20 shrink-0 tabular-nums">{formatHours(r.avg_hours)}</span>
                        <Bar value={r.avg_hours ?? 0} max={maxAvg} tone={r === slowest ? 'red' : 'navy'} />
                      </div>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{formatHours(r.max_hours)}</td>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <span className="w-10 shrink-0 text-right tabular-nums">{r.current_open}</span>
                        <Bar value={r.current_open} max={maxOpen} tone="gold" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Tempo na etapa: da entrada da solicitação na etapa até a saída (aprovação, rejeição ou movimento). Quem ainda está na etapa conta até agora.
          </p>
        </TabsContent>

        <TabsContent value="produtividade" className="mt-4 space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-zinc-700/50 dark:bg-card">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold dark:border-zinc-700">Por área</div>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-muted/30">
                <tr>
                  <th className={th}>Área</th>
                  <th className={`${th} text-right`}>Pessoas</th>
                  <th className={`${th} text-right`}>Atendimentos</th>
                  <th className={`${th} text-right`}>Aprovações</th>
                  <th className={`${th} text-right`}>Rejeições</th>
                  <th className={`${th} text-right`}>Tempo médio de decisão</th>
                </tr>
              </thead>
              <tbody>
                {areas.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">{loading ? 'Carregando…' : 'Nenhuma ação no período.'}</td></tr>
                ) : areas.map((a) => (
                  <tr key={a.area} className="border-b border-slate-100 last:border-b-0 dark:border-zinc-700/40">
                    <td className={`${td} font-medium`}>{a.area}</td>
                    <td className={`${td} text-right tabular-nums`}>{a.people}</td>
                    <td className={`${td} text-right tabular-nums`}>{a.attended}</td>
                    <td className={`${td} text-right tabular-nums`}>{a.approved}</td>
                    <td className={`${td} text-right tabular-nums`}>{a.rejected}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatHours(a.avg_decision_hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-zinc-700/50 dark:bg-card">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold dark:border-zinc-700">Por pessoa</div>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-muted/30">
                <tr>
                  <th className={th}>Pessoa</th>
                  <th className={th}>Área</th>
                  <th className={`${th} text-right`}>Atendimentos</th>
                  <th className={`${th} w-56`}>Decisões (aprov. + rej.)</th>
                  <th className={`${th} text-right`}>Rejeições</th>
                  <th className={`${th} text-right`}>Movidas no kanban</th>
                  <th className={`${th} text-right`}>Tempo médio de decisão</th>
                </tr>
              </thead>
              <tbody>
                {peopleSorted.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">{loading ? 'Carregando…' : 'Nenhuma ação no período.'}</td></tr>
                ) : peopleSorted.map((r) => (
                  <tr key={r.user_id} className="border-b border-slate-100 last:border-b-0 dark:border-zinc-700/40">
                    <td className={`${td} font-medium`}>{r.user_name}</td>
                    <td className={`${td} text-muted-foreground`}>{r.role_name ?? '—'}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.attended}</td>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <span className="w-10 shrink-0 text-right tabular-nums">{r.approved + r.rejected}</span>
                        <Bar value={r.approved + r.rejected} max={maxDecisions} />
                      </div>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{r.rejected}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.moved}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatHours(r.avg_decision_hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Tempo de decisão: do &quot;Iniciou atendimento&quot; da própria pessoa até aprovar ou rejeitar.
          </p>
        </TabsContent>

        <TabsContent value="base" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Kpi label="Materiais" value={baseTotals.total.toLocaleString('pt-BR')} />
            <Kpi label="Integrados no ERP" value={baseTotals.integrados.toLocaleString('pt-BR')} />
            <Kpi label="Pendentes ou com erro no ERP" value={(baseTotals.pendente_erp + baseTotals.erro_erp).toLocaleString('pt-BR')} tone={baseTotals.erro_erp > 0 ? 'alert' : undefined} />
            <Kpi label="Duplicados" value={baseTotals.duplicados.toLocaleString('pt-BR')} tone={baseTotals.duplicados > 0 ? 'alert' : undefined} />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-zinc-700/50 dark:bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-muted/30">
                <tr>
                  <th className={th}>PDM</th>
                  <th className={`${th} w-56`}>Total</th>
                  <th className={`${th} text-right`}>Ativos</th>
                  <th className={`${th} text-right`}>Bloqueados</th>
                  <th className={`${th} text-right`}>Obsoletos</th>
                  <th className={`${th} text-right`}>Pendente ERP</th>
                  <th className={`${th} text-right`}>Integrados</th>
                  <th className={`${th} text-right`}>Erro ERP</th>
                  <th className={`${th} text-right`}>Duplicados</th>
                </tr>
              </thead>
              <tbody>
                {baseSorted.length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">{loading ? 'Carregando…' : 'Base vazia.'}</td></tr>
                ) : baseSorted.map((r) => (
                  <tr key={r.pdm_code || '-'} className="border-b border-slate-100 last:border-b-0 dark:border-zinc-700/40">
                    <td className={td}>
                      <p className="font-medium">{r.pdm_name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{r.pdm_code || '—'}</p>
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <span className="w-12 shrink-0 text-right tabular-nums">{r.total.toLocaleString('pt-BR')}</span>
                        <Bar value={r.total} max={maxTotal} />
                      </div>
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{r.ativos}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.bloqueados}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.obsoletos}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.pendente_erp}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.integrados}</td>
                    <td className={`${td} text-right tabular-nums ${r.erro_erp ? 'font-semibold text-red-600 dark:text-red-400' : ''}`}>{r.erro_erp}</td>
                    <td className={`${td} text-right tabular-nums ${r.duplicados ? 'font-semibold text-red-600 dark:text-red-400' : ''}`}>{r.duplicados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">A base é a situação atual, sem período. Duplicados seguem a mesma regra do selo DUP: Obsoleto não conta.</p>
        </TabsContent>
      </Tabs>

      <Toaster position="top-right" richColors />
    </div>
  )
}
