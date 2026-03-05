'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiGetWithAuth } from '@/lib/api'
import { useUser } from '@/contexts/user-context'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import {
  Database,
  FilePlus,
  GitBranch,
  ShieldCheck,
  ClipboardList,
  Users,
  LayoutDashboard,
  ArrowRight,
  Loader2,
  AlertCircle,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type DashboardStats = {
  total_requests: number
  by_status: { name: string; value: number }[]
  by_urgency: { name: string; value: number }[]
  recent_activities: {
    id: number
    requester: string
    cost_center: string | null
    urgency: string
    status: string
    generated_description: string | null
    pdm_id: number
    created_at: string | null
  }[]
  pdm_count?: number
  user_count?: number
  section_title?: string
  show_user_count?: boolean
  user_name?: string | null
}

// ─── Palette ──────────────────────────────────────────────────────────────────

// Cycles through navy → gold → slate tones for dynamic status slices
const SLICE_COLORS = [
  '#0F1C38',
  '#C69A46',
  '#3B82F6',
  '#10B981',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#6366F1',
]

const URGENCY_COLORS: Record<string, string> = {
  Baixa:  '#10B981',
  Média:  '#F59E0B',
  Alta:   '#EF4444',
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function urgencyLabel(raw: string) {
  return { low: 'Baixa', medium: 'Média', high: 'Alta' }[raw] ?? raw
}

function urgencyColor(raw: string) {
  return (
    { low: '#10B981', medium: '#F59E0B', high: '#EF4444' }[raw] ?? '#94A3B8'
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  accent?: string
  loading?: boolean
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[#B4B9BE] bg-white px-5 py-5 shadow-[var(--shadow-card-float)]">
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: accent ? `${accent}18` : '#0F1C3818' }}
      >
        <Icon className="size-5" style={{ color: accent ?? '#0F1C38' }} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {loading ? (
          <div className="mt-1 h-6 w-12 animate-pulse rounded bg-slate-200" />
        ) : (
          <p className="text-2xl font-bold text-foreground">{value}</p>
        )}
      </div>
    </div>
  )
}

// ─── Custom pie tooltip ───────────────────────────────────────────────────────

function PieTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  return (
    <div className="rounded-xl border border-[#B4B9BE] bg-white px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-foreground">{name}</p>
      <p className="text-muted-foreground">{value} solicitação{value !== 1 ? 'ões' : ''}</p>
    </div>
  )
}

// ─── Quick-access nav card ────────────────────────────────────────────────────

