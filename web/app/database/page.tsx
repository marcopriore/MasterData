'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiGet, apiGetWithAuth, apiPostWithAuth, apiUploadWithAuth, apiDownloadWithAuth } from '@/lib/api'
import { useUser } from '@/contexts/user-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Database,
  Loader2,
  Search,
  Settings2,
  Filter,
  X,
  Upload,
  FileSpreadsheet,
  FileDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { useTheme } from 'next-themes'

const statusBadgeStyle: Record<string, { light: React.CSSProperties; dark: React.CSSProperties }> = {
  Ativo: {
    light: { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' },
    dark: { background: 'rgba(22,101,52,0.3)', color: '#4ade80', border: '1px solid #166534' },
  },
  Bloqueado: {
    light: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
    dark: { background: 'rgba(153,27,27,0.3)', color: '#f87171', border: '1px solid #991b1b' },
  },
  Obsoleto: {
    light: { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' },
    dark: { background: 'rgba(55,65,81,0.5)', color: '#9ca3af', border: '1px solid #374151' },
  },
}

const erpBadgeStyle: Record<string, { light: React.CSSProperties; dark: React.CSSProperties }> = {
  pendente_erp: {
    light: { background: '#fefce8', color: '#854d0e', border: '1px solid #fde047' },
    dark: { background: 'rgba(120,53,15,0.3)', color: '#fbbf24', border: '1px solid #78350f' },
  },
  integrado: {
    light: { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' },
    dark: { background: 'rgba(22,101,52,0.3)', color: '#4ade80', border: '1px solid #166534' },
  },
}

type MaterialItem = {
  id: number
  sap_code: string
  description: string
  status: string
  pdm_code: string | null
  pdm_name: string | null
  material_group: string | null
  unit_of_measure: string | null
  ncm: string | null
  material_type: string | null
  erp_status: string | null
  standardized_at: string | null
  created_at: string | null
}

type MaterialsResponse = {
  total: number
  page: number
  limit: number
  items: MaterialItem[]
}

type PDMTemplate = { id: number; name: string; internal_code: string }

const COLUMN_KEYS = {
  sap_code: 'Código ERP',
  description: 'Descrição',
  status: 'Status',
  pdm_code: 'Código PDM',
  created_at: 'Data de Criação',
  material_group: 'Grupo de Mercadorias',
  unit_of_measure: 'Unidade de Medida',
  ncm: 'NCM',
  material_type: 'Tipo de Material',
} as const

const VISIBLE_BY_DEFAULT = new Set(['sap_code', 'description', 'status', 'pdm_code', 'created_at'])
const OPTIONAL_COLUMNS = ['material_group', 'unit_of_measure', 'ncm', 'material_type'] as const

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'Ativo', label: 'Ativo' },
  { value: 'Bloqueado', label: 'Bloqueado' },
  { value: 'Obsoleto', label: 'Obsoleto' },
] as const

const ERP_STATUS_OPTIONS = [
  { value: '', label: 'Status ERP: Todos' },
  { value: 'pendente_erp', label: 'Pendente ERP' },
  { value: 'integrado', label: 'Integrado' },
] as const

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function DatabasePage() {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const { accessToken, can } = useUser()
  const [items, setItems] = useState<MaterialItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const limit = 50
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [pdmCode, setPdmCode] = useState('')
  const [erpFilter, setErpFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedStatus, setAppliedStatus] = useState('')
  const [appliedPdm, setAppliedPdm] = useState('')
  const [appliedErpFilter, setAppliedErpFilter] = useState('')
  const [appliedDateFrom, setAppliedDateFrom] = useState('')
  const [appliedDateTo, setAppliedDateTo] = useState('')

  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showErpModal, setShowErpModal] = useState(false)
  const [integrating, setIntegrating] = useState(false)
  const [erpModalError, setErpModalError] = useState<string | null>(null)

  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(VISIBLE_BY_DEFAULT))
  const [pdms, setPdms] = useState<PDMTemplate[]>([])

  const showStandardizeActions = can('can_standardize')
  const showBulkImport = can('can_bulk_import')
  const showExport = can('can_view_database')

  const [exporting, setExporting] = useState(false)

  const handleExportExcel = async () => {
    if (!accessToken) return
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (appliedSearch) params.set('q', appliedSearch)
      if (appliedStatus) params.set('status', appliedStatus)
      if (appliedPdm) params.set('pdm_code', appliedPdm)
      if (appliedErpFilter) params.set('erp_status', appliedErpFilter)
      if (appliedDateFrom) params.set('date_from', appliedDateFrom)
      if (appliedDateTo) params.set('date_to', appliedDateTo)
      const qs = params.toString()
      const path = `/api/database/materials/export${qs ? `?${qs}` : ''}`
      await apiDownloadWithAuth(path, accessToken, 'materiais_export.xlsx')
      toast.success('Exportação concluída!')
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Falha ao exportar')
    } finally {
      setExporting(false)
    }
  }

  // Bulk import modal state
  const [showBulkImportModal, setShowBulkImportModal] = useState(false)
  const [bulkImportStep, setBulkImportStep] = useState(1)
  const [bulkImportFile, setBulkImportFile] = useState<File | null>(null)
  const [bulkImportResult, setBulkImportResult] = useState<{
    total_rows: number
    valid_rows: number
    error_rows: number
    warning_rows: number
    rows: Array<{
      row_number: number
      operacao: string
      codigo_material: string | null
      descricao: string | null
      status: 'ok' | 'warning' | 'error'
      errors: string[]
      warnings: string[]
      data: Record<string, unknown>
    }>
  } | null>(null)
  const [bulkImportDownloading, setBulkImportDownloading] = useState(false)
  const [bulkImportValidating, setBulkImportValidating] = useState(false)
  const [bulkImportConfirming, setBulkImportConfirming] = useState(false)
  const [bulkImportError, setBulkImportError] = useState<string | null>(null)
  const [bulkImportDragging, setBulkImportDragging] = useState(false)

  const closeBulkImportModal = () => {
    setShowBulkImportModal(false)
    setBulkImportStep(1)
    setBulkImportFile(null)
    setBulkImportResult(null)
    setBulkImportError(null)
  }

  const handleDownloadTemplate = async () => {
    if (!accessToken) return
    setBulkImportDownloading(true)
    try {
      await apiDownloadWithAuth(
        '/api/database/materials/import-template',
        accessToken,
        'template_importacao_materiais.xlsx'
      )
      toast.success('Template baixado com sucesso!')
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Falha ao baixar template')
    } finally {
      setBulkImportDownloading(false)
    }
  }

  const handleValidateFile = async () => {
    if (!accessToken || !bulkImportFile) return
    setBulkImportValidating(true)
    setBulkImportError(null)
    try {
      const res = await apiUploadWithAuth<{
        dry_run: boolean
        total_rows: number
        valid_rows: number
        error_rows: number
        warning_rows: number
        rows: Array<{
          row_number: number
          operacao: string
          codigo_material: string | null
          descricao: string | null
          status: 'ok' | 'warning' | 'error'
          errors: string[]
          warnings: string[]
          data: Record<string, unknown>
        }>
      }>(
        '/api/database/materials/import?dry_run=true',
        bulkImportFile,
        accessToken
      )
      setBulkImportResult(res)
      setBulkImportStep(3)
    } catch (err) {
      setBulkImportError((err as Error)?.message ?? 'Falha ao validar planilha')
    } finally {
      setBulkImportValidating(false)
    }
  }

  const handleConfirmImport = async () => {
    if (!accessToken || !bulkImportFile || !bulkImportResult || bulkImportResult.error_rows > 0) return
    setBulkImportConfirming(true)
    setBulkImportError(null)
    try {
      const res = await apiUploadWithAuth<{ created: number; updated: number }>(
        '/api/database/materials/import?dry_run=false',
        bulkImportFile,
        accessToken
      )
      closeBulkImportModal()
      fetchMaterials()
      toast.success(`${res.created} criados, ${res.updated} atualizados!`)
    } catch (err) {
      setBulkImportError((err as Error)?.message ?? 'Falha ao importar materiais')
    } finally {
      setBulkImportConfirming(false)
    }
  }

  const hasCriticalErrors = (bulkImportResult?.error_rows ?? 0) > 0
  const createCount = bulkImportResult?.rows.filter((r) => r.operacao === 'C' && r.status !== 'error').length ?? 0
  const updateCount = bulkImportResult?.rows.filter((r) => r.operacao === 'E' && r.status !== 'error').length ?? 0

  const fetchMaterials = useCallback(() => {
    if (!accessToken) return
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    if (appliedSearch) params.set('q', appliedSearch)
    if (appliedStatus) params.set('status', appliedStatus)
    if (appliedPdm) params.set('pdm_code', appliedPdm)
    if (appliedErpFilter) params.set('erp_status', appliedErpFilter)
    if (appliedDateFrom) params.set('date_from', appliedDateFrom)
    if (appliedDateTo) params.set('date_to', appliedDateTo)
    const url = `/api/database/materials?${params.toString()}`
    apiGetWithAuth<MaterialsResponse>(url, accessToken)
      .then((data) => {
        setItems(data.items ?? [])
        setTotal(data.total ?? 0)
      })
      .catch(() => {
        setItems([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [accessToken, page, limit, appliedSearch, appliedStatus, appliedPdm, appliedErpFilter, appliedDateFrom, appliedDateTo])

  useEffect(() => {
    apiGet<PDMTemplate[]>('/api/pdm')
      .then((list) => setPdms(list ?? []))
      .catch(() => setPdms([]))
  }, [])

  useEffect(() => {
    fetchMaterials()
  }, [fetchMaterials])

  const handleFilter = () => {
    setAppliedSearch(search.trim())
    setAppliedStatus(status)
    setAppliedPdm(pdmCode)
    setAppliedErpFilter(erpFilter)
    setAppliedDateFrom(dateFrom)
    setAppliedDateTo(dateTo)
    setSelectedIds([])
    setPage(1)
  }

  const handleClear = () => {
    setSearch('')
    setStatus('')
    setPdmCode('')
    setErpFilter('')
    setDateFrom('')
    setDateTo('')
    setAppliedSearch('')
    setAppliedStatus('')
    setAppliedPdm('')
    setAppliedErpFilter('')
    setAppliedDateFrom('')
    setAppliedDateTo('')
    setSelectedIds([])
    setPage(1)
  }

  const pendenteIdsOnPage = items.filter((r) => r.erp_status === 'pendente_erp').map((r) => r.id)
  const allPendenteSelected = pendenteIdsOnPage.length > 0 && pendenteIdsOnPage.every((id) => selectedIds.includes(id))

  const toggleSelectAll = () => {
    if (allPendenteSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pendenteIdsOnPage.includes(id)))
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        pendenteIdsOnPage.forEach((id) => next.add(id))
        return Array.from(next)
      })
    }
  }

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const row = items.find((r) => r.id === id)
    if (row?.erp_status !== 'pendente_erp') return
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const removeFromSelection = (id: number) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id))
  }

  const handleConfirmErpIntegrate = async () => {
    if (!accessToken || selectedIds.length === 0) return
    setIntegrating(true)
    setErpModalError(null)
    try {
      const res = await apiPostWithAuth<{ integrated: number[]; skipped: number[]; total: number }>(
        '/api/database/materials/erp-integrate',
        { material_ids: selectedIds },
        accessToken
      )
      setShowErpModal(false)
      setSelectedIds([])
      fetchMaterials()
      toast.success(`${res.integrated?.length ?? res.total ?? selectedIds.length} materiais integrados com sucesso!`)
    } catch (err) {
      setErpModalError((err as Error)?.message ?? 'Falha ao integrar materiais')
    } finally {
      setIntegrating(false)
    }
  }

  const toggleColumn = (key: string) => {
    if (key === 'sap_code' || key === 'description') return
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const displayColumns = Array.from(visibleCols).filter((k) => k in COLUMN_KEYS)

  return (
    <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-foreground">
            <Database className="size-6" />
            Base de Dados de Materiais
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulte os materiais cadastrados na base
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              disabled={exporting}
              className="gap-2"
            >
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
              Exportar Excel
            </Button>
          )}
          {showBulkImport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkImportModal(true)}
              className="gap-2"
            >
              <FileSpreadsheet className="size-4" />
              Importação em Massa
            </Button>
          )}
          {showStandardizeActions && selectedIds.length > 0 && (
            <Button
              size="sm"
              onClick={() => setShowErpModal(true)}
              className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
            >
              <Upload className="size-4" />
              Integrar com ERP ({selectedIds.length})
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings2 className="size-4" />
                Colunas
              </Button>
            </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
              Colunas sempre visíveis
            </div>
            <DropdownMenuCheckboxItem checked disabled>
              Código ERP
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked disabled>
              Descrição
            </DropdownMenuCheckboxItem>
            <div className="border-t px-2 py-1.5 mt-1 text-xs font-semibold text-muted-foreground">
              Colunas opcionais
            </div>
            {OPTIONAL_COLUMNS.map((key) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={visibleCols.has(key)}
                onCheckedChange={() => toggleColumn(key)}
              >
                {COLUMN_KEYS[key]}
              </DropdownMenuCheckboxItem>
            ))}
            <div className="border-t px-2 py-1.5 mt-1 text-xs font-semibold text-muted-foreground">
              Padrão
            </div>
            {(['status', 'pdm_code', 'created_at'] as const).map((key) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={visibleCols.has(key)}
                onCheckedChange={() => toggleColumn(key)}
              >
                {COLUMN_KEYS[key]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-700/50 dark:bg-card">
        {/* Filtros */}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-1 min-w-[200px] flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por código ou descrição..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm min-w-[130px]"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">PDM</label>
            <select
              value={pdmCode}
              onChange={(e) => setPdmCode(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm min-w-[140px]"
            >
              <option value="">Todos</option>
              {pdms.map((p) => (
                <option key={p.id} value={p.internal_code}>{p.internal_code}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Status ERP</label>
            <select
              value={erpFilter}
              onChange={(e) => {
                setErpFilter(e.target.value)
                setSelectedIds([])
              }}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm min-w-[150px]"
            >
              {ERP_STATUS_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data de</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-[140px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data até</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-[140px]"
            />
          </div>
          <Button size="sm" onClick={handleFilter} className="gap-2">
            <Filter className="size-4" />
            Buscar
          </Button>
          <Button size="sm" variant="outline" onClick={handleClear} className="gap-2">
            <X className="size-4" />
            Limpar
          </Button>
        </div>

        {/* Total */}
        <p className="mb-3 text-sm text-muted-foreground">
          {total} materiais encontrados
        </p>

        {/* Tabela */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-zinc-700/50">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>Carregando materiais...</span>
            </div>
          ) : items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nenhum material encontrado.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700/50 dark:bg-muted/30">
                  {showStandardizeActions && (
                    <th className="w-10 px-2 py-3">
                      <input
                        type="checkbox"
                        checked={allPendenteSelected}
                        onChange={toggleSelectAll}
                        className="size-4 rounded border-zinc-300 dark:border-zinc-600 text-violet-600 focus:ring-violet-500"
                      />
                    </th>
                  )}
                  {displayColumns.map((key) => (
                    <th
                      key={key}
                      className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-foreground"
                    >
                      {COLUMN_KEYS[key as keyof typeof COLUMN_KEYS]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-slate-200 transition-colors hover:bg-slate-50 dark:border-zinc-700/40 dark:hover:bg-muted/30"
                    onClick={() => router.push(`/database/${row.id}`)}
                  >
                    {showStandardizeActions && (
                      <td
                        className="w-10 px-2 py-3"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSelect(row.id, e)
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          disabled={row.erp_status !== 'pendente_erp'}
                          readOnly
                          tabIndex={row.erp_status === 'pendente_erp' ? 0 : -1}
                          className={`size-4 rounded border-zinc-300 dark:border-zinc-600 text-violet-600 focus:ring-violet-500 ${
                            row.erp_status !== 'pendente_erp' ? 'opacity-50 cursor-default' : 'cursor-pointer'
                          }`}
                        />
                      </td>
                    )}
                    {displayColumns.map((key) => {
                      if (key === 'status') {
                        const statusStyle = statusBadgeStyle[row.status]
                        const statusCss = statusStyle ? (isDark ? statusStyle.dark : statusStyle.light) : (isDark ? { background: 'rgba(55,65,81,0.5)', color: '#9ca3af', border: '1px solid #374151' } : { background: '#e5e7eb', color: '#374151', border: '1px solid #d1d5db' })
                        const erpStyle = row.erp_status && erpBadgeStyle[row.erp_status] ? (isDark ? erpBadgeStyle[row.erp_status].dark : erpBadgeStyle[row.erp_status].light) : null
                        return (
                          <td key={key} className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium" style={statusCss}>
                                {row.status}
                              </span>
                              {row.erp_status === 'pendente_erp' && erpStyle && (
                                <span className="text-xs px-2 py-0.5 rounded-full border font-medium" style={erpStyle}>
                                  Pendente ERP
                                </span>
                              )}
                              {row.erp_status === 'integrado' && erpStyle && (
                                <span className="text-xs px-2 py-0.5 rounded-full border font-medium" style={erpStyle}>
                                  Integrado
                                </span>
                              )}
                            </div>
                          </td>
                        )
                      }
                      if (key === 'created_at') {
                        return (
                          <td key={key} className="px-4 py-3 text-muted-foreground">
                            {formatDate(row.created_at)}
                          </td>
                        )
                      }
                      const val = row[key as keyof MaterialItem]
                      return (
                        <td key={key} className="px-4 py-3">
                          {val != null && String(val).trim() ? String(val) : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginação */}
        {items.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Mostrando {items.length} de {total} registros
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de confirmação de integração ERP */}
      {showErpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Integrar Materiais com ERP
                </h2>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  Revise os itens selecionados antes de confirmar a integração.
                </p>
              </div>
              {!integrating && (
                <button
                  onClick={() => setShowErpModal(false)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
                >
                  <X className="size-5" />
                </button>
              )}
            </div>

            {/* Body — lista de materiais selecionados */}
            <div className="max-h-64 overflow-y-auto px-6 py-4">
              {erpModalError && (
                <p className="mb-4 text-sm text-red-600 dark:text-red-400">
                  {erpModalError}
                </p>
              )}
              <ul className="space-y-2">
                {selectedIds.map((id) => {
                  const m = items.find((r) => r.id === id)
                  if (!m) return null
                  return (
                    <li
                      key={id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {m.sap_code} — {m.description}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Última padronização: {m.standardized_at
                            ? new Date(m.standardized_at).toLocaleDateString('pt-BR')
                            : '—'}
                        </p>
                      </div>
                      {!integrating && (
                        <button
                          onClick={() => {
                            removeFromSelection(id)
                            if (selectedIds.length <= 1) setShowErpModal(false)
                          }}
                          className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300 transition-colors"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {selectedIds.length} {selectedIds.length === 1 ? 'material será integrado' : 'materiais serão integrados'}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowErpModal(false)}
                  disabled={integrating}
                  className="border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmErpIntegrate}
                  disabled={integrating || selectedIds.length === 0}
                  className="bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
                >
                  {integrating ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Integrando...
                    </>
                  ) : (
                    'Confirmar Integração'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importação em Massa */}
      {showBulkImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/60 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            {/* Header fixo */}
            <div className="flex items-start justify-between border-b border-zinc-200 px-6 py-4 shrink-0 dark:border-zinc-700">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Importação em Massa de Materiais
                </h2>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  Etapa {bulkImportStep} de 3
                </p>
              </div>
              <button
                onClick={closeBulkImportModal}
                disabled={bulkImportValidating || bulkImportConfirming}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Conteúdo com scroll */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* Etapa 1 */}
              {bulkImportStep === 1 && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">Regras principais:</p>
                    <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                      <li>A planilha deve ter uma aba chamada &quot;Materiais&quot;</li>
                      <li>Coluna &quot;operacao&quot;: C para criar, E para editar</li>
                      <li>Para edição (E): código do material é obrigatório</li>
                      <li>Para criação (C): descrição e código PDM são obrigatórios</li>
                      <li>Não alterar os nomes das colunas do cabeçalho</li>
                    </ul>
                  </div>
                  <Button
                    onClick={handleDownloadTemplate}
                    disabled={bulkImportDownloading}
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {bulkImportDownloading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Baixando...
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="size-4" />
                        Baixar Planilha Template
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Etapa 2 */}
              {bulkImportStep === 2 && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setBulkImportDragging(true)
                    }}
                    onDragLeave={() => setBulkImportDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setBulkImportDragging(false)
                      const f = e.dataTransfer.files[0]
                      if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
                        setBulkImportFile(f)
                      } else {
                        toast.error('Apenas arquivos .xlsx ou .xls são aceitos')
                      }
                    }}
                    onClick={() => document.getElementById('bulk-import-file')?.click()}
                    className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
                      bulkImportDragging
                        ? 'border-blue-400 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-900/20'
                        : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500'
                    }`}
                  >
                    <input
                      id="bulk-import-file"
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) setBulkImportFile(f)
                        e.target.value = ''
                      }}
                    />
                    <FileSpreadsheet className="size-10 text-zinc-400 dark:text-zinc-500" />
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Arraste a planilha aqui ou clique para selecionar
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Formatos aceitos: .xlsx, .xls
                    </p>
                    {bulkImportFile && (
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-2">
                        ✓ {bulkImportFile.name}
                      </p>
                    )}
                  </div>
                  {bulkImportFile && (
                    <Button
                      onClick={handleValidateFile}
                      disabled={bulkImportValidating}
                      className="gap-2"
                    >
                      {bulkImportValidating ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Validando...
                        </>
                      ) : (
                        'Validar Planilha'
                      )}
                    </Button>
                  )}
                </div>
              )}

              {/* Etapa 3 */}
              {bulkImportStep === 3 && bulkImportResult && (
                <div className="space-y-4">
                  {bulkImportError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{bulkImportError}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      Total: {bulkImportResult.total_rows}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      Válidas: {bulkImportResult.valid_rows}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                      Avisos: {bulkImportResult.warning_rows}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                      Erros: {bulkImportResult.error_rows}
                    </span>
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Linha</th>
                          <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Op.</th>
                          <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Código</th>
                          <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Descrição</th>
                          <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Status</th>
                          <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Erros/Avisos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...bulkImportResult.rows]
                          .sort((a, b) => {
                            const order = { error: 0, warning: 1, ok: 2 }
                            return (order[a.status] ?? 2) - (order[b.status] ?? 2)
                          })
                          .map((r) => (
                            <tr
                              key={r.row_number}
                              className={
                                r.status === 'error'
                                  ? 'bg-red-50 dark:bg-red-900/20'
                                  : r.status === 'warning'
                                    ? 'bg-yellow-50 dark:bg-yellow-900/20'
                                    : 'bg-white dark:bg-zinc-900'
                              }
                            >
                              <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.row_number}</td>
                              <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.operacao}</td>
                              <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.codigo_material ?? '—'}</td>
                              <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 max-w-[180px] truncate">{r.descricao ?? '—'}</td>
                              <td className="px-3 py-2">
                                {r.status === 'ok' && (
                                  <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                                    <CheckCircle2 className="size-3.5" /> ok
                                  </span>
                                )}
                                {r.status === 'warning' && (
                                  <span className="inline-flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
                                    <AlertTriangle className="size-3.5" /> aviso
                                  </span>
                                )}
                                {r.status === 'error' && (
                                  <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                                    <XCircle className="size-3.5" /> erro
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {r.errors.map((e, i) => (
                                  <p key={i} className="text-red-600 dark:text-red-400 flex items-center gap-1">
                                    <XCircle className="size-3 shrink-0" /> {e}
                                  </p>
                                ))}
                                {r.warnings.map((w, i) => (
                                  <p key={i} className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                                    <AlertTriangle className="size-3 shrink-0" /> {w}
                                  </p>
                                ))}
                                {r.errors.length === 0 && r.warnings.length === 0 && '—'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {hasCriticalErrors ? (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {bulkImportResult.error_rows} linha(s) com erros críticos impedem a importação
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {createCount} linha(s) serão criadas, {updateCount} linha(s) serão atualizadas
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Rodapé fixo */}
            <div className="border-t border-zinc-200 px-6 py-4 flex justify-between shrink-0 dark:border-zinc-700">
              <div>
                {bulkImportStep === 1 && (
                  <Button variant="outline" size="sm" onClick={closeBulkImportModal}>
                    Cancelar
                  </Button>
                )}
                {bulkImportStep === 2 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkImportStep(1)}
                  >
                    ← Voltar
                  </Button>
                )}
                {bulkImportStep === 3 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkImportStep(2)}
                    disabled={bulkImportConfirming}
                  >
                    ← Voltar
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {bulkImportStep === 1 && (
                  <Button size="sm" onClick={() => setBulkImportStep(2)}>
                    Próximo →
                  </Button>
                )}
                {bulkImportStep === 2 && (
                  <Button
                    size="sm"
                    onClick={handleValidateFile}
                    disabled={!bulkImportFile || bulkImportValidating}
                  >
                    {bulkImportValidating ? (
                      <>
                        <Loader2 className="size-4 animate-spin mr-2" />
                        Validando...
                      </>
                    ) : (
                      'Validar Planilha'
                    )}
                  </Button>
                )}
                {bulkImportStep === 3 && (
                  <Button
                    size="sm"
                    onClick={handleConfirmImport}
                    disabled={hasCriticalErrors || bulkImportConfirming}
                    className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    title={hasCriticalErrors ? 'Corrija os erros antes de importar' : undefined}
                  >
                    {bulkImportConfirming ? (
                      <>
                        <Loader2 className="size-4 animate-spin mr-2" />
                        Importando...
                      </>
                    ) : (
                      'Confirmar Importação'
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <Toaster position="top-right" richColors />
    </div>
  )
}
