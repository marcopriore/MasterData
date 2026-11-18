"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { RequestCard, EmptyColumn, type MaterialRequest } from "./request-card"
import type { RequestErpState } from "@/lib/request-erp-state"
import { pageSlice } from "@/lib/pagination"
import { Button } from "@/components/ui/button"

/** Linhas por página na visão lista. */
const LIST_PAGE_SIZE = 50

interface ListViewProps {
  requests: MaterialRequest[]
  onCompleteData?: (id: string) => void
  onViewDetails?: (id: string) => void
  /** Situação no ERP por id da solicitação (só finalizadas) */
  erpStates?: Record<string, RequestErpState>
}

export function ListView({ requests, onCompleteData, onViewDetails, erpStates = {} }: ListViewProps) {
  const [page, setPage] = useState(1)
  // Filtro ou busca novos voltam para a primeira página.
  useEffect(() => { setPage(1) }, [requests.length])

  if (requests.length === 0) {
    return <EmptyColumn message="Nenhuma requisicao encontrada com os filtros atuais." />
  }

  const view = pageSlice(requests, page, LIST_PAGE_SIZE)

  return (
    <div className="space-y-2">
      {/* Column headers */}
      <div className="hidden md:flex items-center gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <div className="size-2.5 shrink-0" />
        <div className="w-40 shrink-0">Material</div>
        <div className="hidden md:block w-24 shrink-0">Prioridade</div>
        <div className="hidden lg:block w-36 shrink-0">Solicitante</div>
        <div className="hidden sm:block w-24 shrink-0">Data</div>
        <div className="flex-1 hidden lg:block">Andamento por etapa</div>
        <div className="lg:hidden w-20 shrink-0">Progresso</div>
        <div className="w-48 shrink-0 text-right">Status</div>
      </div>

      {/* Rows */}
      {view.items.map((req) => (
        <RequestCard
          key={req.id}
          request={req}
          variant="list"
          onCompleteData={onCompleteData}
          onViewDetails={onViewDetails}
          erpState={erpStates[req.id]}
        />
      ))}

      {view.pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-2 text-sm">
          <span className="text-muted-foreground" aria-live="polite">
            {view.from.toLocaleString("pt-BR")}–{view.to.toLocaleString("pt-BR")} de {view.total.toLocaleString("pt-BR")}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1" disabled={view.page <= 1} onClick={() => setPage(view.page - 1)}>
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <span className="tabular-nums text-muted-foreground">Página {view.page} de {view.pages}</span>
            <Button variant="outline" size="sm" className="gap-1" disabled={view.page >= view.pages} onClick={() => setPage(view.page + 1)}>
              Próxima
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
