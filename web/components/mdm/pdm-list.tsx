"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, FileDown, Loader2, Plus, Search, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { DashboardHeader } from "@/components/mdm/dashboard-header"
import { PdmImportModal } from "@/components/mdm/pdm-import-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useUser } from "@/contexts/user-context"
import { downloadPdmsExport, getPdms, logAction } from "@/lib/supabase-api"
import {
  applyPdmList,
  DEFAULT_PDM_LIST,
  PDM_LIST_STORAGE_KEY,
  PDM_PAGE_SIZE,
  pdmListQuery,
  readPdmListState,
  type PdmListRow,
  type PdmListState,
  type PdmSort,
} from "@/lib/pdm-list"

const selectClass =
  "h-9 rounded-lg border border-input bg-white px-3 text-sm text-slate-800 dark:bg-card dark:text-foreground"

const COLUMNS: Array<{ key: PdmSort; label: string; className?: string }> = [
  { key: "codigo", label: "Código", className: "w-40" },
  { key: "nome", label: "Nome" },
  { key: "materiais", label: "Materiais", className: "w-36 text-right" },
  { key: "situacao", label: "Situação", className: "w-32" },
]

export function PdmList() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { can } = useUser()
  const showExport = can("can_edit_pdm")
  const showBulkImport = can("can_bulk_import")

  const [pdms, setPdms] = useState<PdmListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState<PdmListState>(() => readPdmListState(searchParams))
  const [exporting, setExporting] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPdms(await getPdms())
    } catch (err) {
      toast.error((err as Error)?.message ?? "Falha ao carregar PDMs")
      setPdms([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const query = pdmListQuery(state)
    window.history.replaceState(null, "", query ? `/admin-pdm?${query}` : "/admin-pdm")
    sessionStorage.setItem(PDM_LIST_STORAGE_KEY, query)
  }, [state])

  const result = useMemo(() => applyPdmList(pdms, state), [pdms, state])
  const hasFilter = state.q.trim() !== "" || state.situacao !== "todos" || state.uso !== "todos"

  const update = (changes: Partial<PdmListState>) =>
    setState((prev) => ({ ...prev, ...changes, pagina: "pagina" in changes ? changes.pagina ?? 1 : 1 }))

  const toggleSort = (key: PdmSort) =>
    setState((prev) => ({
      ...prev,
      ordem: key,
      dir: prev.ordem === key && prev.dir === "asc" ? "desc" : "asc",
      pagina: 1,
    }))

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadPdmsExport()
      void logAction({ category: "pdm", action: "pdm_exported", description: "Exportação de PDMs realizada" })
      toast.success("Exportação concluída!")
    } catch (err) {
      toast.error((err as Error)?.message ?? "Falha ao exportar")
    } finally {
      setExporting(false)
    }
  }

  const first = result.total === 0 ? 0 : (result.page - 1) * PDM_PAGE_SIZE + 1
  const last = Math.min(result.page * PDM_PAGE_SIZE, result.total)

  return (
    <div className="flex flex-col gap-4">
      <DashboardHeader
        status="active"
        minimal
        onSave={() => {}}
        onClone={() => {}}
        headerActions={
          <>
            {showExport && (
              <Button variant="outline" size="sm" className="h-9 shrink-0 gap-2" onClick={handleExport} disabled={exporting}>
                {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
                Exportar Excel
              </Button>
            )}
            {showBulkImport && (
              <Button variant="outline" size="sm" className="h-9 shrink-0 gap-2" onClick={() => setImportOpen(true)}>
                <Upload className="size-4" />
                Importação em Massa
              </Button>
            )}
            <Button size="sm" className="h-9 shrink-0 gap-2" onClick={() => router.push("/admin-pdm/novo")}>
              <Plus className="size-4" />
              Novo PDM
            </Button>
          </>
        }
      />

      <div className="rounded-2xl border border-slate-200/60 bg-white px-6 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:border-zinc-700/50 dark:bg-card">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-64 flex-1">
            <label htmlFor="pdm-search" className="mb-1 block text-xs font-medium text-slate-500 dark:text-muted-foreground">Buscar</label>
            <Search className="absolute bottom-2.5 left-3 size-4 text-slate-400" aria-hidden />
            <Input
              id="pdm-search"
              type="search"
              value={state.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Nome ou código do PDM"
              className="h-9 pl-9"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="pdm-situacao" className="mb-1 block text-xs font-medium text-slate-500 dark:text-muted-foreground">Situação</label>
            <select
              id="pdm-situacao"
              value={state.situacao}
              onChange={(e) => update({ situacao: e.target.value as PdmListState["situacao"] })}
              className={selectClass}
            >
              <option value="todos">Todas</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </select>
          </div>
          <div>
            <label htmlFor="pdm-uso" className="mb-1 block text-xs font-medium text-slate-500 dark:text-muted-foreground">Uso</label>
            <select
              id="pdm-uso"
              value={state.uso}
              onChange={(e) => update({ uso: e.target.value as PdmListState["uso"] })}
              className={selectClass}
            >
              <option value="todos">Todos</option>
              <option value="com">Com materiais</option>
              <option value="sem">Sem materiais</option>
            </select>
          </div>
          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1"
              onClick={() => setState({ ...DEFAULT_PDM_LIST, ordem: state.ordem, dir: state.dir })}
            >
              <X className="size-4" />
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:border-zinc-700/50 dark:bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-muted/30">
              <tr>
                {COLUMNS.map((col) => {
                  const active = state.ordem === col.key
                  const Icon = !active ? ArrowUpDown : state.dir === "asc" ? ArrowUp : ArrowDown
                  return (
                    <th key={col.key} className={`px-4 py-3 text-left font-semibold text-slate-700 dark:text-foreground ${col.className ?? ""}`}>
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`inline-flex items-center gap-1 hover:text-[#0F1C38] dark:hover:text-white ${col.key === "materiais" ? "flex-row-reverse" : ""}`}
                        aria-label={`Ordenar por ${col.label}`}
                      >
                        {col.label}
                        <Icon className={`size-3.5 ${active ? "opacity-100" : "opacity-40"}`} />
                      </button>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </td>
                </tr>
              ) : result.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">
                    {pdms.length === 0 ? "Nenhum PDM cadastrado. Use Novo PDM ou a importação em massa." : "Nenhum PDM com esses filtros."}
                  </td>
                </tr>
              ) : (
                result.rows.map((pdm) => {
                  const active = pdm.is_active !== false
                  const count = pdm.materials_count ?? 0
                  return (
                    <tr
                      key={pdm.id}
                      onClick={() => router.push(`/admin-pdm/${pdm.id}`)}
                      className="cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors hover:bg-slate-50 dark:border-zinc-700/40 dark:hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-mono text-xs uppercase text-slate-600 dark:text-muted-foreground">{pdm.internal_code}</td>
                      <td className="px-4 py-3 font-medium uppercase text-slate-900 dark:text-foreground">
                        <Link href={`/admin-pdm/${pdm.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                          {pdm.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-foreground">{count.toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                            active
                              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-900/30 dark:text-green-400"
                              : "border-slate-200 bg-slate-100 text-slate-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-zinc-700 dark:text-muted-foreground">
          <span>
            {result.total === 0 ? "0 PDMs" : `${first}–${last} de ${result.total.toLocaleString("pt-BR")} PDM${result.total === 1 ? "" : "s"}`}
            {hasFilter && pdms.length !== result.total && ` (filtrados de ${pdms.length.toLocaleString("pt-BR")})`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={result.page <= 1}
              onClick={() => update({ pagina: result.page - 1 })}
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <span className="tabular-nums">Página {result.page} de {result.pages}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={result.page >= result.pages}
              onClick={() => update({ pagina: result.page + 1 })}
            >
              Próxima
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {importOpen && <PdmImportModal onClose={() => setImportOpen(false)} onImported={() => void load()} />}
    </div>
  )
}
