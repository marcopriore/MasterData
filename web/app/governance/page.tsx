'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { apiGet, apiGetWithAuth, apiPatchWithAuth } from '@/lib/api'
import { KanbanBoard } from '@/components/governance/kanban-board'
import { ListView } from '@/components/governance/list-view'
import { FiltersBar } from '@/components/governance/filters-bar'
import { StatsSummary, type GovernanceStats } from '@/components/governance/stats-summary'
import { EmptyColumn } from '@/components/governance/request-card'
import type { MaterialRequest } from '@/components/governance/request-card'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Toaster, toast } from 'sonner'
import { useUser } from '@/contexts/user-context'
import { ChevronLeft, FilePlus, Check, X, Save, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { applyFieldMask, FIELD_MASKS } from '@/lib/masks'
import { formatAttrValue } from '@/lib/format-attr-value'
import { NumericUnitInput } from '@/components/ui/numeric-unit-input'
import { useMeasurementUnits } from '@/hooks/useMeasurementUnits'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DescriptionLengthIndicator } from '@/components/ui/description-length-indicator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type HistoryEvent = {
  id: number
  event_type: string
  message: string
  event_data: Record<string, unknown> | null
  stage: string | null
  created_at: string | null
  user_name: string | null
}

type MyField = {
  id: number
  field_name: string
  field_label: string
  sap_field: string | null
  sap_view: string
  field_type: 'text' | 'number' | 'date' | 'select'
  options: string[] | Record<string, unknown> | null
  responsible_role: string
  is_required: boolean
  is_active: boolean
  display_order: number
  created_at: string | null
}

type FieldLabelItem = { field_name: string; field_label: string }

type WorkflowHeader = {
  id: number
  name: string
  description?: string | null
  is_active: boolean
}

type RequestValue = { label: string; value: string }

type ApiRequest = {
  id: number
  id_sistema?: string | null
  pdm_id: number
  pdm_name: string | null
  status: string
  workflow_id: number
  requester: string
  cost_center: string | null
  urgency: 'low' | 'medium' | 'high'
  justification: string | null
  generated_description: string | null
  technical_attributes: Record<string, string | { value: string; unit?: string }> | null
  attachments: string[] | null
  date: string | null
  values: RequestValue[]
  assigned_to_id?: number | null
  assigned_to_name?: string | null
  pdm_attributes?: Record<string, { label: string; type: string; options: string[] }>
}

