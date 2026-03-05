"use client"

import { useState, useEffect, useCallback } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { RequestCard, EmptyColumn, type MaterialRequest } from "./request-card"
import { apiGetWithAuth, apiPatchWithAuth } from "@/lib/api"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkflowStep = {
  id: number
  step_name: string
  status_key: string
  order: number
  is_active: boolean
}

interface KanbanColumn {
  id: string          // status_key
  label: string
  colorClass: string
  dotClass: string
}

// ─── Colour palette cycling for dynamic workflow steps ────────────────────────

const PALETTE: Array<{ colorClass: string; dotClass: string }> = [
  { colorClass: "text-primary",              dotClass: "bg-primary" },
  { colorClass: "text-warning-foreground",   dotClass: "bg-warning" },
  { colorClass: "text-chart-2",              dotClass: "bg-chart-2" },
  { colorClass: "text-success",              dotClass: "bg-success" },
  { colorClass: "text-destructive",          dotClass: "bg-destructive" },
]

const FIXED_COLORS: Record<string, { colorClass: string; dotClass: string }> = {
  draft:             { colorClass: "text-muted-foreground", dotClass: "bg-muted-foreground" },
  completed:         { colorClass: "text-success",          dotClass: "bg-success" },
  rejected:          { colorClass: "text-destructive",      dotClass: "bg-destructive" },
}

function workflowToColumns(steps: WorkflowStep[]): KanbanColumn[] {
  return steps.map((s, i) => {
    const key = s.status_key
    const colors = FIXED_COLORS[key] ?? PALETTE[i % PALETTE.length]
    return { id: key, label: s.step_name, ...colors }
  })
}

// ─── Sortable card wrapper ─────────────────────────────────────────────────────

function SortableCard({
  request,
  allValidStatuses,
  onCompleteData,
  onViewDetails,
  showActionButtons,
  currentUserId,
  onIniciarAtendimentoClick,
}: {
  request: MaterialRequest
  allValidStatuses: Set<string>
  onCompleteData?: (id: string) => void
  onViewDetails?: (id: string) => void
  showActionButtons?: boolean
  currentUserId?: number | null
  onIniciarAtendimentoClick?: (request: MaterialRequest) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: request.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    touchAction: "none",
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <RequestCard
        request={request}
        variant="kanban"
        invalidStatus={!allValidStatuses.has(request.status)}
        onCompleteData={onCompleteData}
        onViewDetails={onViewDetails}
        showActionButtons={showActionButtons}
        currentUserId={currentUserId}
        onIniciarAtendimentoClick={onIniciarAtendimentoClick ? () => onIniciarAtendimentoClick(request) : undefined}
      />
    </div>
  )
}

// ─── Main board ───────────────────────────────────────────────────────────────

interface KanbanBoardProps {
  requests: MaterialRequest[]
  workflowId?: number | null
  onCompleteData?: (id: string) => void
  onViewDetails?: (id: string) => void
  onStatusChanged?: (requestId: string, newStatus?: string) => void
  /** Chamado após sucesso do assign — abre o modal de detalhes com dados atualizados */
  onAssignSuccess?: (requestId: string) => void
  showActionButtons?: boolean
  currentUserId?: number | null
  accessToken?: string | null
}

