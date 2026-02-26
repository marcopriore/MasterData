"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
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
import { Save, Copy, Home, FileText, ClipboardList, Sun, Moon } from "lucide-react"
import Link from "next/link"

interface DashboardHeaderProps {
  status: "draft" | "active"
  onSave: () => void
  onClone: () => void
}

export function DashboardHeader({ status, onSave, onClone }: DashboardHeaderProps) {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === "dark"

  return (
    <header className="flex flex-col gap-3 rounded-2xl border-b border-slate-200/60 bg-white px-6 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.04)] dark:border-zinc-700/50 dark:bg-card dark:shadow-[0_2px_8px_rgba(0,0,0,0.2),0_4px_6px_-1px_rgba(0,0,0,0.1)] md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                <Home className="size-3.5" />
                Home
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#" className="text-muted-foreground hover:text-foreground">
                Mechanical
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Bearings</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground tracking-tight">
            Material Description Pattern
          </h1>
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
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-xl shrink-0"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {mounted ? (
            isDark ? (
              <Moon className="size-4 transition-transform duration-200" />
            ) : (
              <Sun className="size-4 transition-transform duration-200" />
            )
          ) : (
            <Moon className="size-4 opacity-50" />
          )}
        </Button>
        <Link href="/governance">
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl">
            <ClipboardList className="size-3.5" />
            <span className="hidden sm:inline">Governanca</span>
          </Button>
        </Link>
        <Link href="/request">
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl">
            <FileText className="size-3.5" />
            <span className="hidden sm:inline">Nova Requisicao</span>
          </Button>
        </Link>
        <Button variant="outline" size="sm" onClick={onClone} className="gap-1.5 rounded-xl">
          <Copy className="size-3.5" />
          Clonar PDM
        </Button>
        <Button size="sm" onClick={onSave} className="gap-1.5 rounded-xl">
          <Save className="size-3.5" />
          Salvar Estrutura
        </Button>
      </div>
    </header>
  )
}
