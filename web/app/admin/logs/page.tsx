'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { apiGetWithAuth, apiDownloadWithAuth } from '@/lib/api'
import { useUser } from '@/contexts/user-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollText, Loader2, Filter, X, ChevronDown, ChevronUp, FileDown } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ─── Types ────────────────────────────────────────────────────────────────────

type LogItem = {
  id: number
  user_name: string | null
  category: string
  action: string
  description: string
  event_data: Record<string, unknown> | null
  ip_address: string | null
  created_at: string | null
}

type LogsResponse = {
  total: number
  page: number
  limit: number
  items: LogItem[]
}

type UserItem = { id: number; name: string; email: string }

const CATEGORIES = [
  { value: '', label: 'Todos' },
  { value: 'auth', label: 'Auth' },
  { value: 'users', label: 'Usuários' },
  { value: 'roles', label: 'Perfis' },
  { value: 'requests', label: 'Solicitações' },
  { value: 'fields', label: 'Campos' },
  { value: 'workflows', label: 'Workflows' },
  { value: 'system', label: 'Sistema' },
] as const

const CATEGORY_BADGE: Record<string, { bg: string; text: string }> = {
  auth: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  users: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  roles: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  requests: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  fields: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  workflows: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  system: 'bg-slate-100 text-slate-800 dark:bg-slate-700/50 dark:text-slate-300',
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function hasEventData(data: Record<string, unknown> | null): boolean {
  if (!data || typeof data !== 'object') return false
  const keys = Object.keys(data).filter((k) => {
    const v = data[k]
    if (v == null) return false
    if (typeof v === 'object' && !Array.isArray(v)) return Object.keys(v as object).length > 0
    if (typeof v === 'string') return v.trim() !== ''
    return true
  })
  return keys.length > 0
}

function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function EventDataContent({ data }: { data: Record<string, unknown> }) {
  const fieldsChanged = data.fields_changed as Record<string, string | { de: string; para: string }> | undefined
  const justification = data.justification
  const otherKeys = Object.keys(data).filter(
    (k) => k !== 'fields_changed' && k !== 'justification'
  )

  return (
    <div className="space-y-3 p-4 text-sm">
      {fieldsChanged && Object.keys(fieldsChanged).length > 0 && (
        <div>
          <p className="mb-2 font-semibold text-slate-700 dark:text-foreground">Campos alterados</p>
          <div className="overflow-hidden rounded border border-slate-200 dark:border-zinc-600">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 dark:border-zinc-600 dark:bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-foreground">Campo</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-foreground">Antes</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-foreground">Depois</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(fieldsChanged).map(([label, val]) => {
                  const isDePara = typeof val === 'object' && val !== null && 'de' in val && 'para' in val
                  const de = isDePara ? String((val as { de: string }).de) : '—'
                  const para = isDePara ? String((val as { para: string }).para) : String(val)
                  return (
                    <tr key={label} className="border-b border-slate-100 last:border-b-0 dark:border-zinc-700/50">
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-foreground">{label}</td>
                      <td className="max-w-[120px] truncate px-3 py-2 text-gray-500 line-through dark:text-muted-foreground">
                        {de.length > 40 ? `${de.slice(0, 40)}...` : de || '—'}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-slate-700 dark:text-foreground">
                        {para.length > 40 ? `${para.slice(0, 40)}...` : para}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {justification != null && justification !== '' && (
        <div>
          <p className="mb-1 font-semibold text-slate-700 dark:text-foreground">Justificativa</p>
          <blockquote className="border-l-2 border-slate-200 pl-3 text-slate-600 dark:border-zinc-600 dark:text-muted-foreground">
            &quot;{String(justification)}&quot;
          </blockquote>
        </div>
      )}
      {otherKeys.length > 0 && (
        <div>
          <p className="mb-2 font-semibold text-slate-700 dark:text-foreground">Outros detalhes</p>
          <div className="space-y-1 text-slate-600 dark:text-muted-foreground">
            {otherKeys.map((k) => {
              const v = data[k]
              const display = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')
              return (
                <div key={k}>
                  <span className="font-medium text-slate-700 dark:text-foreground">{formatKey(k)}:</span>{' '}
                  {display.length > 80 ? `${display.slice(0, 80)}...` : display}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminLogsPage() {
  const { accessToken, isAdmin, can } = useUser()
  const canViewLogs = can('can_view_logs')
  const [logs, setLogs] = useState<LogItem[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const limit = 50
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const [category, setCategory] = useState('')
  const [userId, setUserId] = useState<string>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [appliedCategory, setAppliedCategory] = useState('')
  const [appliedUserId, setAppliedUserId] = useState('')
  const [appliedDateFrom, setAppliedDateFrom] = useState('')
  const [appliedDateTo, setAppliedDateTo] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [exporting, setExporting] = useState(false)

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const fetchLogs = useCallback(() => {
    if (!accessToken) return
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    if (appliedCategory) params.set('category', appliedCategory)
    if (appliedUserId) params.set('user_id', appliedUserId)
    if (appliedDateFrom) params.set('from', appliedDateFrom + 'T00:00:00')
    if (appliedDateTo) params.set('to', appliedDateTo + 'T23:59:59')
    const url = `/admin/logs?${params.toString()}`
    apiGetWithAuth<LogsResponse>(url, accessToken)
      .then((data) => {
        setLogs(data.items ?? [])
        setTotal(data.total ?? 0)
      })
      .catch(() => {
        setLogs([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [accessToken, page, limit, appliedCategory, appliedUserId, appliedDateFrom, appliedDateTo])

  useEffect(() => {
    if (!accessToken || !isAdmin) return
    apiGetWithAuth<UserItem[]>('/admin/users', accessToken)
      .then((list) => setUsers(list ?? []))
      .catch(() => setUsers([]))
  }, [accessToken, isAdmin])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleFilter = () => {
    setAppliedCategory(category)
    setAppliedUserId(userId)
    setAppliedDateFrom(dateFrom)
    setAppliedDateTo(dateTo)
    setPage(1)
  }
  const handleClear = () => {
    setCategory('')
    setUserId('')
    setDateFrom('')
    setDateTo('')
    setAppliedCategory('')
    setAppliedUserId('')
    setAppliedDateFrom('')
    setAppliedDateTo('')
    setPage(1)
  }

  const handleExport = async () => {
    if (!accessToken) return
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (appliedCategory) params.set('category', appliedCategory)
      if (appliedUserId) params.set('user_id', appliedUserId)
      if (appliedDateFrom) params.set('from', appliedDateFrom + 'T00:00:00')
      if (appliedDateTo) params.set('to', appliedDateTo + 'T23:59:59')
      const path = `/admin/logs/export${params.toString() ? '?' + params.toString() : ''}`
      await apiDownloadWithAuth(path, accessToken, 'logs_export.xlsx')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
    } finally {
      setExporting(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Acesso restrito ao administrador.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-foreground">
          <ScrollText className="size-6" />
          Log do Sistema
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Auditoria completa de ações no sistema
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-700/50 dark:bg-card">
        {/* Filtros */}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm min-w-[140px]"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value || 'all'} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Usuário</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm min-w-[160px]"
            >
              <option value="">Todos</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data início</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-[140px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data fim</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-[140px]"
            />
          </div>
          <Button size="sm" onClick={handleFilter} className="gap-2">
            <Filter className="size-4" />
            Filtrar
          </Button>
          <Button size="sm" variant="outline" onClick={handleClear} className="gap-2">
            <X className="size-4" />
            Limpar
          </Button>
          {canViewLogs && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
              className="gap-2 border-slate-300 dark:border-zinc-600"
            >
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
              Exportar Excel
            </Button>
          )}
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-zinc-700/50">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>Carregando logs...</span>
            </div>
          ) : logs.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nenhum log encontrado.
            </p>
          ) : (
            <TooltipProvider delayDuration={200}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700/50 dark:bg-muted/30">
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-foreground">Data/Hora</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-foreground">Usuário</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-foreground">Categoria</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-foreground">Ação</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-foreground">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const expandable = hasEventData(log.event_data)
                    const isExpanded = expandedIds.has(log.id)
                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          key={log.id}
                          className={`border-b border-slate-200 dark:border-zinc-700/40 ${
                            expandable ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-muted/30' : ''
                          }`}
                          onClick={() => expandable && toggleExpand(log.id)}
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                            {formatDateTime(log.created_at)}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {log.user_name ?? 'Sistema'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                CATEGORY_BADGE[log.category] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300'
                              }`}
                            >
                              {log.category}
                            </span>
                          </td>
                          <td className="font-mono text-xs px-4 py-3">{log.action}</td>
                          <td className="max-w-[320px] px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="min-w-0 flex-1 truncate cursor-default">
                                    {log.description || '—'}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="max-w-md">
                                  {log.description || '—'}
                                </TooltipContent>
                              </Tooltip>
                              {expandable && (
                                <span className="shrink-0 text-muted-foreground">
                                  {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && log.event_data && (
                          <tr key={`${log.id}-exp`} className="border-b border-slate-200 dark:border-zinc-700/40">
                            <td colSpan={5} className="bg-gray-50 p-0 dark:bg-muted/20">
                              <EventDataContent data={log.event_data} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </TooltipProvider>
          )}
        </div>

        {/* Paginação */}
        {logs.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Mostrando {logs.length} de {total} registros
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
