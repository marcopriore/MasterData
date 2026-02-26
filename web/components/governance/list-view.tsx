"use client"

import { RequestCard, EmptyColumn, type MaterialRequest } from "./request-card"

interface ListViewProps {
  requests: MaterialRequest[]
  onCompleteData: (id: string) => void
}

export function ListView({ requests, onCompleteData }: ListViewProps) {
  if (requests.length === 0) {
    return <EmptyColumn message="Nenhuma requisicao encontrada com os filtros atuais." />
  }

  return (
    <div className="space-y-2">
      {/* Column headers */}
      <div className="hidden md:flex items-center gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <div className="size-2.5 shrink-0" />
        <div className="w-40 shrink-0">Material</div>
        <div className="hidden md:block w-24 shrink-0">Categoria</div>
        <div className="hidden lg:block w-36 shrink-0">Solicitante</div>
        <div className="hidden sm:block w-24 shrink-0">Data</div>
        <div className="flex-1 hidden xl:block">Progresso de Enriquecimento</div>
        <div className="xl:hidden w-20 shrink-0">Progresso</div>
        <div className="w-48 shrink-0 text-right">Status</div>
      </div>

      {/* Rows */}
      {requests.map((req) => (
        <RequestCard
          key={req.id}
          request={req}
          variant="list"
          onCompleteData={onCompleteData}
        />
      ))}
    </div>
  )
}
