"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  LayoutGrid,
  List,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface FiltersBarProps {
  search: string
  onSearchChange: (value: string) => void
  category: string
  onCategoryChange: (value: string) => void
  dateRange: string
  onDateRangeChange: (value: string) => void
  view: "kanban" | "list"
  onViewChange: (view: "kanban" | "list") => void
  resultCount: number
}

export function FiltersBar({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  dateRange,
  onDateRangeChange,
  view,
  onViewChange,
  resultCount,
}: FiltersBarProps) {
  const hasFilters = search || category !== "all" || dateRange !== "all"

  const clearFilters = () => {
    onSearchChange("")
    onCategoryChange("all")
    onDateRangeChange("all")
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por solicitante, material ou ID..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-10 bg-card"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={onCategoryChange}>
            <SelectTrigger className="h-10 w-[150px] bg-card">
              <SlidersHorizontal className="size-3.5 text-muted-foreground mr-1.5" />
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="mechanical">Mechanical</SelectItem>
              <SelectItem value="electrical">Electrical</SelectItem>
              <SelectItem value="ppe">PPE</SelectItem>
              <SelectItem value="office">Office</SelectItem>
            </SelectContent>
          </Select>

          <Select value={dateRange} onValueChange={onDateRangeChange}>
            <SelectTrigger className="h-10 w-[140px] bg-card">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="week">Esta Semana</SelectItem>
              <SelectItem value="month">Este Mes</SelectItem>
              <SelectItem value="quarter">Trimestre</SelectItem>
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="flex items-center rounded-lg border bg-card p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 rounded-md",
                view === "kanban" && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              )}
              onClick={() => onViewChange("kanban")}
            >
              <LayoutGrid className="size-4" />
              <span className="sr-only">Visualizacao Kanban</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 rounded-md",
                view === "list" && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
              )}
              onClick={() => onViewChange("list")}
            >
              <List className="size-4" />
              <span className="sr-only">Visualizacao Lista</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Active filters summary */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{resultCount}</span>{" "}
          requisicao{resultCount !== 1 ? "es" : ""} encontrada{resultCount !== 1 ? "s" : ""}
        </p>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={clearFilters}
          >
            <X className="size-3" />
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  )
}
