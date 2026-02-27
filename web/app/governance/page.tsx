'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { apiGet, apiPatch } from '@/lib/api'
import { KanbanBoard } from '@/components/governance/kanban-board'
import { ListView } from '@/components/governance/list-view'
import { FiltersBar } from '@/components/governance/filters-bar'
import { StatsSummary } from '@/components/governance/stats-summary'
import { EmptyColumn } from '@/components/governance/request-card'
import type { MaterialRequest } from '@/components/governance/request-card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Toaster, toast } from 'sonner'
import { ChevronLeft, FilePlus, Check, X } from 'lucide-react'

type WorkflowHeader = {
  id: number
  name: string
  description?: string | null
  is_active: boolean
}

type RequestValue = { label: string; value: string }

type ApiRequest = {
  id: number
  pdm_name: string | null
  status: string
  workflow_id?: number
  date: string | null
  values: RequestValue[]
}

function mapToMaterialRequest(r: ApiRequest): MaterialRequest {
  const isoDate = r.date ? new Date(r.date) : new Date()
  const dateStr =
    isoDate.getDate().toString().padStart(2, '0') +
    '/' +
    (isoDate.getMonth() + 1).toString().padStart(2, '0') +
    '/' +
    isoDate.getFullYear()

  const statusMap: Record<string, MaterialRequest['status']> = {
    Pending: 'pending_technical',
    pending: 'pending_technical',
    Approved: 'completed',
    approved: 'completed',
    Rejected: 'draft',
    rejected: 'draft',
    draft: 'draft',
    pending_technical: 'pending_technical',
    pending_fiscal: 'pending_fiscal',
    pending_mrp: 'pending_mrp',
    completed: 'completed',
    Completed: 'completed',
  }
  // Use raw API status when not in map so dynamic WorkflowConfig columns can match
  const status = (statusMap[r.status] ?? r.status) as MaterialRequest['status']
  const statusLabel = r.status || 'Pending'

  // If request has saved values (TEXTO, NUMERO, LISTA etc), Técnico is 100%
  const hasTechnicalValues = !!(r.values && r.values.length > 0)
  const technicalPercent = hasTechnicalValues ? 100 : 0

  return {
    id: String(r.id),
    requestId: `REQ-${r.id}`,
    materialName: r.pdm_name ?? '—',
    pdmCode: '',
    category: '',
    requester: '',
    requesterAvatar: '—',
    date: dateStr,
    urgency: 'low',
    status,
    statusLabel,
    enrichment: [
      { label: 'Técnico', key: 'technical', percent: technicalPercent },
      { label: 'Fiscal', key: 'fiscal', percent: 0 },
      { label: 'MRP', key: 'mrp', percent: 0 },
    ],
    description: '',
  }
}

function filterRequests(
  requests: MaterialRequest[],
  search: string,
  category: string,
  dateRange: string
): MaterialRequest[] {
  let filtered = [...requests]
  const q = search.trim().toLowerCase()
  if (q) {
    filtered = filtered.filter(
      (r) =>
        r.materialName.toLowerCase().includes(q) ||
        r.requestId.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    )
  }
  if (category !== 'all') {
    filtered = filtered.filter((r) => r.category.toLowerCase() === category.toLowerCase())
  }
  if (dateRange !== 'all') {
    const today = new Date()
    const dayMs = 24 * 60 * 60 * 1000
    filtered = filtered.filter((r) => {
      const parts = r.date.split('/')
      if (parts.length !== 3) return true
      const [d, m, y] = parts.map(Number)
      const reqDate = new Date(y, m - 1, d)
      const diffDays = Math.floor((today.getTime() - reqDate.getTime()) / dayMs)
      if (dateRange === 'today') return diffDays === 0
      if (dateRange === 'week') return diffDays <= 7
      if (dateRange === 'month') return diffDays <= 30
      if (dateRange === 'quarter') return diffDays <= 90
      return true
    })
  }
  return filtered
}