export function KanbanBoard({
  requests,
  workflowId,
  onCompleteData,
  onViewDetails,
  onStatusChanged,
  onAssignSuccess,
  showActionButtons = false,
  currentUserId = null,
  accessToken = null,
}: KanbanBoardProps) {
  const [columns, setColumns] = useState<KanbanColumn[]>([])
  const [columnsLoading, setColumnsLoading] = useState(true)

  // Local copy of requests for optimistic updates
  const [localRequests, setLocalRequests] = useState<MaterialRequest[]>(requests)
  // Track which card is being dragged
  const [activeCard, setActiveCard] = useState<MaterialRequest | null>(null)
  // Track which column the dragged card is hovering over
  const [overColumnId, setOverColumnId] = useState<string | null>(null)
  // Sync local copy when parent prop changes (e.g. after a refetch)
  useEffect(() => { setLocalRequests(requests) }, [requests])

  const handleIniciarAtendimento = async (req: MaterialRequest) => {
    if (!accessToken) {
      toast.error("Autenticação necessária para iniciar atendimento.")
      return
    }
    try {
      await apiPatchWithAuth(`/api/requests/${req.id}/assign`, {}, accessToken)
      toast.success("Atendimento iniciado com sucesso!")
      if (onAssignSuccess) {
        onAssignSuccess(req.id)
      } else {
        onStatusChanged?.(req.id)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao iniciar atendimento"
      toast.error(msg)
    }
  }

  useEffect(() => {
    if (!accessToken) {
      setColumnsLoading(false)
      setColumns([])
      return
    }
    setColumnsLoading(true)
    const url = workflowId
      ? `/api/workflow/config?workflow_id=${workflowId}`
      : "/api/workflow/config"
    apiGetWithAuth<WorkflowStep[]>(url, accessToken)
      .then((steps) => setColumns(workflowToColumns(steps.filter((s) => s.is_active))))
      .catch(() => setColumns([]))
      .finally(() => setColumnsLoading(false))
  }, [workflowId, accessToken])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require 8px movement before drag starts — prevents accidental drags on click
      activationConstraint: { distance: 8 },
    })
  )

  const allValidStatuses = new Set(columns.map((c) => c.id))

  // Build a lookup: status_key → column id (same thing here, but explicit)
  const cardsByColumn = useCallback(
    (colId: string) => {
      const matched = localRequests.filter((r) => r.status === colId)
      // Orphaned cards (unknown status) fall into the first column
      const orphans =
        columns.length > 0 && colId === columns[0].id
          ? localRequests.filter((r) => !allValidStatuses.has(r.status))
          : []
      return [...matched, ...orphans]
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [localRequests, columns]
  )

  // ── Drag handlers ────────────────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    const card = localRequests.find((r) => r.id === event.active.id)
    setActiveCard(card ?? null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (!over) { setOverColumnId(null); return }

    // `over.id` is either a column id (status_key) or a card id
    const isColumn = columns.some((c) => c.id === over.id)
    if (isColumn) {
      setOverColumnId(String(over.id))
    } else {
      // Find which column the hovered card belongs to
      const targetCard = localRequests.find((r) => r.id === over.id)
      setOverColumnId(targetCard?.status ?? null)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveCard(null)
    setOverColumnId(null)

    if (!over) return

    const draggedCard = localRequests.find((r) => r.id === active.id)
    if (!draggedCard) return

    // Resolve the target column
    const isColumn = columns.some((c) => c.id === over.id)
    const targetColumnId = isColumn
      ? String(over.id)
      : localRequests.find((r) => r.id === over.id)?.status ?? null

    if (!targetColumnId || targetColumnId === draggedCard.status) return
    if (!accessToken) {
      toast.error("Autenticação necessária para mover solicitação")
      return
    }

    // ── Optimistic update ─────────────────────────────────────────────────────
    setLocalRequests((prev) =>
      prev.map((r) => r.id === draggedCard.id ? { ...r, status: targetColumnId } : r)
    )

    // ── Persist to backend ────────────────────────────────────────────────────
    try {
      await apiPatchWithAuth(`/api/requests/${draggedCard.id}/move-to`, {
        status_key: targetColumnId,
      }, accessToken)
      onStatusChanged?.(draggedCard.id, targetColumnId)
    } catch (err: unknown) {
      // Roll back optimistic update
      setLocalRequests((prev) =>
        prev.map((r) => r.id === draggedCard.id ? { ...r, status: draggedCard.status } : r)
      )
      const msg = err instanceof Error ? err.message : "Erro desconhecido"
      toast.error("Falha ao mover solicitação", { description: msg })
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (columnsLoading) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm" style={{ borderColor: 'var(--kanban-col-border)', color: 'var(--kanban-col-text)' }}>
        Carregando colunas do Kanban…
      </div>
    )
  }

  if (columns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm" style={{ borderColor: 'var(--kanban-col-border)', color: 'var(--kanban-col-text)' }}>
        Nenhuma etapa de workflow configurada.
      </div>
    )
  }

  const columnsToRender = showActionButtons
    ? columns.filter((col) => cardsByColumn(col.id).length > 0)
    : columns

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4 min-w-[900px]">
          {columnsToRender.map((col) => {
            const items = cardsByColumn(col.id)
            const isOver = overColumnId === col.id && activeCard?.status !== col.id

            return (
              <div key={col.id} className="flex w-[260px] shrink-0 flex-col">
                {/* Column header */}
                <div
                  className="mb-3 flex items-center gap-2 rounded-lg border px-3 py-2.5 shadow-sm"
                  style={{ backgroundColor: 'var(--kanban-col-header-bg)', borderColor: 'var(--kanban-col-border)' }}
                >
                  <span className="text-sm font-semibold uppercase truncate" style={{ color: 'var(--kanban-col-text)' }}>
                    {col.label}
                  </span>
                  <span
                    className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold border"
                    style={{
                      backgroundColor: items.length > 0 ? 'var(--kanban-col-header-bg)' : 'var(--kanban-col-badge-empty)',
                      color: 'var(--kanban-col-text)',
                      borderColor: 'var(--kanban-col-border)',
                    }}
                  >
                    {items.length}
                  </span>
                </div>

                {/* Column body — droppable zone */}
                <SortableContext
                  id={col.id}
                  items={items.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div
                    className={cn(
                      "flex-1 min-h-[200px] max-h-[560px] space-y-2.5 overflow-y-auto rounded-lg border p-2 shadow-sm transition-colors duration-150",
                      isOver && "ring-2 ring-primary/40"
                    )}
                    style={{
                      backgroundColor: isOver ? 'var(--kanban-col-header-bg)' : 'var(--kanban-col-body-bg)',
                      borderColor: isOver ? 'var(--kanban-col-border)' : 'var(--kanban-col-border)',
                    }}
                  >
                    {items.length === 0 ? (
                      <EmptyColumn message="Arraste um card aqui" />
                    ) : (
                      items.map((req) => (
                        <SortableCard
                          key={req.id}
                          request={req}
                          allValidStatuses={allValidStatuses}
                          onCompleteData={onCompleteData}
                          onViewDetails={onViewDetails}
                          showActionButtons={showActionButtons}
                          currentUserId={currentUserId}
                          onIniciarAtendimentoClick={showActionButtons ? handleIniciarAtendimento : undefined}
                        />
                      ))
                    )}
                  </div>
                </SortableContext>
              </div>
            )
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Drag overlay — the floating ghost card */}
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
        {activeCard ? (
          <div className="rotate-1 scale-105 opacity-95 shadow-xl">
            <RequestCard
              request={activeCard}
              variant="kanban"
              invalidStatus={!allValidStatuses.has(activeCard.status)}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
