"use client"

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { RequestCard, EmptyColumn, type MaterialRequest } from "./request-card"
import { cn } from "@/lib/utils"
import {
  FileEdit,
  Microscope,
  Receipt,
  CheckCircle2,
  FileQuestion,
} from "lucide-react"

interface KanbanColumn {
  id: string
  label: string
  icon: React.ReactNode
  colorClass: string
  dotClass: string
  statuses: string[]
}

const columns: KanbanColumn[] = [
  {
    id: "draft",
    label: "Rascunho",
    icon: <FileQuestion className="size-4" />,
    colorClass: "text-muted-foreground",
    dotClass: "bg-muted-foreground",
    statuses: ["draft"],
  },
  {
    id: "technical",
    label: "Revisao Tecnica",
    icon: <Microscope className="size-4" />,
    colorClass: "text-primary",
    dotClass: "bg-primary",
    statuses: ["pending_technical"],
  },
  {
    id: "fiscal",
    label: "Enriquecimento Fiscal",
    icon: <Receipt className="size-4" />,
    colorClass: "text-warning-foreground",
    dotClass: "bg-warning",
    statuses: ["pending_fiscal"],
  },
  {
    id: "mrp",
    label: "Dados MRP",
    icon: <FileEdit className="size-4" />,
    colorClass: "text-chart-2",
    dotClass: "bg-chart-2",
    statuses: ["pending_mrp"],
  },
  {
    id: "completed",
    label: "Concluido",
    icon: <CheckCircle2 className="size-4" />,
    colorClass: "text-success",
    dotClass: "bg-success",
    statuses: ["completed"],
  },
]

interface KanbanBoardProps {
  requests: MaterialRequest[]
  onCompleteData: (id: string) => void
}

export function KanbanBoard({ requests, onCompleteData }: KanbanBoardProps) {
  return (
    <ScrollArea className="w-full">
      <div className="flex gap-4 pb-4 min-w-[1000px]">
        {columns.map((col) => {
          const items = requests.filter((r) => col.statuses.includes(r.status))
          return (
            <div key={col.id} className="flex w-[260px] shrink-0 flex-col">
              {/* Column header */}
              <div className="flex items-center gap-2 rounded-lg bg-card border px-3 py-2.5 mb-3">
                <div className={cn("shrink-0", col.colorClass)}>{col.icon}</div>
                <span className="text-sm font-semibold text-foreground truncate">
                  {col.label}
                </span>
                <span
                  className={cn(
                    "ml-auto flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
                    items.length > 0
                      ? `${col.dotClass} text-card`
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {items.length}
                </span>
              </div>

              {/* Column body */}
              <div className="flex-1 space-y-3 rounded-lg bg-muted/30 border border-dashed p-2 min-h-[400px]">
                {items.length === 0 ? (
                  <EmptyColumn message="Nenhuma requisicao" />
                ) : (
                  items.map((req) => (
                    <RequestCard
                      key={req.id}
                      request={req}
                      variant="kanban"
                      onCompleteData={onCompleteData}
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
