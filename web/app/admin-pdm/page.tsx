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
import { Search, Plus, FileText } from "lucide-react"
import { Toaster, toast } from "sonner"
import { cn } from "@/lib/utils"

export default function MDMDashboard() {
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

  useEffect(() => {
    const fetchPdms = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/pdm")
        if (res.ok) {
          const data = await res.json()
          setPdms(data)
        }
      } catch {
        // ignore
      } finally {
        setPdmsLoading(false)
      }
    }
    fetchPdms()
  }, [])

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

    const url =
      selectedPdmId != null
        ? `http://localhost:8000/api/pdm/${selectedPdmId}`
        : "http://localhost:8000/api/pdm"
    const method = selectedPdmId != null ? "PUT" : "POST"

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const detail = err.detail
        const msg = Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).join(", ")
          : detail ?? `HTTP ${res.status}`
        throw new Error(msg)
      }

      const saved = await res.json()
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
      const res = await fetch("http://localhost:8000/api/pdm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const detail = err.detail
        const msg = Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).join(", ")
          : detail ?? `HTTP ${res.status}`
        throw new Error(msg)
      }
      const saved = await res.json()
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
        />

        {/* Search - below header, above Detalhes do PDM */}
        <div className="shrink-0 border-b border-slate-200/60 bg-white px-6 py-4 dark:border-zinc-700/50 dark:bg-card">
          <div ref={searchContainerRef} className="relative max-w-xl">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <Input
                  type="search"
                  placeholder=""
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                  onFocus={() => setSearchFocused(true)}
                  className="h-9 pl-9 pr-3 text-sm uppercase"
                  autoComplete="off"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-2"
                onClick={handleNewPdm}
              >
                <Plus className="size-4" />
                Novo PDM
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              Buscar PDM por descrição ou código
            </p>

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
    </div>
  )
}
