"use client"

import { cn } from "@/lib/utils"
import { FileText } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface PDMTemplate {
  id: number
  name: string
  internal_code: string
  is_active: boolean
  attributes: Array<{
    id: string
    order: number
    name: string
    dataType: string
    isRequired: boolean
    includeInDescription: boolean
    abbreviation: string
    allowedValues?: Array<{ value: string; abbreviation: string }>
  }>
}

interface CategoryTreeProps {
  pdms: PDMTemplate[]
  selectedPdmId: number | null
  onSelectPdm: (pdm: PDMTemplate) => void
  isLoading?: boolean
}

export function CategoryTree({
  pdms,
  selectedPdmId,
  onSelectPdm,
  isLoading = false,
}: CategoryTreeProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-3">
        <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
          PDM Templates
        </p>
        {isLoading ? (
          <p className="px-2 py-4 text-sm text-sidebar-foreground/70">
            Carregando...
          </p>
        ) : pdms.length === 0 ? (
          <p className="px-2 py-4 text-sm text-sidebar-foreground/70">
            Nenhum PDM cadastrado
          </p>
        ) : (
          <div className="space-y-0.5">
            {pdms.map((pdm) => {
              const isSelected = selectedPdmId === pdm.id
              return (
                <button
                  key={pdm.id}
                  onClick={() => onSelectPdm(pdm)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors duration-300",
                    isSelected
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <FileText className="size-4 shrink-0 opacity-70" />
                  <span className="truncate">{pdm.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] opacity-60">
                    {pdm.internal_code}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
