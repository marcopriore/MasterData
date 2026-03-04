"use client"

import { useTheme } from "next-themes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  Calendar,
  ClipboardEdit,
  Clock,
  ChevronRight,
  Play,
  User,
  UserCheck,
} from "lucide-react"


export interface EnrichmentStep {
  label: string
  key: string
  percent: number
}

export interface MaterialRequest {
  id: string
  requestId: string
  materialName: string
  pdmCode: string
  pdm_id?: number
  category: string
  requester: string
  requesterAvatar: string
  date: string
  urgency: "low" | "medium" | "high"
  status: string
  statusLabel: string
  enrichment: EnrichmentStep[]
  pendingAction?: string
  description: string
  generated_description?: string
  assigned_to_id?: number | null
  assigned_to_name?: string | null
}

const urgencyConfig = {
  low: {
    label: "Baixa",
    dotClass: "bg-success",
    badgeClass: "bg-gray-100 text-gray-600 border border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600",
  },
  medium: {
    label: "Média",
    dotClass: "bg-amber-400",
    badgeClass: "bg-amber-50 text-amber-700 border border-amber-400 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
  },
  high: {
    label: "Alta",
    dotClass: "bg-destructive",
    badgeClass: "bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
  },
}

/** Estilos inline para badge de prioridade na visão lista — evita conflito com Tailwind em modo claro */
const listPriorityStyles: Record<'low' | 'medium' | 'high', { light: React.CSSProperties; dark: React.CSSProperties }> = {
  high: {
    light: { backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' },
    dark: { backgroundColor: 'rgba(127,29,29,0.3)', color: '#f87171', border: '1px solid #b91c1c' },
  },
  medium: {
    light: { backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d' },
    dark: { backgroundColor: 'rgba(120,53,15,0.3)', color: '#fbbf24', border: '1px solid #b45309' },
  },
  low: {
    light: { backgroundColor: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db' },
    dark: { backgroundColor: 'rgba(31,41,55,0.8)', color: '#9ca3af', border: '1px solid #4b5563' },
  },
}

/** Estilos inline para badge de prioridade no kanban — contraste correto no modo claro */
const kanbanPriorityStyles: Record<'high' | 'medium' | 'low', { light: React.CSSProperties & { dotColor: string }; dark: React.CSSProperties & { dotColor: string } }> = {
  high: {
    light: { backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', dotColor: '#b91c1c' },
    dark: { backgroundColor: 'rgba(153,27,27,0.3)', color: '#f87171', border: '1px solid #991b1b', dotColor: '#f87171' },
  },
  medium: {
    light: { backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', dotColor: '#b45309' },
    dark: { backgroundColor: 'rgba(120,53,15,0.3)', color: '#fbbf24', border: '1px solid #78350f', dotColor: '#fbbf24' },
  },
  low: {
    light: { backgroundColor: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db', dotColor: '#4b5563' },
    dark: { backgroundColor: 'rgba(55,65,81,0.5)', color: '#9ca3af', border: '1px solid #374151', dotColor: '#9ca3af' },
  },
}

const statusColors: Record<string, string> = {
  pending_technical: "bg-primary/10 text-primary border-primary/20",
  pending_fiscal: "bg-warning/10 text-warning-foreground border-warning/20",
  pending_mrp: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  completed: "bg-success/10 text-success border-success/20",
  draft: "bg-muted text-muted-foreground border-border",
  Pending: "bg-muted text-muted-foreground border-border",
}

interface RequestCardProps {
  request: MaterialRequest
  variant?: "kanban" | "list" | "grid"
  invalidStatus?: boolean
  onCompleteData?: (id: string) => void
  onViewDetails?: (id: string) => void
  /** Show Iniciar Atendimento e badges (role_type=etapa, excl. ADMIN). Aprovar/Rejeitar só no modal. */
  showActionButtons?: boolean
  /** Current user id — used for assign / own-attendance logic */
  currentUserId?: number | null
  onIniciarAtendimentoClick?: () => void
}

function ListPriorityBadge({ urgency }: { urgency: "low" | "medium" | "high" }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark' // undefined durante SSR → trata como light
  const cfg = listPriorityStyles[urgency]
  const style = isDark ? cfg.dark : cfg.light
  const label = urgency === 'high' ? 'Alta' : urgency === 'medium' ? 'Média' : 'Baixa'
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium"
      style={style}
    >
      {label}
    </span>
  )
}

function KanbanPriorityBadge({ urgency }: { urgency: "low" | "medium" | "high" }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const cfg = kanbanPriorityStyles[urgency ?? 'low']
  const style = isDark ? cfg.dark : cfg.light
  const label = urgency === 'high' ? 'Alta' : urgency === 'medium' ? 'Média' : 'Baixa'
  const { dotColor, ...badgeStyle } = style
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium"
      style={badgeStyle}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      {label}
    </span>
  )
}

const enrichmentLabelMap: Record<string, string> = {
  T: 'Técnico',
  F: 'Fiscal',
  M: 'Master',
  MRP: 'MRP',
}

function MiniProgress({ label, percent }: { label: string; percent: number }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] truncate" style={{ color: 'var(--kanban-card-sub)' }}>{label}</span>
              <span className="text-[10px] font-bold ml-1" style={{ color: 'var(--kanban-card-title)' }}>{percent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--kanban-card-separator)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${percent}%`, backgroundColor: 'var(--kanban-card-accent)' }}
              />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {enrichmentLabelMap[label] ?? label}: {percent}% concluído
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function RequestCard({
  request,
  variant = "kanban",
  invalidStatus = false,
  onCompleteData,
  onViewDetails,
  showActionButtons = false,
  currentUserId = null,
  onIniciarAtendimentoClick,
}: RequestCardProps) {
  const needsAction =
    request.status === "pending_fiscal" || request.status === "pending_mrp"
  const totalProgress = Math.round(
    request.enrichment.reduce((acc, s) => acc + s.percent, 0) /
      (request.enrichment.length || 1)
  )
  const statusColor = statusColors[request.status] ?? statusColors[request.statusLabel] ?? statusColors.draft

  if (variant === "grid") {
    return (
      <Card className="group border-border/60 hover:border-primary/20 hover:shadow-md transition-all">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold text-primary">
              {request.requestId}
            </span>
            <div className="flex items-center gap-1">
              {invalidStatus && (
                <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                  Status Inválido
                </Badge>
              )}
              <Badge variant="outline" className={cn("text-[10px]", statusColor)}>
                {request.statusLabel}
              </Badge>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground leading-tight line-clamp-1">
              {request.materialName}
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Clock className="size-3" />
              {request.date}
            </p>
          </div>
          {onViewDetails && (
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5 h-8 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onViewDetails(request.id)
              }}
            >
              <ChevronRight className="size-3.5" />
              Ver Detalhes
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  if (variant === "list") {
    return (
      <div className="group flex items-center gap-4 rounded-lg border border-slate-200/60 !bg-white px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.04)] transition-all hover:border-primary/20 hover:shadow-sm dark:!bg-card dark:border-zinc-400/40 dark:shadow-none">
        <div className="size-2.5 shrink-0" />

        {/* Request ID + Material */}
        <div className="flex flex-col min-w-0 w-40 shrink-0">
          <span className="text-xs font-mono font-bold text-primary truncate">
            {request.requestId}
          </span>
          <span className="text-sm font-semibold text-foreground truncate">
            {request.materialName}
          </span>
        </div>

        {/* Prioridade (urgência) — inline styles para contraste correto no modo claro */}
        <div className="hidden md:block w-24 shrink-0">
          <ListPriorityBadge urgency={request.urgency ?? 'low'} />
        </div>

        {/* Requester */}
        <div className="hidden lg:flex items-center gap-2 w-36 shrink-0">
          <div className="size-6 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-accent-foreground shrink-0">
            {request.requesterAvatar}
          </div>
          <span className="text-xs text-foreground truncate">{request.requester}</span>
        </div>

        {/* Date */}
        <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground w-24 shrink-0">
          <Calendar className="size-3" />
          {request.date}
        </div>

        {/* Progress bars — trilho com hsl(--muted), preenchimento hex para ambos os temas */}
        <div className="flex-1 min-w-0 hidden lg:grid grid-cols-4 gap-x-4 items-start">
          {request.enrichment.map((step) => {
            const p = Math.min(100, step.percent)
            const fillBg =
              p === 0
                ? 'transparent'
                : p < 50
                  ? '#60a5fa'
                  : p < 100
                    ? '#2563eb'
                    : '#16a34a'
            return (
              <div key={step.key} className="flex flex-col gap-1 min-w-0">
                <span className="text-xs font-medium text-muted-foreground truncate">
                  {enrichmentLabelMap[step.label] ?? step.label}
                </span>
                <div
                  className="w-full h-2 overflow-hidden rounded-full"
                  style={{ backgroundColor: 'var(--muted)' }}
                >
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{ width: `${p}%`, backgroundColor: fillBg }}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">{step.percent}%</span>
              </div>
            )
          })}
        </div>

        {/* Overall progress for smaller screens */}
        <div className="lg:hidden flex items-center gap-2 w-20 shrink-0">
          <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-slate-600 transition-all duration-500 dark:bg-slate-300"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-foreground">{totalProgress}%</span>
        </div>

        {/* Status + Action */}
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={cn("text-[10px]", statusColor)}>
            {request.statusLabel}
          </Badge>
          {needsAction && onCompleteData && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
              onClick={() => onCompleteData(request.id)}
            >
              <ClipboardEdit className="size-3" />
              <span className="hidden sm:inline">Completar</span>
            </Button>
          )}
          {onViewDetails ? (
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:text-primary transition-colors"
              onClick={(e) => { e.stopPropagation(); onViewDetails(request.id) }}
              aria-label="Ver Detalhes"
            >
              <ChevronRight className="size-4" />
            </button>
          ) : (
            <ChevronRight className="size-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
          )}
        </div>
      </div>
    )
  }

  // Kanban card
  const descriptionText = request.generated_description || request.description || '—'
  const assignedToId = request.assigned_to_id ?? null
  const isAssignedToMe = assignedToId !== null && currentUserId !== null && assignedToId === currentUserId
  const isAssignedToOther = assignedToId !== null && (currentUserId === null || assignedToId !== currentUserId)
  const isUnassigned = assignedToId === null

  return (
    <Card
      className={cn(
        "group shadow-sm hover:shadow-md transition-all cursor-pointer",
        isAssignedToOther && "opacity-60 border-slate-300 dark:border-zinc-600"
      )}
      style={{ backgroundColor: 'var(--kanban-card-bg)', borderColor: 'var(--kanban-col-border)' }}
      onClick={() => onViewDetails?.(request.id)}
    >
      <CardContent className="p-3 space-y-2.5">
        {/* Top row: ID + urgency badge */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono font-bold" style={{ color: 'var(--kanban-card-accent)' }}>
            {request.requestId}
          </span>
          <div className="flex items-center gap-1">
            {invalidStatus && (
              <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                Inválido
              </Badge>
            )}
            <KanbanPriorityBadge urgency={request.urgency ?? 'low'} />
          </div>
        </div>

        {/* PDM name */}
        <h4 className="text-sm font-semibold leading-tight line-clamp-1" style={{ color: 'var(--kanban-card-title)' }}>
          {request.materialName}
        </h4>

        {/* Generated description — the key field */}
        <p className="text-[11px] font-mono leading-relaxed line-clamp-2 break-words" style={{ color: 'var(--kanban-card-sub)' }}>
          {descriptionText}
        </p>

        <Separator style={{ backgroundColor: 'var(--kanban-card-separator)' }} />

        {/* Solicitante + Atendente + Data */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <User className="size-3 shrink-0" style={{ color: 'var(--kanban-card-sub)' }} />
            <span className="text-[10px]" style={{ color: 'var(--kanban-card-sub)' }}>Solicitante:</span>
            <span className="text-[11px] truncate" style={{ color: 'var(--kanban-card-title)' }}>
              {request.requester}
            </span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <UserCheck className="size-3 shrink-0" style={{ color: 'var(--kanban-card-sub)' }} />
            <span className="text-[10px]" style={{ color: 'var(--kanban-card-sub)' }}>Atendente:</span>
            <span className={cn(
              "text-[11px] truncate",
              request.assigned_to_name ? "" : "italic"
            )} style={{ color: request.assigned_to_name ? 'var(--kanban-card-title)' : 'var(--kanban-card-sub)' }}>
              {request.assigned_to_name ?? "Sem atendente"}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0 text-[10px]" style={{ color: 'var(--kanban-card-sub)' }}>
            <Clock className="size-3" />
            {request.date}
          </div>
        </div>

        {/* Assignment badge and Iniciar Atendimento — Aprovar/Rejeitar só no modal de detalhes */}
        {showActionButtons && (
          <div className="pt-2" onClick={(e) => e.stopPropagation()}>
            {isAssignedToMe && (
              <div className="text-[10px] font-medium text-primary/90">Você está atendendo</div>
            )}
            {isAssignedToOther && (
              <div className="text-[10px] text-muted-foreground">
                Em atendimento por {request.assigned_to_name ?? "outro usuário"}
              </div>
            )}
            {isUnassigned && onIniciarAtendimentoClick && (
              <Button
                size="sm"
                className="w-full h-7 text-[10px] gap-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={(e) => { e.stopPropagation(); onIniciarAtendimentoClick() }}
              >
                <Play className="size-3 fill-current" />
                Iniciar Atendimento
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function EmptyColumn({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed py-4 px-3 text-center" style={{ borderColor: 'var(--kanban-col-border)' }}>
      <p className="text-xs" style={{ color: 'var(--kanban-card-sub)' }}>{message}</p>
    </div>
  )
}
