"use client"

import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import type { PDMTemplate } from "@/components/mdm/category-tree"
import { DashboardHeader } from "@/components/mdm/dashboard-header"
import { PdmDetails } from "@/components/mdm/pdm-details"
import { AttributesTable, type Attribute } from "@/components/mdm/attributes-table"
import { ValueDictionary } from "@/components/mdm/value-dictionary"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Search, Plus, FileText, FileDown, Upload, Loader2, X, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
import { Toaster, toast } from "sonner"
import { cn } from "@/lib/utils"
import { useUser } from "@/contexts/user-context"
import { apiDownloadWithAuth, apiUploadWithAuth, apiGetWithAuth, apiPostWithAuth, apiPutWithAuth } from "@/lib/api"

export default function MDMDashboard() {
  const { accessToken, can } = useUser()
  const showExport = can("can_edit_pdm")
  const showBulkImport = can("can_bulk_import")
  const [pdms, setPdms] = useState<PDMTemplate[]>([])
  const [pdmsLoading, setPdmsLoading] = useState(true)
  const [selectedPdmId, setSelectedPdmId] = useState<number | null>(null)
  const [pdmName, setPdmName] = useState("")
  const [pdmCode, setPdmCode] = useState("")
  const [pdmActive, setPdmActive] = useState(true)
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [valueDictOpen, setValueDictOpen] = useState(false)
  const [selectedAttrId, setSelectedAttrId] = useState<string | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(true)
  const [isAttributesOpen, setIsAttributesOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchFocused, setSearchFocused] = useState(false)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [cloneModalOpen, setCloneModalOpen] = useState(false)
  const [cloneName, setCloneName] = useState("")
  const [cloneCode, setCloneCode] = useState("")
  const [cloneLoading, setCloneLoading] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const [pdmExporting, setPdmExporting] = useState(false)
  const [showPdmImportModal, setShowPdmImportModal] = useState(false)
  const [pdmImportStep, setPdmImportStep] = useState(1)
  const [pdmImportFile, setPdmImportFile] = useState<File | null>(null)
  const [pdmImportResult, setPdmImportResult] = useState<{
    pdm: { total_rows: number; valid_rows: number; error_rows: number; warning_rows: number; rows: Array<{ row_number: number; operacao: string; pdm_code: string | null; nome: string | null; status: string; errors: string[]; warnings: string[] }> }
    attributes: { total_rows: number; valid_rows: number; error_rows: number; warning_rows: number; rows: Array<{ row_number: number; operacao: string; pdm_code: string | null; atributo_key: string | null; status: string; errors: string[]; warnings: string[] }> }
  } | null>(null)
  const [pdmImportDownloading, setPdmImportDownloading] = useState(false)
  const [pdmImportValidating, setPdmImportValidating] = useState(false)
  const [pdmImportConfirming, setPdmImportConfirming] = useState(false)
  const [pdmImportError, setPdmImportError] = useState<string | null>(null)

  useEffect(() => {
    const fetchPdms = async () => {
      if (!accessToken) {
        setPdmsLoading(false)
        return
      }
      try {
        const data = await apiGetWithAuth<PDMTemplate[]>("/api/pdm", accessToken)
        setPdms(Array.isArray(data) ? data : [])
      } catch {
        setPdms([])
      } finally {
        setPdmsLoading(false)
      }
    }
    fetchPdms()
  }, [accessToken])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return pdms
    const q = searchQuery.trim().toLowerCase()
    return pdms.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.internal_code ?? "").toLowerCase().includes(q)
    )
  }, [pdms, searchQuery])

  const showDropdown = searchFocused

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchFocused(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelectPdm = useCallback((pdm: PDMTemplate) => {
    setIsCreatingNew(false)
    setIsEditMode(false)
    setSelectedPdmId(pdm.id)
    setPdmName(pdm.name)
    setPdmCode((pdm.internal_code ?? "").slice(0, 7))
    setPdmActive(pdm.is_active)
    setAttributes(
      (pdm.attributes ?? []).map((a) => ({
        id: a.id,
        order: a.order,
        name: a.name,
        dataType: a.dataType as "numeric" | "text" | "lov",
        isRequired: a.isRequired,
        includeInDescription: a.includeInDescription,
        abbreviation: a.abbreviation,
        allowedValues: a.allowedValues ?? [],
      }))
    )
    setSearchQuery(pdm.name)
    setSearchFocused(false)
  }, [])

  const handleNewPdm = useCallback(() => {
    setIsCreatingNew(true)
    setIsEditMode(true)
    setSelectedPdmId(null)
    setPdmName("")
    setPdmCode("")
    setPdmActive(true)
    setAttributes([])
    setSearchQuery("")
    setSearchFocused(false)
  }, [])

  const handleOpenValueDictionary = useCallback((attrId: string) => {
    setSelectedAttrId(attrId)
    setValueDictOpen(true)
  }, [])

  const handleUpdateValues = useCallback(
    (attrId: string, values: { value: string; abbreviation: string }[]) => {
      setAttributes((prev) =>
        prev.map((a) =>
          a.id === attrId ? { ...a, allowedValues: values } : a
        )
      )
    },
    []
  )

  const handleSave = async () => {
    const payload = {
      name: pdmName,
      internal_code: pdmCode.slice(0, 7),
      is_active: pdmActive,
      attributes: attributes.map((a) => ({
        id: a.id,
        order: a.order,
        name: a.name,
        dataType: a.dataType,
        isRequired: a.isRequired,
        includeInDescription: a.includeInDescription,
        abbreviation: a.abbreviation,
        allowedValues: a.allowedValues ?? [],
      })),
    }

    if (!accessToken) {
      toast.error("Autenticação necessária para salvar.")
      return
    }

    try {
      let saved: PDMTemplate
      if (selectedPdmId != null) {
        saved = await apiPutWithAuth<PDMTemplate>(
          `/api/pdm/${selectedPdmId}`,
          payload,
          accessToken
        )
      } else {
        saved = await apiPostWithAuth<PDMTemplate>(
          "/api/pdm",
          payload,
          accessToken
        )
      }
      toast.success("Estrutura salva com sucesso!", {
        description: `PDM "${pdmName}" foi salvo.`,
      })
      setIsEditMode(false)

      if (selectedPdmId == null) {
        setSelectedPdmId(saved.id)
      }
      setPdms((prev) => {
        const rest = prev.filter((p) => p.id !== saved.id)
        return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name))
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar estrutura."
      toast.error("Falha ao salvar", {
        description: msg,
      })
    }
  }

  const closePdmImportModal = () => {
    setShowPdmImportModal(false)
    setPdmImportStep(1)
    setPdmImportFile(null)
    setPdmImportResult(null)
    setPdmImportError(null)
  }

  const handlePdmDownloadTemplate = async () => {
    if (!accessToken) return
    setPdmImportDownloading(true)
    try {
      await apiDownloadWithAuth("/api/pdm/import-template", accessToken, "template_importacao_pdm.xlsx")
      toast.success("Template baixado com sucesso!")
    } catch (err) {
      toast.error((err as Error)?.message ?? "Falha ao baixar template")
    } finally {
      setPdmImportDownloading(false)
    }
  }

  const handlePdmValidateFile = async () => {
    if (!accessToken || !pdmImportFile) return
    setPdmImportValidating(true)
    setPdmImportError(null)
    try {
      const res = await apiUploadWithAuth<{
        dry_run: boolean
        pdm: { total_rows: number; valid_rows: number; error_rows: number; warning_rows: number; rows: Array<{ row_number: number; operacao: string; pdm_code: string | null; nome: string | null; status: string; errors: string[]; warnings: string[] }> }
        attributes: { total_rows: number; valid_rows: number; error_rows: number; warning_rows: number; rows: Array<{ row_number: number; operacao: string; pdm_code: string | null; atributo_key: string | null; status: string; errors: string[]; warnings: string[] }> }
      }>("/api/pdm/import?dry_run=true", pdmImportFile, accessToken)
      setPdmImportResult(res)
      setPdmImportStep(3)
    } catch (err) {
      setPdmImportError((err as Error)?.message ?? "Falha ao validar planilha")
    } finally {
      setPdmImportValidating(false)
    }
  }

  const handlePdmConfirmImport = async () => {
    if (!accessToken || !pdmImportFile || !pdmImportResult) return
    const hasPdmErrors = pdmImportResult.pdm?.error_rows ? pdmImportResult.pdm.error_rows > 0 : false
    const hasAttrErrors = pdmImportResult.attributes?.error_rows ? pdmImportResult.attributes.error_rows > 0 : false
    if (hasPdmErrors || hasAttrErrors) return
    setPdmImportConfirming(true)
    setPdmImportError(null)
    try {
      const res = await apiUploadWithAuth<{
        dry_run: boolean
        pdm_created: number
        pdm_updated: number
        attr_created: number
        attr_updated: number
        attr_deleted: number
      }>("/api/pdm/import?dry_run=false", pdmImportFile, accessToken)
      toast.success(
        `Importação concluída: ${res.pdm_created + res.pdm_updated} PDM(s), ${res.attr_created + res.attr_updated} atributo(s) criados/atualizados, ${res.attr_deleted} deletados`
      )
      closePdmImportModal()
      try {
        const data = await apiGetWithAuth<PDMTemplate[]>("/api/pdm", accessToken)
        setPdms(data)
      } catch {
        // ignore refresh error
      }
    } catch (err) {
      setPdmImportError((err as Error)?.message ?? "Falha ao importar")
    } finally {
      setPdmImportConfirming(false)
    }
  }

  const handlePdmExport = async () => {
    if (!accessToken) return
    setPdmExporting(true)
    try {
      await apiDownloadWithAuth("/api/pdm/export", accessToken, "pdm_export.xlsx")
      toast.success("Exportação concluída!")
    } catch (err) {
      toast.error((err as Error)?.message ?? "Falha ao exportar")
    } finally {
      setPdmExporting(false)
    }
  }

  const handleOpenCloneModal = () => {
    setCloneName(`Cópia de ${pdmName}`)
    setCloneCode("")
    setCloneModalOpen(true)
  }

  const handleCloneConfirm = async () => {
    if (!cloneName.trim()) {
      toast.error("Nome obrigatório", { description: "Informe o nome do PDM." })
      return
    }
    if (!cloneCode.trim()) {
      toast.error("Código obrigatório", {
        description: "Informe o código interno (máx. 7 caracteres).",
      })
      return
    }
    if (cloneCode.length > 7) {
      toast.error("Código inválido", {
        description: "O código interno deve ter no máximo 7 caracteres.",
      })
      return
    }
    setCloneLoading(true)
    try {
      const clonedAttributes = attributes.map((a, i) => ({
        ...a,
        id: `attr-${Date.now()}-${i}`,
        order: a.order,
        name: a.name,
        dataType: a.dataType,
        isRequired: a.isRequired,
        includeInDescription: a.includeInDescription,
        abbreviation: a.abbreviation,
        allowedValues: a.allowedValues ?? [],
      }))
      const payload = {
        name: cloneName.trim(),
        internal_code: cloneCode.trim().slice(0, 7),
        is_active: true,
        attributes: clonedAttributes,
      }
      if (!accessToken) {
        throw new Error("Autenticação necessária para clonar PDM.")
      }
      const saved = await apiPostWithAuth<PDMTemplate>("/api/pdm", payload, accessToken)
      toast.success("PDM clonado!", {
        description: `"${saved.name}" foi criado com sucesso.`,
      })
      setPdms((prev) => {
        const rest = prev.filter((p) => p.id !== saved.id)
        return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name))
      })
      setCloneModalOpen(false)
      handleSelectPdm(saved)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao clonar PDM."
      toast.error("Falha ao clonar", { description: msg })
    } finally {
      setCloneLoading(false)
    }
  }

  const selectedAttribute = attributes.find((a) => a.id === selectedAttrId) || null
  const hasSelection = selectedPdmId != null || isCreatingNew

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-transparent">
      <Toaster position="top-right" richColors />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Header - always visible */}
        <DashboardHeader
          status={pdmActive ? "active" : "draft"}
          isEditMode={isEditMode}
          onEditClick={() => setIsEditMode(true)}
          onSave={handleSave}
          onClone={handleOpenCloneModal}
          minimal={!hasSelection}
          pdmName={pdmName || undefined}
          headerActions={
            <>
              {showExport && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 gap-2"
                  onClick={handlePdmExport}
                  disabled={pdmExporting}
                >
                  {pdmExporting ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
                  Exportar Excel
                </Button>
              )}
              {showBulkImport && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 gap-2"
                  onClick={() => setShowPdmImportModal(true)}
                >
                  <Upload className="size-4" />
                  Importação em Massa
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-2"
                onClick={handleNewPdm}
              >
                <Plus className="size-4" />
                Novo PDM
              </Button>
            </>
          }
        />

        {/* Search - below header, full width */}
        <div className="shrink-0 border-b border-slate-200/60 bg-white px-6 py-4 dark:border-zinc-700/50 dark:bg-card">
          <div ref={searchContainerRef} className="relative w-full">
            <div className="relative w-full">
              <Search
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Buscar PDM por descrição ou código..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                onFocus={() => setSearchFocused(true)}
                className="h-9 w-full pl-9 pr-3 text-sm uppercase"
                autoComplete="off"
              />
            </div>

            {/* Results dropdown - solid white bg, navy text */}
            {showDropdown && (
              <div
                className={cn(
                  "absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg",
                  "animate-in fade-in-0 zoom-in-95"
                )}
                style={{ backgroundColor: "white" }}
              >
                {pdmsLoading ? (
                  <div className="px-4 py-6 text-center text-sm text-[#0F1C38]">
                    Carregando...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-[#0F1C38]">
                    {searchQuery.trim()
                      ? "Nenhum PDM encontrado"
                      : "Nenhum PDM cadastrado"}
                  </div>
                ) : (
                  <ul className="py-1">
                    {searchResults.map((pdm) => {
                      const count = (pdm as { materials_count?: number }).materials_count ?? 0
                      const countLabel =
                        count === 0
                          ? "Sem materiais"
                          : count === 1
                            ? "1 material"
                            : `${count} materiais`
                      return (
                        <li key={pdm.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectPdm(pdm)}
                            className={cn(
                              "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-[#0F1C38] transition-colors",
                              "hover:bg-slate-100",
                              selectedPdmId === pdm.id && "bg-slate-100 font-semibold"
                            )}
                          >
                            <FileText className="size-4 shrink-0 opacity-70" />
                            <span className="flex-1 truncate uppercase">{pdm.name}</span>
                            <span className="shrink-0 text-xs uppercase opacity-70">
                              {pdm.internal_code}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium border",
                                count === 0
                                  ? "bg-gray-100 text-gray-600 border-gray-200"
                                  : "bg-blue-100 text-blue-800 border-blue-200"
                              )}
                            >
                              {countLabel}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Content - PdmDetails, Attributes, etc. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {hasSelection ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 p-6 pb-0">
                  <PdmDetails
                    name={pdmName}
                    code={pdmCode}
                    isActive={pdmActive}
                    onNameChange={setPdmName}
                    onCodeChange={setPdmCode}
                    onActiveChange={setPdmActive}
                    selectedPdmId={selectedPdmId}
                    isOpen={isDetailsOpen}
                    onToggle={() => setIsDetailsOpen((prev) => !prev)}
                    readOnly={!isEditMode}
                    attributes={attributes}
                    materialsCount={(pdms.find((p) => p.id === selectedPdmId) as { materials_count?: number } | undefined)?.materials_count ?? 0}
                  />
                </div>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col px-6 py-5">
                  <AttributesTable
                    attributes={attributes}
                    onAttributesChange={setAttributes}
                    onOpenValueDictionary={handleOpenValueDictionary}
                    selectedPdmId={selectedPdmId}
                    isOpen={isAttributesOpen}
                    onToggle={() => setIsAttributesOpen((prev) => !prev)}
                    readOnly={!isEditMode}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <p className="text-center text-sm text-slate-500 dark:text-zinc-400">
                Digite para buscar um PDM ou clique em Novo PDM para criar
              </p>
            </div>
          )}
        </div>
      </div>

      <ValueDictionary
        open={valueDictOpen}
        onOpenChange={setValueDictOpen}
        attribute={selectedAttribute}
        onUpdateValues={handleUpdateValues}
      />

      {/* Clone PDM Modal */}
      <Dialog open={cloneModalOpen} onOpenChange={setCloneModalOpen}>
        <DialogContent
          overlayClassName="bg-slate-900/20 backdrop-blur-sm"
          className="border-slate-200 bg-white text-slate-900 shadow-lg dark:border-zinc-600 dark:bg-white dark:text-slate-900 sm:max-w-md"
        >
          <DialogHeader className="pb-2">
            <DialogTitle className="text-slate-900 font-semibold">
              Clonar PDM
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-sm">
              Defina o nome e código do novo PDM. Todos os atributos serão copiados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="clone-name"
                className="text-[11px] font-medium uppercase tracking-wider text-slate-500"
              >
                Novo Nome
              </Label>
              <Input
                id="clone-name"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value.toUpperCase())}
                placeholder="Ex: Bearing Ball Radial"
                className="min-h-[40px] border-slate-200 bg-white text-sm uppercase text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#0F1C38] focus-visible:ring-offset-0 dark:border-slate-300 dark:bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="clone-code"
                className="text-[11px] font-medium uppercase tracking-wider text-slate-500"
              >
                Novo Código Interno
              </Label>
              <Input
                id="clone-code"
                type="text"
                value={cloneCode}
                onChange={(e) => setCloneCode(e.target.value.toUpperCase().slice(0, 7))}
                placeholder="Ex: MEC001"
                maxLength={7}
                className="font-mono min-h-[40px] border-slate-200 bg-white text-sm uppercase text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#0F1C38] focus-visible:ring-offset-0 dark:border-slate-300 dark:bg-white"
              />
              <p className="text-[11px] text-slate-500">Máximo 7 caracteres</p>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setCloneModalOpen(false)}
              disabled={cloneLoading}
              className="border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCloneConfirm}
              disabled={cloneLoading}
              className="gap-2 bg-[#0F1C38] text-white hover:bg-[#0F1C38]/90"
            >
              {cloneLoading ? "Clonando..." : "Clonar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Importação em Massa PDM */}
      {showPdmImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/60 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start justify-between border-b border-zinc-200 px-6 py-4 shrink-0 dark:border-zinc-700">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Importação em Massa de PDM
                </h2>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  Etapa {pdmImportStep} de 3
                </p>
              </div>
              <button
                onClick={closePdmImportModal}
                disabled={pdmImportValidating || pdmImportConfirming}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors disabled:opacity-50"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {pdmImportStep === 1 && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50 space-y-3">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Regras principais:</p>
                    <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                      <li>A planilha tem duas abas: <strong>PDM</strong> e <strong>Atributos</strong></li>
                      <li>PDM: operacao C (Criar) ou E (Editar)</li>
                      <li>Atributos: operacao C, E ou D (Deletar — apenas para atributos)</li>
                      <li>Não alterar os nomes das colunas do cabeçalho</li>
                    </ul>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Aba PDM:</p>
                    <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                      <li><strong>operacao=E</strong>: pdm_code identifica o PDM e não pode ser alterado. Apenas nome, descrição e ativo serão atualizados.</li>
                    </ul>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Aba Atributos:</p>
                    <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                      <li><strong>operacao=E</strong>: o par pdm_code + atributo_key identifica o atributo e nenhum dos dois pode ser alterado. Use D + C para renomear.</li>
                      <li><strong>operacao=D</strong>: remove o atributo. Requer pdm_code e atributo_key.</li>
                    </ul>
                  </div>
                  <Button
                    onClick={handlePdmDownloadTemplate}
                    disabled={pdmImportDownloading}
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {pdmImportDownloading ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
                    Baixar Planilha Template
                  </Button>
                </div>
              )}
              {pdmImportStep === 2 && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => { e.preventDefault() }}
                    onDragLeave={() => {}}
                    onDrop={(e) => {
                      e.preventDefault()
                      const f = e.dataTransfer.files[0]
                      if (f && (f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))) {
                        setPdmImportFile(f)
                      } else {
                        toast.error("Apenas arquivos .xlsx ou .xls são aceitos")
                      }
                    }}
                    onClick={() => document.getElementById("pdm-import-file")?.click()}
                    className="border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500"
                  >
                    <input
                      id="pdm-import-file"
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) setPdmImportFile(f)
                        e.target.value = ""
                      }}
                    />
                    <FileSpreadsheet className="size-10 text-zinc-400 dark:text-zinc-500" />
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Arraste a planilha aqui ou clique para selecionar
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Formatos aceitos: .xlsx, .xls</p>
                    {pdmImportFile && (
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-2">
                        ✓ {pdmImportFile.name}
                      </p>
                    )}
                  </div>
                  {pdmImportFile && (
                    <Button onClick={handlePdmValidateFile} disabled={pdmImportValidating} className="gap-2">
                      {pdmImportValidating ? <Loader2 className="size-4 animate-spin" /> : null}
                      Validar Planilha
                    </Button>
                  )}
                </div>
              )}
              {pdmImportStep === 3 && pdmImportResult && (
                <div className="space-y-6">
                  {pdmImportError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{pdmImportError}</p>
                  )}
                  {/* PDM section */}
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Aba PDM</h3>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        Total: {pdmImportResult.pdm?.total_rows ?? 0}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Válidas: {pdmImportResult.pdm?.valid_rows ?? 0}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                        Avisos: {pdmImportResult.pdm?.warning_rows ?? 0}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        Erros: {pdmImportResult.pdm?.error_rows ?? 0}
                      </span>
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Linha</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Op.</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Código</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Nome</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Status</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Erros/Avisos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(pdmImportResult.pdm?.rows ?? [])
                            .sort((a, b) => (a.status === "error" ? 0 : a.status === "warning" ? 1 : 2) - (b.status === "error" ? 0 : b.status === "warning" ? 1 : 2))
                            .map((r) => (
                              <tr
                                key={`pdm-${r.row_number}`}
                                className={
                                  r.status === "error"
                                    ? "bg-red-50 dark:bg-red-900/20"
                                    : r.status === "warning"
                                      ? "bg-yellow-50 dark:bg-yellow-900/20"
                                      : "bg-white dark:bg-zinc-900"
                                }
                              >
                                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.row_number}</td>
                                <td className="px-3 py-2">
                                  {r.operacao === "C" && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Criação</span>}
                                  {r.operacao === "E" && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Edição</span>}
                                  {r.operacao === "D" && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Exclusão</span>}
                                  {!["C","E","D"].includes(r.operacao) && <span className="text-zinc-600 dark:text-zinc-400">{r.operacao}</span>}
                                </td>
                                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.pdm_code ?? "—"}</td>
                                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 max-w-[140px] truncate">{r.nome ?? "—"}</td>
                                <td className="px-3 py-2">
                                  {r.status === "ok" && <span className="text-green-600 dark:text-green-400"><CheckCircle2 className="size-3.5 inline" /> ok</span>}
                                  {r.status === "warning" && <span className="text-yellow-600 dark:text-yellow-400"><AlertTriangle className="size-3.5 inline" /> aviso</span>}
                                  {r.status === "error" && <span className="text-red-600 dark:text-red-400"><XCircle className="size-3.5 inline" /> erro</span>}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {r.errors?.map((e, i) => <p key={i} className="text-red-600 dark:text-red-400"><XCircle className="size-3 inline" /> {e}</p>)}
                                  {r.warnings?.map((w, i) => <p key={i} className="text-yellow-600 dark:text-yellow-400"><AlertTriangle className="size-3 inline" /> {w}</p>)}
                                  {(!r.errors?.length && !r.warnings?.length) && "—"}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {/* Attributes section */}
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Aba Atributos</h3>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        Total: {pdmImportResult.attributes?.total_rows ?? 0}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Válidas: {pdmImportResult.attributes?.valid_rows ?? 0}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                        Avisos: {pdmImportResult.attributes?.warning_rows ?? 0}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        Erros: {pdmImportResult.attributes?.error_rows ?? 0}
                      </span>
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Linha</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Op.</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">PDM</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Key</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Label</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Status</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Erros/Avisos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(pdmImportResult.attributes?.rows ?? [])
                            .sort((a, b) => (a.status === "error" ? 0 : a.status === "warning" ? 1 : 2) - (b.status === "error" ? 0 : b.status === "warning" ? 1 : 2))
                            .map((r) => (
                              <tr
                                key={`attr-${r.row_number}`}
                                className={
                                  r.status === "error"
                                    ? "bg-red-50 dark:bg-red-900/20"
                                    : r.status === "warning"
                                      ? "bg-yellow-50 dark:bg-yellow-900/20"
                                      : "bg-white dark:bg-zinc-900"
                                }
                              >
                                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.row_number}</td>
                                <td className="px-3 py-2">
                                  {r.operacao === "C" && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Criação</span>}
                                  {r.operacao === "E" && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Edição</span>}
                                  {r.operacao === "D" && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Exclusão</span>}
                                  {!["C","E","D"].includes(r.operacao) && <span className="text-zinc-600 dark:text-zinc-400">{r.operacao}</span>}
                                </td>
                                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.pdm_code ?? "—"}</td>
                                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.atributo_key ?? "—"}</td>
                                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 max-w-[120px] truncate">{(r as { data?: { label?: string } }).data?.label ?? "—"}</td>
                                <td className="px-3 py-2">
                                  {r.status === "ok" && <span className="text-green-600 dark:text-green-400"><CheckCircle2 className="size-3.5 inline" /> ok</span>}
                                  {r.status === "warning" && <span className="text-yellow-600 dark:text-yellow-400"><AlertTriangle className="size-3.5 inline" /> aviso</span>}
                                  {r.status === "error" && <span className="text-red-600 dark:text-red-400"><XCircle className="size-3.5 inline" /> erro</span>}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {r.errors?.map((e, i) => <p key={i} className="text-red-600 dark:text-red-400"><XCircle className="size-3 inline" /> {e}</p>)}
                                  {r.warnings?.map((w, i) => <p key={i} className="text-yellow-600 dark:text-yellow-400"><AlertTriangle className="size-3 inline" /> {w}</p>)}
                                  {(!r.errors?.length && !r.warnings?.length) && "—"}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {((pdmImportResult.pdm?.error_rows ?? 0) + (pdmImportResult.attributes?.error_rows ?? 0)) > 0
                      ? "Corrija os erros antes de confirmar a importação"
                      : "Pronto para confirmar a importação"}
                  </p>
                </div>
              )}
            </div>
            <div className="border-t border-zinc-200 px-6 py-4 flex justify-between shrink-0 dark:border-zinc-700">
              <div>
                {pdmImportStep === 1 && <Button variant="outline" size="sm" onClick={closePdmImportModal}>Cancelar</Button>}
                {pdmImportStep === 2 && <Button variant="outline" size="sm" onClick={() => setPdmImportStep(1)}>← Voltar</Button>}
                {pdmImportStep === 3 && <Button variant="outline" size="sm" onClick={() => setPdmImportStep(2)} disabled={pdmImportConfirming}>← Voltar</Button>}
              </div>
              <div className="flex gap-2">
                {pdmImportStep === 1 && <Button size="sm" onClick={() => setPdmImportStep(2)}>Próximo →</Button>}
                {pdmImportStep === 2 && (
                  <Button size="sm" onClick={handlePdmValidateFile} disabled={!pdmImportFile || pdmImportValidating}>
                    {pdmImportValidating ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                    Validar Planilha
                  </Button>
                )}
                {pdmImportStep === 3 && (
                  <Button
                    size="sm"
                    onClick={handlePdmConfirmImport}
                    disabled={
                      (pdmImportResult?.pdm?.error_rows ?? 0) > 0 ||
                      (pdmImportResult?.attributes?.error_rows ?? 0) > 0 ||
                      pdmImportConfirming
                    }
                    className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                  >
                    {pdmImportConfirming ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                    Confirmar Importação
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
