'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiGet, apiGetWithAuth } from '@/lib/api'
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
} from 'lucide-react'

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
  sap_code: 'Código SAP',
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

const STATUS_BADGE: Record<string, string> = {
  Ativo: 'bg-green-100 text-green-800 border border-green-300',
  Bloqueado: 'bg-red-100 text-red-800 border border-red-300',
  Obsoleto: 'bg-gray-200 text-gray-700 border border-gray-400',
}

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
  const { accessToken } = useUser()
  const [items, setItems] = useState<MaterialItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const limit = 50
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [pdmCode, setPdmCode] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [appliedStatus, setAppliedStatus] = useState('')
  const [appliedPdm, setAppliedPdm] = useState('')
  const [appliedDateFrom, setAppliedDateFrom] = useState('')
  const [appliedDateTo, setAppliedDateTo] = useState('')

  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(VISIBLE_BY_DEFAULT))
  const [pdms, setPdms] = useState<PDMTemplate[]>([])

  const fetchMaterials = useCallback(() => {
    if (!accessToken) return
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    if (appliedSearch) params.set('q', appliedSearch)
    if (appliedStatus) params.set('status', appliedStatus)
    if (appliedPdm) params.set('pdm_code', appliedPdm)
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
  }, [accessToken, page, limit, appliedSearch, appliedStatus, appliedPdm, appliedDateFrom, appliedDateTo])

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
    setAppliedDateFrom(dateFrom)
    setAppliedDateTo(dateTo)
    setPage(1)
  }

  const handleClear = () => {
    setSearch('')
    setStatus('')
    setPdmCode('')
    setDateFrom('')
    setDateTo('')
    setAppliedSearch('')
    setAppliedStatus('')
    setAppliedPdm('')
    setAppliedDateFrom('')
    setAppliedDateTo('')
    setPage(1)
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
              Código SAP
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
                    {displayColumns.map((key) => {
                      if (key === 'status') {
                        return (
                          <td key={key} className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                STATUS_BADGE[row.status] ?? 'bg-slate-200 text-slate-700 border border-slate-400'
                              }`}
                            >
                              {row.status}
                            </span>
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
    </div>
  )
}