function mapToMaterialRequest(r: ApiRequest): MaterialRequest {
  const isoDate = r.date ? new Date(r.date) : new Date()
  const dateStr =
    isoDate.getDate().toString().padStart(2, '0') +
    '/' +
    (isoDate.getMonth() + 1).toString().padStart(2, '0') +
    '/' +
    isoDate.getFullYear()

  // Derive initials for the avatar from the requester name
  const initials = (r.requester || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

  return {
    id: String(r.id),
    requestId: `REQ-${String(r.id).padStart(4, '0')}`,
    materialName: r.pdm_name ?? '—',
    pdmCode: r.pdm_name ?? '',
    pdm_id: r.pdm_id,
    category: r.cost_center ?? '',
    requester: r.requester || '—',
    requesterAvatar: initials || '?',
    date: dateStr,
    urgency: r.urgency ?? 'low',
    status: r.status as MaterialRequest['status'],
    statusLabel: r.status,
    generated_description: r.generated_description ?? '',
    assigned_to_id: r.assigned_to_id ?? null,
    assigned_to_name: r.assigned_to_name ?? null,
    enrichment: [
      { label: 'T', key: 'technical', percent: r.values?.length > 0 ? 100 : 0 },
      { label: 'F', key: 'fiscal', percent: 0 },
      { label: 'M', key: 'master', percent: 0 },
      { label: 'MRP', key: 'mrp', percent: 0 },
    ],
    description: r.generated_description ?? '',
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
    const pdmId = parseInt(category, 10)
    if (!Number.isNaN(pdmId)) {
      filtered = filtered.filter((r) => r.pdm_id === pdmId)
    } else {
      filtered = filtered.filter((r) => r.category.toLowerCase() === category.toLowerCase())
    }
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
  const { user, accessToken, ready } = useUser()
  const [workflows, setWorkflows] = useState<WorkflowHeader[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [pdms, setPdms] = useState<Array<{ id: number; name: string; internal_code: string; is_active: boolean }>>([])
  const [requests, setRequests] = useState<ApiRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [dateRange, setDateRange] = useState('all')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<ApiRequest | null>(null)
  const [approveRejectLoading, setApproveRejectLoading] = useState(false)
  const [myFields, setMyFields] = useState<MyField[]>([])
  const [fieldLabels, setFieldLabels] = useState<FieldLabelItem[]>([])
  const [attributeValues, setAttributeValues] = useState<Record<string, string | { value: string; unit: string }>>({})
  const measurementUnits = useMeasurementUnits()

  function parseNumericWithUnit(
    str: string | { value: string; unit: string } | null | undefined,
    units: { abbreviation: string }[]
  ): { value: string; unit: string } {
    if (!str) return { value: '', unit: '' }
    if (typeof str === 'object' && str !== null && 'value' in str) return str as { value: string; unit: string }
    const s = String(str).trim()
    if (!s) return { value: '', unit: '' }
    const sorted = [...units].sort((a, b) => b.abbreviation.length - a.abbreviation.length)
    for (const u of sorted) {
      if (u.abbreviation && s.endsWith(u.abbreviation)) {
        return { value: s.slice(0, -u.abbreviation.length).trim(), unit: u.abbreviation }
      }
    }
    return { value: s, unit: '' }
  }
  const [saveLoading, setSaveLoading] = useState(false)
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyFetched, setHistoryFetched] = useState(false)
  const [governanceStats, setGovernanceStats] = useState<GovernanceStats | null>(null)
  const [governanceStatsLoading, setGovernanceStatsLoading] = useState(true)

  useEffect(() => {
    if (!ready || !accessToken) {
      if (ready && !accessToken) setGovernanceStatsLoading(false)
      return
    }
    setGovernanceStatsLoading(true)
    apiGetWithAuth<GovernanceStats>('/api/governance/stats', accessToken)
      .then((data) => setGovernanceStats(data ?? null))
      .catch(() => setGovernanceStats(null))
      .finally(() => setGovernanceStatsLoading(false))
  }, [ready, accessToken])

  useEffect(() => {
    if (!accessToken) return
    apiGetWithAuth<WorkflowHeader[]>('/api/workflows', accessToken)
      .then((list) => {
        setWorkflows(list ?? [])
        if (list && list.length > 0) {
          const active = list.find((w) => w.is_active) ?? list[0]
          setSelectedWorkflowId(active.id)
        }
      })
      .catch(() => setWorkflows([]))
  }, [accessToken])

  useEffect(() => {
    if (!accessToken) return
    apiGetWithAuth<Array<{ id: number; name: string; internal_code: string; is_active: boolean }>>('/api/pdm', accessToken)
      .then((list) => setPdms((list ?? []).filter((p) => p.is_active)))
      .catch(() => setPdms([]))
  }, [accessToken])

  const fetchRequests = useCallback((): Promise<ApiRequest[]> => {
    setLoading(true)
    const url = selectedWorkflowId
      ? `/api/requests?workflow_id=${selectedWorkflowId}`
      : '/api/requests'
    return apiGetWithAuth<ApiRequest[]>(url, accessToken)
      .then((data) => {
        setRequests(data)
        return data
      })
      .catch(() => {
        setRequests([])
        return []
      })
      .finally(() => setLoading(false))
  }, [selectedWorkflowId, accessToken])

  useEffect(() => {
    if (ready && selectedWorkflowId !== null) fetchRequests()
  }, [ready, selectedWorkflowId, fetchRequests])

  const showActionButtons =
    ['etapa', 'operacional'].includes(user?.role_type ?? '') && user?.role_name !== 'ADMIN'

  const materialRequests = useMemo(
    () => requests.map(mapToMaterialRequest),
    [requests]
  )

  const filteredRequests = useMemo(
    () => filterRequests(materialRequests, search, category, dateRange),
    [materialRequests, search, category, dateRange]
  )

  const lastInitializedRequestIdRef = useRef<number | null>(null)

  const handleViewDetails = (id: string) => {
    const req = requests.find((r) => String(r.id) === id)
    setSelectedRequest(req ?? null)
    setDetailsOpen(true)
  }

  const handleAssignSuccess = useCallback(
    async (requestId: string) => {
      const data = await fetchRequests()
      const req = data.find((r) => String(r.id) === requestId)
      if (req) {
        lastInitializedRequestIdRef.current = null
        setSelectedRequest(req)
        setDetailsOpen(true)
      }
    },
    [fetchRequests]
  )

  const handleCloseModal = useCallback(() => {
    lastInitializedRequestIdRef.current = null
    setSelectedRequest(null)
    setAttributeValues({})
    setMyFields([])
    setFieldLabels([])
    setDetailsOpen(false)
  }, [])

  const isAssignedToMe =
    selectedRequest &&
    user &&
    selectedRequest.assigned_to_id != null &&
    selectedRequest.assigned_to_id === user.id

  const canEditPdmAttributes = isAssignedToMe && user?.role_name === 'CADASTRO'

  const FINAL_STATUSES = ['completed', 'finalizado', 'rejected', 'rejeitado']
  const isSelectedFinal = FINAL_STATUSES.includes((selectedRequest?.status ?? '').toLowerCase())

  const hasTechnicalAttributes =
    selectedRequest?.technical_attributes &&
    Object.keys(selectedRequest.technical_attributes).length > 0

  useEffect(() => {
    if (!detailsOpen || !selectedRequest || !accessToken) return
    setHistoryFetched(false)
    setHistoryEvents([])
    setInvalidFields(new Set())
    const currentId = selectedRequest.id
    const isNewRequest = lastInitializedRequestIdRef.current !== currentId
    lastInitializedRequestIdRef.current = currentId
    const attrs = selectedRequest.technical_attributes ?? {}
    if (isNewRequest) {
      setAttributeValues(
        Object.fromEntries(
          Object.entries(attrs).map(([k, v]) => {
            if (v == null) return [k, '']
            if (typeof v === 'object' && v !== null && 'value' in v) return [k, v as { value: string; unit: string }]
            return [k, applyFieldMask(k, String(v))]
          })
        )
      )
    }
    const assignedToMe =
      selectedRequest.assigned_to_id != null && selectedRequest.assigned_to_id === user?.id
    const hasAttrs = Object.keys(attrs).length > 0

    if (assignedToMe) {
      apiGetWithAuth<MyField[]>('/api/fields/my-fields', accessToken)
        .then(setMyFields)
        .catch(() => setMyFields([]))
    } else {
      setMyFields([])
    }

    if (hasAttrs) {
      apiGetWithAuth<FieldLabelItem[]>('/api/fields/field-labels', accessToken)
        .then(setFieldLabels)
        .catch(() => setFieldLabels([]))
    } else {
      setFieldLabels([])
    }
  }, [detailsOpen, selectedRequest, user?.id, accessToken])

  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [rejectJustification, setRejectJustification] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)

  const handleAprovar = async (id: number) => {
    if (!window.confirm('Deseja aprovar esta solicitação?')) return
    if (approveRejectLoading) return
    setApproveRejectLoading(true)
    try {
      await apiPatchWithAuth(`/api/requests/${id}/status`, { action: 'approve' }, accessToken)
      toast.success('Solicitação aprovada com sucesso!')
      handleCloseModal()
      await fetchRequests()
    } catch {
      toast.error('Falha ao aprovar solicitação')
    } finally {
      setApproveRejectLoading(false)
    }
  }

  const openRejectModal = () => {
    setRejectJustification('')
    setRejectError(null)
    setRejectModalOpen(true)
  }

  function getFieldOptions(f: MyField): string[] {
    const o = f.options
    if (Array.isArray(o)) return o.map(String)
    if (o && typeof o === 'object' && Array.isArray((o as { values?: unknown }).values))
      return ((o as { values: string[] }).values).map(String)
    return []
  }

  const validationError = invalidFields.size > 0
    ? `Campos obrigatórios: ${[...invalidFields].map((fn) => myFields.find((f) => f.field_name === fn)?.field_label ?? fn).join(', ')}`
    : null

  function validateRequiredFields(): boolean {
    const SKIP_FIELDS = ['descricao_basica'] // gerado automaticamente
    const invalid = new Set<string>()
    for (const f of myFields) {
      if (!f.is_required) continue
      if (SKIP_FIELDS.includes(f.field_name)) continue
      const raw = attributeValues[f.field_name]
      const val = typeof raw === 'string' ? (raw ?? '').trim() : (raw && typeof raw === 'object' ? (raw.value ?? '').trim() : '')
      if (!val) invalid.add(f.field_name)
    }
    setInvalidFields(invalid)
    if (invalid.size > 0) {
      toast.error('Preencha os campos obrigatórios.')
      return false
    }
    return true
  }

  function clearInvalidField(fieldName: string) {
    setInvalidFields((prev) => {
      const next = new Set(prev)
      next.delete(fieldName)
      return next
    })
  }

  function handleFieldChange(fieldName: string, rawValue: string, fieldType?: string) {
    let finalValue: string | { value: string; unit: string } = rawValue
    if (fieldType !== 'select' && fieldType !== 'date') {
      const maskFn = FIELD_MASKS[fieldName.toLowerCase()]
      if (maskFn) finalValue = maskFn(rawValue)
    }
    setAttributeValues((prev) => ({ ...prev, [fieldName]: finalValue }))
    clearInvalidField(fieldName)
  }

  function handleNumericUnitChange(fieldName: string, value: string, unit: string) {
    setAttributeValues((prev) => ({ ...prev, [fieldName]: { value, unit } }))
    clearInvalidField(fieldName)
  }

  function toPayloadAttributes(vals: Record<string, string | { value: string; unit: string }>): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(vals)) {
      if (typeof v === 'object' && v !== null && 'value' in v) {
        out[k] = `${(v as { value?: string }).value ?? ''}${(v as { unit?: string }).unit ?? ''}`.trim()
      } else {
        out[k] = String(v ?? '')
      }
    }
    return out
  }

  const handleSalvar = async () => {
    if (!selectedRequest || !accessToken) return
    setInvalidFields(new Set())
    setSaveLoading(true)
    try {
      const res = await apiPatchWithAuth<ApiRequest>(
        `/api/requests/${selectedRequest.id}/attributes`,
        { attributes: toPayloadAttributes(attributeValues) },
        accessToken
      )
      toast.success('Dados salvos!')
      const attrs = res?.technical_attributes ?? { ...selectedRequest.technical_attributes, ...attributeValues }
      const genDesc = res?.generated_description ?? selectedRequest.generated_description
      const updated = requests.map((r) =>
        r.id === selectedRequest.id
          ? { ...r, technical_attributes: attrs, generated_description: genDesc }
          : r
      )
      setRequests(updated)
      setSelectedRequest((prev) =>
        prev && prev.id === selectedRequest.id
          ? { ...prev, technical_attributes: attrs, generated_description: genDesc }
          : prev
      )
    } catch {
      toast.error('Falha ao salvar os dados')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleSalvarEAprovar = async () => {
    if (!selectedRequest || !accessToken) return
    if (!validateRequiredFields()) return
    setSaveLoading(true)
    setApproveRejectLoading(true)
    try {
      await apiPatchWithAuth(
        `/api/requests/${selectedRequest.id}/attributes`,
        { attributes: toPayloadAttributes(attributeValues) },
        accessToken
      )
      await apiPatchWithAuth(
        `/api/requests/${selectedRequest.id}/status`,
        { action: 'approve' },
        accessToken
      )
      toast.success('Dados salvos e solicitação aprovada!')
      handleCloseModal()
      await fetchRequests()
    } catch {
      toast.error('Falha ao salvar ou aprovar')
    } finally {
      setSaveLoading(false)
      setApproveRejectLoading(false)
    }
  }

  const fetchHistory = useCallback(() => {
    if (!selectedRequest || !accessToken || historyFetched || historyLoading) return
    setHistoryLoading(true)
    apiGetWithAuth<HistoryEvent[]>(`/api/requests/${selectedRequest.id}/history`, accessToken)
      .then((data) => {
        setHistoryEvents(data ?? [])
        setHistoryFetched(true)
      })
      .catch(() => setHistoryEvents([]))
      .finally(() => setHistoryLoading(false))
  }, [selectedRequest, accessToken, historyFetched, historyLoading])

  const handleRejectConfirm = async () => {
    if (!selectedRequest) return
    if (!rejectJustification.trim()) {
      setRejectError('Justificativa é obrigatória.')
      return
    }
    setApproveRejectLoading(true)
    setRejectError(null)
    try {
      await apiPatchWithAuth(
        `/api/requests/${selectedRequest.id}/reject`,
        { justification: rejectJustification.trim() },
        accessToken
      )
      toast.success('Solicitação rejeitada com sucesso!')
      setRejectModalOpen(false)
      handleCloseModal()
      await fetchRequests()
    } catch {
      setRejectError('Falha ao rejeitar solicitação')
    } finally {
      setApproveRejectLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header – dark bar with white title in light mode */}
      <header className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/60 bg-[#0F1C38] px-6 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_4px_12px_-2px_rgba(0,0,0,0.06)] dark:rounded-2xl dark:border-slate-200/10 dark:bg-[#0F1C38] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] sm:flex-row sm:items-center sm:justify-between">
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
              <h1 className="text-2xl font-semibold !text-white">
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

      <div className="mx-auto max-w-7xl mt-4">

        <div className="space-y-6">
          {/* Stats Summary – indicadores de SLA e gestão */}
          <StatsSummary
            requests={materialRequests}
            variant="governance"
            governanceStats={governanceStats}
            governanceStatsLoading={governanceStatsLoading}
          />

          {/* Card container - same as AttributesTable Card */}
          <Card className="gap-0 rounded-2xl border pt-0 dark:border-zinc-700/50">
            {/* Section header bar */}
            <div className="flex h-8 min-h-8 items-center justify-between gap-4 px-6 py-1 rounded-t-2xl bg-[#192D50]">
              <h2 className="text-base font-semibold uppercase !text-white">
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
              pdms={pdms}
            />

            <div className="mt-6 overflow-x-auto pb-2">
              {loading ? (
                <p className="uppercase text-muted-foreground">Carregando solicitações...</p>
              ) : filteredRequests.length === 0 ? (
                <EmptyColumn message="Nenhuma solicitação encontrada com os filtros atuais." />
              ) : view === 'kanban' ? (
                <KanbanBoard
                  requests={filteredRequests}
                  workflowId={selectedWorkflowId}
                  onViewDetails={handleViewDetails}
                  onStatusChanged={() => { fetchRequests() }}
                  onAssignSuccess={handleAssignSuccess}
                  showActionButtons={showActionButtons}
                  currentUserId={user?.id ?? null}
                  accessToken={accessToken}
                  currentUserRoleName={user?.role_name ?? null}
                  currentUserRoleType={user?.role_type ?? null}
                />
              ) : (
                <ListView
                  requests={filteredRequests}
                  onViewDetails={handleViewDetails}
                />
              )}
            </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Details Modal */}
      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseModal()
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden border-slate-200 bg-white p-0 text-slate-900 dark:border-zinc-700/50 dark:bg-card dark:text-foreground">
          <DialogHeader className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4 pb-2 dark:border-zinc-700/50 dark:bg-card">
            <DialogTitle className="text-slate-900 dark:text-[#C69A46]">
              REQ-{String(selectedRequest?.id).padStart(4, '0')} — {selectedRequest?.pdm_name ?? '—'}
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <>
            <Tabs
              key={selectedRequest.id}
              defaultValue="detalhes"
              className="flex flex-1 min-h-0 flex-col overflow-hidden"
              onValueChange={(v) => { if (v === 'historico') fetchHistory() }}
            >
              <div className="border-b border-slate-200 px-6 dark:border-zinc-700/50">
                <TabsList className="h-9">
                  <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
                  <TabsTrigger value="historico">Histórico</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="detalhes" className="mt-0 flex-1 min-h-0 overflow-y-auto">
              <div className="px-6 py-4 space-y-4">
              {/* Generated description */}
              {selectedRequest.generated_description && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-700/50 dark:bg-muted/20">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground mb-1">Descrição Gerada</p>
                  <code className="text-sm font-mono font-bold text-[#0F1C38] dark:text-[#C69A46] break-words">{selectedRequest.generated_description}</code>
                  <DescriptionLengthIndicator
                    description={selectedRequest.generated_description || ''}
                    maxLength={user?.max_description_length ?? 40}
                  />
                </div>
              )}

              {/* Admin info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">Solicitante</p>
                  <p className="mt-0.5 font-medium text-slate-800 dark:text-foreground">{selectedRequest.requester || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">Urgência</p>
                  <p className="mt-0.5 font-medium text-slate-800 dark:text-foreground capitalize">{selectedRequest.urgency === 'low' ? 'Baixa' : selectedRequest.urgency === 'medium' ? 'Média' : 'Alta'}</p>
                </div>
                {selectedRequest.id_sistema && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">ID Sistema</p>
                    <p className="mt-0.5 font-mono font-bold text-[#0F1C38] dark:text-[#C69A46]">{selectedRequest.id_sistema}</p>
                  </div>
                )}
              </div>

              {/* Dados Preenchidos — editável apenas para CADASTRO atribuído */}
              {hasTechnicalAttributes && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground mb-2">
                    Dados Preenchidos
                  </p>
                  {canEditPdmAttributes ? (
                    <div className="space-y-3">
                      {Object.keys(selectedRequest.technical_attributes ?? {}).map((key) => {
                        const pdmMeta = selectedRequest.pdm_attributes?.[key]
                        const label = pdmMeta?.label ?? fieldLabels.find((l) => l.field_name === key)?.field_label ?? key
                        const fieldType = pdmMeta?.type ?? 'text'
                        const options = pdmMeta?.options ?? []
                        return (
                          <div key={key}>
                            <Label htmlFor={`tech-${key}`} className="text-sm font-medium">{label}</Label>
                            {fieldType === 'select' ? (
                              <Select
                                value={typeof attributeValues[key] === 'string' ? attributeValues[key] ?? '' : (attributeValues[key] as { value?: string })?.value ?? ''}
                                onValueChange={(v) => handleFieldChange(key, v, 'select')}
                              >
                                <SelectTrigger
                                  id={`tech-${key}`}
                                  className="mt-1 w-full h-10 border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100"
                                >
                                  <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {options.map((opt: string | { value: string; abbreviation?: string; abbrev?: string; abreviacao?: string }, i: number) => {
                                    const value = typeof opt === 'object' && opt !== null && 'value' in opt ? (opt as { value: string }).value : String(opt)
                                    const abbrev = typeof opt === 'object' && opt !== null
                                      ? ((opt as { abbreviation?: string; abbrev?: string; abreviacao?: string }).abbreviation
                                          ?? (opt as { abbrev?: string }).abbrev
                                          ?? (opt as { abreviacao?: string }).abreviacao)
                                      : null
                                    return (
                                      <SelectItem key={`${value}-${i}`} value={value}>
                                        {value}
                                        {abbrev && (
                                          <span className="ml-1.5 font-mono text-[11px] text-slate-400 dark:text-zinc-500">({abbrev})</span>
                                        )}
                                      </SelectItem>
                                    )
                                  })}
                                </SelectContent>
                              </Select>
                            ) : (fieldType === 'number' || fieldType === 'numeric') && measurementUnits.length > 0 ? (
                              <div className="mt-1">
                                <NumericUnitInput
                                  value={parseNumericWithUnit(attributeValues[key], measurementUnits).value}
                                  unit={parseNumericWithUnit(attributeValues[key], measurementUnits).unit}
                                  units={measurementUnits}
                                  onChange={(val, unit) => handleNumericUnitChange(key, val, unit)}
                                  placeholder={`Informe ${(label as string).toLowerCase()}...`}
                                />
                              </div>
                            ) : fieldType === 'number' ? (
                              <Input
                                id={`tech-${key}`}
                                type="number"
                                min={0}
                                value={parseNumericWithUnit(attributeValues[key], measurementUnits).value}
                                onChange={(e) => handleFieldChange(key, e.target.value, 'number')}
                                className="mt-1"
                              />
                            ) : fieldType === 'date' ? (
                              <Input
                                id={`tech-${key}`}
                                type="date"
                                value={attributeValues[key] ?? ''}
                                onChange={(e) => handleFieldChange(key, e.target.value, 'date')}
                                className="mt-1"
                              />
                            ) : (
                              <Input
                                id={`tech-${key}`}
                                type="text"
                                value={typeof attributeValues[key] === 'object' ? (attributeValues[key] as { value?: string })?.value ?? '' : String(attributeValues[key] ?? '')}
                                onChange={(e) => handleFieldChange(key, e.target.value, 'text')}
                                className="mt-1"
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-zinc-700/50">
                      <table className="w-full text-sm">
                        <tbody>
                          {Object.entries(selectedRequest.technical_attributes ?? {}).map(
                            ([key, val]) => {
                              if (val == null || val === '') return null
                              const label =
                                fieldLabels.find((l) => l.field_name === key)?.field_label ?? key
                              return (
                                <tr
                                  key={key}
                                  className="border-b border-slate-200 last:border-b-0 dark:border-zinc-700/40"
                                >
                                  <td className="w-[45%] bg-slate-50 px-4 py-3 font-medium text-slate-800 dark:bg-muted/30 dark:text-foreground">
                                    {label}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600 dark:text-muted-foreground">
                                    {formatAttrValue(val)}
                                  </td>
                                </tr>
                              )
                            }
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Meus Campos (editáveis) — somente quando assigned_to_id === current_user.id */}
              {isAssignedToMe && myFields.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground mb-2">
                    CAMPOS DE RESPONSABILIDADE: {user?.role_name ?? '—'}
                  </p>
                  <div className="space-y-3">
                    {myFields
                      .filter((f) => f.field_name !== 'descricao_basica')
                      .map((f) => (
                      <div key={f.id}>
                        <Label htmlFor={`attr-${f.field_name}`} className="text-sm font-medium">
                          {f.field_label}
                          {f.is_required && ' *'}
                        </Label>
                        {f.field_type === 'text' && (
                          <Input
                            id={`attr-${f.field_name}`}
                            type="text"
                            value={attributeValues[f.field_name] ?? ''}
                            onChange={(e) => handleFieldChange(f.field_name, e.target.value, 'text')}
                            maxLength={100}
                            className={`mt-1 ${invalidFields.has(f.field_name) ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                          />
                        )}
                        {f.field_type === 'number' && (
                          FIELD_MASKS[f.field_name.toLowerCase()] ? (
                            <Input
                              id={`attr-${f.field_name}`}
                              type="text"
                              value={attributeValues[f.field_name] ?? ''}
                              onChange={(e) => handleFieldChange(f.field_name, e.target.value, 'number')}
                              className={`mt-1 ${invalidFields.has(f.field_name) ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                            />
                          ) : (
                            <Input
                              id={`attr-${f.field_name}`}
                              type="number"
                              min={0}
                              value={attributeValues[f.field_name] ?? ''}
                              onChange={(e) => handleFieldChange(f.field_name, e.target.value, 'number')}
                              className={`mt-1 ${invalidFields.has(f.field_name) ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                            />
                          )
                        )}
                        {f.field_type === 'date' && (
                          <Input
                            id={`attr-${f.field_name}`}
                            type="date"
                            value={attributeValues[f.field_name] ?? ''}
                            onChange={(e) => handleFieldChange(f.field_name, e.target.value, 'date')}
                            className={`mt-1 ${invalidFields.has(f.field_name) ? 'border-red-500 ring-1 ring-red-500' : ''}`}
                          />
                        )}
                        {f.field_type === 'select' && (
                          <select
                            id={`attr-${f.field_name}`}
                            value={attributeValues[f.field_name] ?? ''}
                            onChange={(e) => handleFieldChange(f.field_name, e.target.value, 'select')}
                            className={`mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm ${invalidFields.has(f.field_name) ? 'border-red-500 ring-1 ring-red-500' : 'border-input'}`}
                          >
                            <option value="">Selecione...</option>
                            {getFieldOptions(f).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              </div>
              </TabsContent>
              <TabsContent value="historico" className="mt-0 flex-1 min-h-0 overflow-y-auto">
                <div className="px-6 py-4">
                  {historyLoading ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                      <Loader2 className="size-5 animate-spin" />
                      <span>Carregando histórico...</span>
                    </div>
                  ) : historyEvents.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum evento registrado.
                    </p>
                  ) : (
                    <div className="relative space-y-0">
                      {historyEvents.map((evt, idx) => {
                        const isLast = idx === historyEvents.length - 1
                        const iconMap: Record<string, { icon: string; color: string }> = {
                          created: { icon: '📋', color: 'text-blue-600 dark:text-blue-400' },
                          assigned: { icon: '▶', color: 'text-slate-600 dark:text-slate-400' },
                          fields_saved: { icon: '💾', color: 'text-amber-600 dark:text-amber-400' },
                          approved: { icon: '✅', color: 'text-green-600 dark:text-green-400' },
                          rejected: { icon: '❌', color: 'text-red-600 dark:text-red-400' },
                          status_changed: { icon: '🔄', color: 'text-violet-600 dark:text-violet-400' },
                          action: { icon: '⚡', color: 'text-orange-600 dark:text-orange-400' },
                        }
                        const cfg = iconMap[evt.event_type] ?? { icon: '•', color: 'text-slate-500' }
                        const justification = evt.event_data && typeof evt.event_data === 'object' && 'justification' in evt.event_data
                          ? String(evt.event_data.justification)
                          : null
                        const fieldsChanged = evt.event_data && typeof evt.event_data === 'object' && 'fields_changed' in evt.event_data && evt.event_data.fields_changed
                          ? (evt.event_data.fields_changed as Record<string, string | { de: string; para: string }>)
                          : null
                        let dateStr = ''
                        if (evt.created_at) {
                          const d = new Date(evt.created_at)
                          dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
                            d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                        }
                        return (
                          <div key={evt.id} className="relative flex gap-4 pb-6">
                            {!isLast && (
                              <div
                                className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-200 dark:bg-zinc-600"
                                aria-hidden
                              />
                            )}
                            <div className={`relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-background text-base ${cfg.color}`}>
                              {cfg.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                <div>
                                  <p className="font-semibold text-slate-900 dark:text-foreground">
                                    {evt.message}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    por {evt.user_name ?? 'Sistema'}
                                    {evt.stage && `  •  Etapa: ${evt.stage}`}
                                  </p>
                                  {justification && (
                                    <blockquote className="mt-2 border-l-2 border-slate-200 pl-3 text-sm text-muted-foreground dark:border-zinc-600">
                                      {justification}
                                    </blockquote>
                                  )}
                                  {fieldsChanged && Object.keys(fieldsChanged).length > 0 && (
                                    <div className="mt-2 rounded-lg bg-gray-50 p-2 text-sm dark:bg-muted/50">
                                      {Object.entries(fieldsChanged).map(([label, val]) => {
                                        const isDePara = typeof val === 'object' && val !== null && 'de' in val && 'para' in val
                                        return (
                                          <div key={label} className="flex gap-2 text-xs">
                                            <span className="min-w-[120px] shrink-0 font-medium text-slate-800 dark:text-foreground">{label}</span>
                                            {isDePara ? (
                                              <>
                                                <span className="max-w-[100px] truncate text-gray-400 line-through dark:text-muted-foreground">
                                                  {String(val.de).length > 40 ? `${String(val.de).slice(0, 40)}...` : val.de}
                                                </span>
                                                <span className="shrink-0 text-gray-400 dark:text-muted-foreground">→</span>
                                                <span className="max-w-[120px] truncate text-gray-800 dark:text-foreground">
                                                  {String(val.para).length > 40 ? `${String(val.para).slice(0, 40)}...` : val.para}
                                                </span>
                                              </>
                                            ) : (
                                              <span className="text-slate-600 dark:text-muted-foreground">
                                                {String(val).length > 40 ? `${String(val).slice(0, 40)}...` : val}
                                              </span>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {dateStr}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

              <DialogFooter className="sticky bottom-0 flex-col items-stretch gap-2 border-t border-slate-200 bg-white px-6 py-4 pt-2 dark:border-zinc-700/50 dark:bg-card">
                {showActionButtons && isAssignedToMe && !isSelectedFinal && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCloseModal}
                      disabled={saveLoading || approveRejectLoading}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={saveLoading || approveRejectLoading}
                      className="gap-2 bg-[#0F1C38] hover:bg-[#162444]"
                      onClick={handleSalvar}
                    >
                      <Save className="size-4" />
                      Salvar
                    </Button>
                    <Button
                      size="sm"
                      disabled={saveLoading || approveRejectLoading}
                      className="gap-2 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:text-white dark:hover:bg-green-700"
                      onClick={handleSalvarEAprovar}
                    >
                      <Check className="size-4" />
                      Salvar e Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={saveLoading || approveRejectLoading}
                      className="gap-2 bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
                      onClick={openRejectModal}
                    >
                      <X className="size-4" />
                      Rejeitar
                    </Button>
                  </div>
                )}
                {validationError && (
                  <p className="text-sm text-destructive">{validationError}</p>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Rejeição com justificativa obrigatória */}
      <Dialog
        open={rejectModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRejectModalOpen(false)
            setRejectError(null)
          }
        }}
      >
        <DialogContent className="max-w-md border-slate-200 bg-white text-slate-900 shadow-xl dark:border-zinc-700/50 dark:bg-card dark:text-foreground">
          <DialogHeader>
            <DialogTitle>
              Confirmar Rejeição — REQ-{String(selectedRequest?.id ?? '').padStart(4, '0')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Informe a justificativa da reprovação para a solicitação REQ-
              {String(selectedRequest?.id ?? '').padStart(4, '0')}.
            </p>
            <div>
              <label className="text-sm font-medium block mb-2">
                Justificativa da reprovação (obrigatória)
              </label>
              <textarea
                value={rejectJustification}
                onChange={(e) => setRejectJustification(e.target.value)}
                maxLength={500}
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Informe a justificativa..."
                disabled={approveRejectLoading}
              />
            </div>
            {rejectError && (
              <p className="text-sm text-destructive">{rejectError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectModalOpen(false)}
              disabled={approveRejectLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRejectConfirm}
              disabled={approveRejectLoading || !rejectJustification.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {approveRejectLoading ? 'Processando…' : 'Confirmar Rejeição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster position="top-right" richColors />
    </div>
  )
}
