'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiGetWithAuth } from '@/lib/api'
import { useUser } from '@/contexts/user-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollText, Loader2, Filter, X } from 'lucide-react'
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


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminLogsPage() {
  const { accessToken, isAdmin } = useUser()
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
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-slate-200 last:border-b-0 dark:border-zinc-700/40"
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
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate cursor-default">
                              {log.description || '—'}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-md">
                            {log.description || '—'}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
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
