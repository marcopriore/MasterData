"use client"

import { useState, useEffect } from "react"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { RequestCard, EmptyColumn, type MaterialRequest } from "./request-card"
import { apiGet } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  FileEdit,
  Microscope,
  Receipt,
  CheckCircle2,
  FileQuestion,
} from "lucide-react"

type WorkflowStep = {
  id: number
  step_name: string
  status_key?: string
  order: number
  is_active: boolean
}

interface KanbanColumn {
  id: string
  label: string
  icon: React.ReactNode
  colorClass: string
  dotClass: string
  statuses: string[]
}

const ICON_MAP: Record<string, React.ReactNode> = {
  draft: <FileQuestion className="size-4" />,
  pending_technical: <Microscope className="size-4" />,
  pending_fiscal: <Receipt className="size-4" />,
  pending_mrp: <FileEdit className="size-4" />,
  completed: <CheckCircle2 className="size-4" />,
}
const COLOR_MAP: Record<string, { colorClass: string; dotClass: string }> = {
  draft: { colorClass: "text-muted-foreground", dotClass: "bg-muted-foreground" },
  pending_technical: { colorClass: "text-primary", dotClass: "bg-primary" },
  pending_fiscal: { colorClass: "text-warning-foreground", dotClass: "bg-warning" },
  pending_mrp: { colorClass: "text-chart-2", dotClass: "bg-chart-2" },
  completed: { colorClass: "text-success", dotClass: "bg-success" },
}

function workflowToColumns(steps: WorkflowStep[]): KanbanColumn[] {
  return steps.map((s) => {
    const key = s.status_key ?? `step_${s.id}`
    const { colorClass, dotClass } = COLOR_MAP[key] ?? {
      colorClass: "text-primary",
      dotClass: "bg-primary",
    }
    return {
      id: String(s.id),
      label: s.step_name,
      icon: ICON_MAP[key] ?? <FileEdit className="size-4" />,
      colorClass,
      dotClass,
      statuses: [key],
    }
  })
}

interface KanbanBoardProps {
  requests: MaterialRequest[]
  workflowId?: number | null
  onCompleteData?: (id: string) => void
  onViewDetails?: (id: string) => void
}

export function KanbanBoard({
  requests,
  workflowId,
  onCompleteData,
  onViewDetails,
}: KanbanBoardProps) {
  const [columns, setColumns] = useState<KanbanColumn[]>([])

  useEffect(() => {
    const url = workflowId
      ? `/api/workflow/config?workflow_id=${workflowId}`
      : "/api/workflow/config"
    apiGet<WorkflowStep[]>(url)
      .then((steps) => setColumns(workflowToColumns(steps)))
      .catch(() => setColumns([]))
  }, [workflowId])

  if (columns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200/60 py-12 text-center text-sm text-slate-500 dark:border-zinc-400/40 dark:text-muted-foreground">
        Carregando colunas do Kanban...
      </div>
    )
  }

  const allValidStatuses = new Set(columns.flatMap((c) => c.statuses))

  return (
    <ScrollArea className="w-full">
      <div className="flex gap-4 pb-4 min-w-[1000px]">
        {columns.map((col, colIndex) => {
          const matchedItems = requests.filter((r) => col.statuses.includes(r.status))
          const orphanItems =
            colIndex === 0
              ? requests.filter((r) => !allValidStatuses.has(r.status))
              : []
          const items = [...matchedItems, ...orphanItems]
          return (
            <div key={col.id} className="flex w-[260px] shrink-0 flex-col">
              {/* Column header */}
              <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 !bg-white px-3 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.04)] dark:!bg-zinc-400/30 dark:border-zinc-400/40 dark:shadow-none mb-3">
                <div className={cn("shrink-0", col.colorClass)}>{col.icon}</div>
                <span className="text-sm font-semibold text-foreground truncate">
                  {col.label}
                </span>
                <span
                  className={cn(
                    "ml-auto flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                    items.length > 0
                      ? `${col.dotClass} text-white`
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {items.length}
                </span>
              </div>

              {/* Column body */}
              <div className="flex-1 space-y-3 rounded-lg border border-slate-200/60 !bg-white p-2 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.04)] min-h-[400px] dark:!bg-zinc-400/30 dark:border-zinc-400/40 dark:shadow-none">
                {items.length === 0 ? (
                  <EmptyColumn message="Nenhuma requisicao" />
                ) : (
                  items.map((req) => (
                    <RequestCard
                      key={req.id}
                      request={req}
                      variant="kanban"
                      invalidStatus={!allValidStatuses.has(req.status)}
                      onCompleteData={onCompleteData}
                      onViewDetails={onViewDetails}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
