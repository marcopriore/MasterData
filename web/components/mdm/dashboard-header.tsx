"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Save, Copy, Home, Pencil } from "lucide-react"
import Link from "next/link"

interface DashboardHeaderProps {
  status: "draft" | "active"
  isEditMode?: boolean
  onEditClick?: () => void
  onSave: () => void
  onClone: () => void
  minimal?: boolean
  pdmName?: string
  /** Ações exibidas à direita na linha do título (ex: Exportar, Importação, Novo PDM) */
  headerActions?: React.ReactNode
}

export function DashboardHeader({ status, isEditMode = false, onEditClick, onSave, onClone, minimal = false, pdmName, headerActions }: DashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-3 rounded-2xl border-b border-slate-200/60 bg-white px-6 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.04)] dark:border-zinc-700/50 dark:bg-card dark:shadow-[0_2px_8px_rgba(0,0,0,0.2),0_4px_6px_-1px_rgba(0,0,0,0.1)] md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link
                  href="/"
                  className="flex items-center gap-1 text-slate-500 hover:text-[#0F1C38] dark:text-muted-foreground dark:hover:text-foreground"
                >
                  <Home className="size-3.5" />
                  Home
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Gestão PDM</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground tracking-tight">
            {minimal ? "Gestão PDM" : (pdmName || "Material Description Pattern")}
          </h1>
          {!minimal && (
          <Badge
            variant={status === "active" ? "default" : "secondary"}
            className={
              status === "active"
                ? "bg-success text-success-foreground"
                : "bg-warning/15 text-warning-foreground border border-warning/30"
            }
          >
            {status === "active" ? "Ativo" : "Rascunho"}
          </Badge>
          )}
        </div>
      </div>
        <div className="flex items-center gap-2">
        {headerActions}
        {!minimal && (
          <>
        {isEditMode ? (
          <Button size="sm" onClick={onSave} className="gap-1.5 rounded-xl bg-[#0F1C38] text-white hover:bg-[#0F1C38]/90">
            <Save className="size-3.5" />
            Salvar Alterações
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onEditClick} className="gap-1.5 rounded-xl">
            <Pencil className="size-3.5" />
            Editar PDM
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onClone} className="gap-1.5 rounded-xl">
          <Copy className="size-3.5" />
          Clonar PDM
        </Button>
          </>
        )}
      </div>
    </header>
  )
}