function NavCard({
  href,
  icon: Icon,
  label,
  description,
  gold,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  gold?: boolean
}) {
  return (
    <Link href={href} className="group">
      <div
        className={[
          'flex h-full flex-col items-center justify-center gap-3 rounded-2xl border px-6 py-8',
          'shadow-[var(--shadow-card-float)] transition-all hover:-translate-y-0.5 hover:shadow-md',
          gold
            ? 'border-[#C69A46] bg-white hover:bg-[#C69A46]/5'
            : 'border-[#B4B9BE] bg-white hover:border-[#C69A46]/50 hover:bg-primary/5',
        ].join(' ')}
      >
        <div
          className={[
            'flex size-12 items-center justify-center rounded-xl text-white transition-transform group-hover:scale-105',
            gold ? 'bg-[#C69A46]' : 'bg-[#0F1C38]',
          ].join(' ')}
        >
          <Icon className="size-6" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const { user, accessToken, ready, isAdmin, can } = useUser()

  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  // Hydration guard — recharts must only render on the client
  const [isClient, setIsClient] = useState(false)
  useEffect(() => setIsClient(true), [])

  useEffect(() => {
    if (!ready) return
    async function load() {
      setStatsLoading(true)
      setStatsError(null)
      try {
        const s = await apiGetWithAuth<DashboardStats>('/api/dashboard/stats', accessToken ?? null)
        setStats(s)
      } catch (err) {
        setStatsError((err as Error).message)
      } finally {
        setStatsLoading(false)
      }
    }
    load()
  }, [ready, accessToken])

  function handleSliceClick(entry: { name: string }) {
    router.push(`/governance?status=${encodeURIComponent(entry.name)}`)
  }

  const displayName = stats?.user_name?.split(' ')[0] || user?.name?.split(' ')[0] || 'Usuário'
  const greeting = (stats?.user_name ?? user?.name)
    ? `Olá, ${displayName}.`
    : 'Bem-vindo ao MDM Platform.'

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-10">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#0F1C38]/8">
          <LayoutDashboard className="size-5 text-[#0F1C38]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">{greeting}</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral do sistema · MDM Platform v1.9
          </p>
        </div>
      </div>

      {/* ── Acesso Rápido (primeiro após header) ───────────────────────────── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Acesso Rápido
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(isAdmin || can('can_edit_pdm')) && (
            <NavCard
              href="/admin-pdm"
              icon={Database}
              label="Gestão de PDMs"
              description="Configure padrões de descrição"
            />
          )}
          {(isAdmin || can('can_approve')) && (
            <NavCard
              href="/governance"
              icon={ShieldCheck}
              label="Governança"
              description="Políticas e controle de qualidade"
            />
          )}
          {isAdmin && (
            <NavCard
              href="/settings/workflow"
              icon={GitBranch}
              label="Workflows"
              description="Etapas de aprovação"
            />
          )}
          {(isAdmin || can('can_submit_request')) && (
            <NavCard
              href="/request"
              icon={FilePlus}
              label="Nova Requisição"
              description="Criar nova solicitação"
              gold
            />
          )}
        </div>
      </div>

      {/* ── KPI cards ──────────────────────────────────────────────────────── */}
      <div className={`grid gap-4 ${stats?.show_user_count === false ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
        <KpiCard
          icon={ClipboardList}
          label="Total de Solicitações"
          value={stats?.total_requests ?? 0}
          loading={statsLoading}
        />
        <KpiCard
          icon={Database}
          label="PDMs Cadastrados"
          value={stats?.pdm_count ?? 0}
          accent="#C69A46"
          loading={statsLoading}
        />
        {stats?.show_user_count !== false && (
          <KpiCard
            icon={Users}
            label="Usuários Ativos"
            value={stats?.user_count ?? 0}
            accent="#3B82F6"
            loading={statsLoading}
          />
        )}
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      {statsError ? (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          Não foi possível carregar os dados: {statsError}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">

          {/* Status pie */}
          <div className="rounded-2xl border border-[#B4B9BE] bg-white p-6 shadow-[var(--shadow-card-float)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Solicitações por Status</h2>
                <p className="text-xs text-muted-foreground">Clique em uma fatia para filtrar</p>
              </div>
              <Link
                href="/governance"
                className="flex items-center gap-1 text-xs font-medium text-[#0F1C38] hover:text-[#C69A46] transition-colors"
              >
                Ver todas <ArrowRight className="size-3" />
              </Link>
            </div>

            {statsLoading ? (
              <div className="flex h-56 items-center justify-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin mr-2" />
                Carregando…
              </div>
            ) : !isClient || !stats?.by_status?.length ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                Nenhuma solicitação ainda.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={stats.by_status}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    onClick={handleSliceClick}
                    style={{ cursor: 'pointer' }}
                  >
                    {stats.by_status.map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={SLICE_COLORS[i % SLICE_COLORS.length]}
                        stroke="white"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span className="text-xs text-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Urgency pie */}
          <div className="rounded-2xl border border-[#B4B9BE] bg-white p-6 shadow-[var(--shadow-card-float)]">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">Solicitações por Urgência</h2>
              <p className="text-xs text-muted-foreground">Distribuição de prioridade</p>
            </div>

            {statsLoading ? (
              <div className="flex h-56 items-center justify-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin mr-2" />
                Carregando…
              </div>
            ) : !isClient || !stats?.by_urgency?.length ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                Nenhuma solicitação ainda.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={stats.by_urgency}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {stats.by_urgency.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={URGENCY_COLORS[entry.name] ?? '#94A3B8'}
                        stroke="white"
                        strokeWidth={2}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span className="text-xs text-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ── Atividade Recente / Minhas Solicitações ─────────────────────────── */}
      <div className="rounded-2xl border border-[#B4B9BE] bg-white shadow-[var(--shadow-card-float)]">
        <div className="flex items-center justify-between border-b border-[#B4B9BE] px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            {stats?.section_title ?? 'Atividade Recente'}
          </h2>
          <Link
            href="/governance"
            className="flex items-center gap-1 text-xs font-medium text-[#0F1C38] hover:text-[#C69A46] transition-colors"
          >
            Ver todas <ArrowRight className="size-3" />
          </Link>
        </div>

        {statsLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-4 animate-spin mr-2" />
            Carregando…
          </div>
        ) : !stats?.recent_activities?.length ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            Nenhuma atividade recente.
          </div>
        ) : (
          <div className="divide-y divide-[#B4B9BE]/40">
            {stats.recent_activities.map((req) => (
              <div
                key={req.id}
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50/60 transition-colors"
              >
                {/* ID */}
                <span className="w-16 shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                  REQ-{String(req.id).padStart(4, '0')}
                </span>

                {/* Description / requester */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground font-mono">
                    {req.generated_description ?? '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">{req.requester}</p>
                </div>

                {/* Urgency badge */}
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{
                    backgroundColor: `${urgencyColor(req.urgency)}18`,
                    color: urgencyColor(req.urgency),
                  }}
                >
                  {urgencyLabel(req.urgency)}
                </span>

                {/* Status badge */}
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {req.status}
                </span>

                {/* Date */}
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {formatDate(req.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