export default function GovernancePage() {
  const [workflows, setWorkflows] = useState<WorkflowHeader[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [requests, setRequests] = useState<ApiRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [dateRange, setDateRange] = useState('all')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<ApiRequest | null>(null)
  const [approveRejectLoading, setApproveRejectLoading] = useState(false)

  useEffect(() => {
    apiGet<WorkflowHeader[]>('/api/workflows')
      .then((list) => {
        setWorkflows(list)
        if (list.length > 0) {
          const active = list.find((w) => w.is_active) ?? list[0]
          setSelectedWorkflowId(active.id)
        }
      })
      .catch(() => setWorkflows([]))
  }, [])

  const fetchRequests = useCallback((): Promise<void> => {
    setLoading(true)
    const url = selectedWorkflowId
      ? `/api/requests?workflow_id=${selectedWorkflowId}`
      : '/api/requests'
    return apiGet<ApiRequest[]>(url)
      .then(setRequests)
      .catch(() => setRequests([]))
      .finally(() => setLoading(false))
  }, [selectedWorkflowId])

  useEffect(() => {
    if (selectedWorkflowId !== null) fetchRequests()
  }, [selectedWorkflowId, fetchRequests])

  const materialRequests = useMemo(
    () => requests.map(mapToMaterialRequest),
    [requests]
  )

  const filteredRequests = useMemo(
    () => filterRequests(materialRequests, search, category, dateRange),
    [materialRequests, search, category, dateRange]
  )

  const handleViewDetails = (id: string) => {
    const req = requests.find((r) => String(r.id) === id)
    setSelectedRequest(req ?? null)
    setDetailsOpen(true)
  }

  const handleAprovar = async (id: number) => {
    if (approveRejectLoading) return
    setApproveRejectLoading(true)
    try {
      await apiPatch(`/api/requests/${id}/status`, { action: 'approve' })
      toast.success('Solicitação aprovada com sucesso!')
      setDetailsOpen(false)
      setSelectedRequest(null)
      await fetchRequests()
    } catch {
      toast.error('Falha ao aprovar solicitação')
    } finally {
      setApproveRejectLoading(false)
    }
  }

  const handleRejeitar = async (id: number) => {
    if (approveRejectLoading) return
    setApproveRejectLoading(true)
    try {
      await apiPatch(`/api/requests/${id}/reject`, {})
      toast.success('Solicitação rejeitada com sucesso!')
      setDetailsOpen(false)
      setSelectedRequest(null)
      await fetchRequests()
    } catch {
      toast.error('Falha ao rejeitar solicitação')
    } finally {
      setApproveRejectLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#F1F5F9] dark:bg-transparent">
      {/* Header – dark bar with white title in light mode */}
      <header className="mx-auto max-w-7xl px-4 py-4 md:px-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/60 bg-[#0F1C38] px-6 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_4px_12px_-2px_rgba(0,0,0,0.06)] dark:rounded-none dark:border-0 dark:border-b dark:border-zinc-700/50 dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1.5 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft className="size-4" />
                INÍCIO
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-white">
                Governança de Dados
              </h1>
              <p className="text-sm text-white/80">
                Painel de gestão para solicitações de Cadastro de Materiais.
              </p>
            </div>
          </div>
          <Link href="/request">
            <Button
              className="gap-2 transition-colors duration-200 border-[#C69A46] bg-[#C69A46] text-[#0F1C38] hover:bg-[#C69A46]/90"
            >
              <FilePlus className="size-4" />
              Nova Solicitação
            </Button>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-6 md:p-8">

        <div className="space-y-6">
          {/* Stats Summary – white container */}
          <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.04)] dark:rounded-2xl dark:border-zinc-400/40 dark:bg-zinc-400/30 dark:shadow-none">
            <StatsSummary requests={materialRequests} variant="governance" />
          </div>

          {/* Card container – white with subtle gray border and shadow */}
          <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white pt-0 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.04)] dark:bg-zinc-400/30 dark:border-zinc-400/40 dark:shadow-none">
            {/* Section header bar – no workflow selector */}
            <div className="flex h-8 min-h-8 items-center justify-between gap-4 px-6 py-1 rounded-t-2xl bg-[#192D50] dark:bg-transparent dark:rounded-none">
              <h2 className="text-base font-semibold uppercase text-white dark:text-foreground dark:text-[#C69A46]">
                Solicitações de Cadastro
              </h2>
            </div>
            <div className="p-4 md:p-6">
            <FiltersBar
              search={search}
              onSearchChange={setSearch}
              category={category}
              onCategoryChange={setCategory}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              view={view}
              onViewChange={setView}
              resultCount={filteredRequests.length}
            />

            <div className="mt-6">
              {loading ? (
                <p className="uppercase text-muted-foreground">Carregando solicitações...</p>
              ) : filteredRequests.length === 0 ? (
                <EmptyColumn message="Nenhuma solicitação encontrada com os filtros atuais." />
              ) : view === 'kanban' ? (
                <KanbanBoard
                  requests={filteredRequests}
                  workflowId={selectedWorkflowId}
                  onViewDetails={handleViewDetails}
                />
              ) : (
                <ListView
                  requests={filteredRequests}
                  onViewDetails={handleViewDetails}
                />
              )}
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl border-slate-200 bg-white text-slate-900 dark:border-zinc-700/50 dark:bg-card dark:text-foreground">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-[#C69A46]">
              Detalhes — REQ-{selectedRequest?.id} ({selectedRequest?.pdm_name ?? '—'})
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <>
              <p className="mb-3 text-sm text-slate-600 dark:text-muted-foreground">
                Atributos técnicos (TEXTO, NUMERO, LISTA, etc.)
              </p>
              {selectedRequest.values && selectedRequest.values.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-zinc-700/50">
                  <table className="w-full text-sm">
                    <tbody>
                      {selectedRequest.values.map((v, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-slate-200 last:border-b-0 dark:border-zinc-700/40"
                        >
                          <td className="w-[45%] bg-slate-50 px-4 py-3 font-medium text-slate-800 dark:bg-muted/30 dark:text-foreground">
                            {v.label}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-muted-foreground">
                            {v.value || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-600 dark:text-muted-foreground">
                  Nenhum atributo preenchido
                </p>
              )}
              <DialogFooter>
                <Button
                  size="sm"
                  disabled={approveRejectLoading}
                  className="gap-2 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:text-white dark:hover:bg-green-700"
                  onClick={() => handleAprovar(selectedRequest.id)}
                >
                  <Check className="size-4" />
                  Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={approveRejectLoading}
                  className="gap-2 bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
                  onClick={() => handleRejeitar(selectedRequest.id)}
                >
                  <X className="size-4" />
                  Rejeitar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Toaster position="top-right" richColors />
    </main>
  )
}
