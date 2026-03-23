'use client'

import { useState, useEffect, useCallback } from 'react'
import { getRecentActivities } from '@/lib/supabase-api'
import { Button } from '@/components/ui/button'
import { ClipboardList, ArrowRight } from 'lucide-react'

type ActivityItem = {
  id: number
  generated_description: string | null
  status: string
  urgency: string
  created_at: string | null
  requester: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function urgencyLabel(raw: string): string {
  return { low: 'Baixa', medium: 'Média', high: 'Alta' }[raw] ?? raw
}

function urgencyColor(raw: string): string {
  return { low: '#10B981', medium: '#F59E0B', high: '#EF4444' }[raw] ?? '#94A3B8'
}

interface RecentActivitiesListProps {
  fullPage?: boolean
}

export function RecentActivitiesList({ fullPage = false }: RecentActivitiesListProps) {
  const limit = fullPage ? 20 : 5
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const fetchActivities = useCallback(
    async (pageNum: number) => {
      setLoading(true)
      const offset = (pageNum - 1) * limit
      const { data, count } = await getRecentActivities({ limit, offset })
      setActivities((data ?? []) as ActivityItem[])
      setTotal(count ?? 0)
      setLoading(false)
    },
    [limit]
  )

  useEffect(() => {
    fetchActivities(page)
  }, [page, fetchActivities])

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  return (
    <div className="rounded-2xl border border-[#B4B9BE] bg-white shadow-[var(--shadow-card-float)] dark:border-zinc-700/50 dark:bg-card">
      <div className="divide-y divide-[#B4B9BE]/40 dark:divide-zinc-700/40">
        {loading ? (
          Array.from({ length: fullPage ? 5 : 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-3.5">
              <div className="h-4 w-16 shrink-0 animate-pulse rounded bg-slate-200 dark:bg-zinc-700" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-zinc-700" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-zinc-700" />
              </div>
              <div className="h-6 w-16 shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-zinc-700" />
              <div className="h-6 w-20 shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-zinc-700" />
              <div className="hidden h-4 w-20 shrink-0 animate-pulse rounded bg-slate-200 dark:bg-zinc-700 sm:block" />
            </div>
          ))
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <ClipboardList className="size-10 text-slate-400 dark:text-zinc-500" />
            <p className="text-sm text-slate-600 dark:text-zinc-400">Nenhuma atividade recente.</p>
          </div>
        ) : (
          activities.map((req) => (
            <div
              key={req.id}
              className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-slate-50/60 dark:hover:bg-zinc-800/40"
            >
              <span className="w-16 shrink-0 font-mono text-xs font-semibold text-slate-500 dark:text-zinc-400">
                REQ-{String(req.id).padStart(4, '0')}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-medium text-slate-900 dark:text-zinc-100">
                  {req.generated_description ?? '—'}
                </p>
                {req.requester && (
                  <p className="text-xs text-slate-500 dark:text-zinc-400">{req.requester}</p>
                )}
              </div>

              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                style={{
                  backgroundColor: `${urgencyColor(req.urgency)}18`,
                  color: urgencyColor(req.urgency),
                }}
              >
                {urgencyLabel(req.urgency)}
              </span>

              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-zinc-700 dark:text-zinc-300">
                {req.status}
              </span>

              <span className="hidden shrink-0 text-xs text-slate-500 sm:block dark:text-zinc-400">
                {formatDate(req.created_at)}
              </span>
            </div>
          ))
        )}
      </div>

      {fullPage && !loading && activities.length > 0 && (
        <div className="flex items-center justify-between gap-4 border-t border-[#B4B9BE]/40 px-6 py-3 dark:border-zinc-700/40">
          <p className="text-xs text-slate-600 dark:text-zinc-400">
            {from}–{to} de {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="gap-1"
            >
              <ArrowRight className="size-4 rotate-180" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="gap-1"
            >
              Próxima
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
