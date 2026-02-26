"use client"

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
  User,
  ChevronRight,
  Package,
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
  category: string
  requester: string
  requesterAvatar: string
  date: string
  urgency: "low" | "medium" | "high"
  status: "pending_technical" | "pending_fiscal" | "pending_mrp" | "completed" | "draft"
  statusLabel: string
  enrichment: EnrichmentStep[]
  pendingAction?: string
  description: string
}

const urgencyConfig = {
  low: {
    label: "Baixa",
    dotClass: "bg-success",
    badgeClass: "bg-success/10 text-success border-success/20",
  },
  medium: {
    label: "Media",
    dotClass: "bg-warning",
    badgeClass: "bg-warning/10 text-warning-foreground border-warning/20",
  },
  high: {
    label: "Alta",
    dotClass: "bg-destructive",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
  },
}

const statusColors: Record<string, string> = {
  pending_technical: "bg-primary/10 text-primary border-primary/20",
  pending_fiscal: "bg-warning/10 text-warning-foreground border-warning/20",
  pending_mrp: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  completed: "bg-success/10 text-success border-success/20",
  draft: "bg-muted text-muted-foreground border-border",
}

interface RequestCardProps {
  request: MaterialRequest
  variant?: "kanban" | "list"
  onCompleteData?: (id: string) => void
}

function MiniProgress({ label, percent }: { label: string; percent: number }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground truncate">{label}</span>
              <span className="text-[10px] font-bold text-foreground ml-1">{percent}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  percent === 100
                    ? "bg-success"
                    : percent > 0
                    ? "bg-primary"
                    : "bg-muted-foreground/20"
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {label}: {percent}% concluido
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function RequestCard({ request, variant = "kanban", onCompleteData }: RequestCardProps) {
  const urg = urgencyConfig[request.urgency]
  const needsAction =
    request.status === "pending_fiscal" || request.status === "pending_mrp"
  const totalProgress = Math.round(
    request.enrichment.reduce((acc, s) => acc + s.percent, 0) / request.enrichment.length
  )

  if (variant === "list") {
    return (
      <div className="group flex items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-all hover:border-primary/20 hover:shadow-sm">
        {/* Urgency dot */}
        <div className={cn("size-2.5 rounded-full shrink-0", urg.dotClass)} />

        {/* Request ID + Material */}
        <div className="flex flex-col min-w-0 w-40 shrink-0">
          <span className="text-xs font-mono font-bold text-primary truncate">
            {request.requestId}
          </span>
          <span className="text-sm font-semibold text-foreground truncate">
            {request.materialName}
          </span>
        </div>

        {/* Category */}
        <span className="hidden md:block text-xs text-muted-foreground w-24 shrink-0 truncate">
          {request.category}
        </span>

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

        {/* Progress bars */}
        <div className="flex-1 min-w-0 hidden xl:flex items-center gap-3">
          {request.enrichment.map((step) => (
            <MiniProgress key={step.key} label={step.label} percent={step.percent} />
          ))}
        </div>

        {/* Overall progress for smaller screens */}
        <div className="xl:hidden flex items-center gap-2 w-20 shrink-0">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full", totalProgress === 100 ? "bg-success" : "bg-primary")}
              style={{ width: `${totalProgress}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-foreground">{totalProgress}%</span>
        </div>

        {/* Status + Action */}
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={cn("text-[10px]", statusColors[request.status])}>
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
          <ChevronRight className="size-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
        </div>
      </div>
    )
  }

  // Kanban card
  return (
    <Card className="group border-border/60 hover:border-primary/20 hover:shadow-md transition-all cursor-pointer">
      <CardContent className="p-4 space-y-3">
        {/* Top row: ID + Urgency */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-primary">
            {request.requestId}
          </span>
          <Badge variant="outline" className={cn("text-[10px]", urg.badgeClass)}>
            <div className={cn("size-1.5 rounded-full mr-0.5", urg.dotClass)} />
            {urg.label}
          </Badge>
        </div>

        {/* Material name */}
        <div>
          <h4 className="text-sm font-semibold text-foreground leading-tight line-clamp-1">
            {request.materialName}
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
            {request.pdmCode}
          </p>
        </div>

        {/* Description preview */}
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {request.description}
        </p>

        <Separator />

        {/* Progress steps */}
        <div className="flex items-center gap-2">
          {request.enrichment.map((step) => (
            <MiniProgress key={step.key} label={step.label} percent={step.percent} />
          ))}
        </div>

        <Separator />

        {/* Bottom row: Requester + Date */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold text-accent-foreground">
              {request.requesterAvatar}
            </div>
            <span className="text-xs text-foreground">{request.requester}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3" />
            {request.date}
          </div>
        </div>

        {/* Action button */}
        {needsAction && onCompleteData && (
          <Button
            size="sm"
            className="w-full gap-1.5 h-8 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              onCompleteData(request.id)
            }}
          >
            <ClipboardEdit className="size-3.5" />
            Completar Dados
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export function EmptyColumn({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 py-10 px-4 text-center">
      <Package className="size-8 text-muted-foreground/30 mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
