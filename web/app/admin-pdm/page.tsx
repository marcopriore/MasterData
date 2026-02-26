"use client"

import { useState, useCallback, useEffect } from "react"
import { CategoryTree, type PDMTemplate } from "@/components/mdm/category-tree"
import { DashboardHeader } from "@/components/mdm/dashboard-header"
import { PdmDetails } from "@/components/mdm/pdm-details"
import { AttributesTable, type Attribute } from "@/components/mdm/attributes-table"
import { ValueDictionary } from "@/components/mdm/value-dictionary"
import { DescriptionPreview } from "@/components/mdm/description-preview"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Database, Menu, X, FileText, ClipboardList, Plus } from "lucide-react"
import { Toaster, toast } from "sonner"
import Link from "next/link"

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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isDetailsOpen, setIsDetailsOpen] = useState(true)
  const [isAttributesOpen, setIsAttributesOpen] = useState(true)
  const emptyAttributes: Attribute[] = [];

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

  const handleSelectPdm = useCallback((pdm: PDMTemplate) => {
    setSelectedPdmId(pdm.id)
    setPdmName(pdm.name)
    setPdmCode(pdm.internal_code)
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
    setSidebarOpen(false)
  }, [])

  const handleNewPdm = useCallback(() => {
    setSelectedPdmId(null)
    setPdmName("")
    setPdmCode("")
    setPdmActive(true)
    setAttributes([])
    setSidebarOpen(false)
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
      internal_code: pdmCode,
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

  const handleClone = () => {
    toast.info("PDM clonado!", {
      description: `Uma copia de "${pdmName}" foi criada.`,
    })
  }

  const selectedAttribute = attributes.find((a) => a.id === selectedAttrId) || null

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-transparent">
      <Toaster position="top-right" richColors />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Spacer for floating sidebar on desktop (sidebar 256px + left gap 12px + content gap 16px) */}
        <div className="hidden w-[284px] shrink-0 md:block" />

        {/* Floating Sidebar - Navy (light) / dark surface, Off-white text */}
        <aside
          className={`
            fixed left-3 top-3 bottom-3 z-50 w-64 rounded-2xl border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm transition-transform duration-200
            md:left-3 md:top-3 md:bottom-3
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          `}
        >
          <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
            <div className="flex size-8 items-center justify-center rounded-xl bg-sidebar-primary">
              <Database className="size-4 text-sidebar-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
                MDM Platform
              </span>
              <span className="text-[10px] font-medium uppercase tracking-widest text-sidebar-foreground/60">
                Master Data
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-7 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="border-b border-sidebar-border p-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 rounded-xl border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={handleNewPdm}
            >
              <Plus className="size-4" />
              Novo PDM
            </Button>
          </div>
          <CategoryTree
            pdms={pdms}
            selectedPdmId={selectedPdmId}
            onSelectPdm={handleSelectPdm}
            isLoading={pdmsLoading}
          />
        </aside>

        {/* Main Content Area - gradient (light) / dark background */}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-transparent dark:bg-transparent">
          {/* Mobile Header Bar */}
          <div className="flex items-center gap-2 border-b border-slate-200/60 bg-white px-4 py-2 shadow-sm md:hidden dark:border-zinc-700/50 dark:bg-card">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="size-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Database className="size-4 text-primary" />
            <span className="text-sm font-bold text-foreground">MDM Platform</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 mr-2 md:hidden">
            <Link href="/governance">
              <Button size="sm" variant="ghost" className="gap-1 text-xs">
                <ClipboardList className="size-3.5" />
              </Button>
            </Link>
            <Link href="/request">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <FileText className="size-3.5" />
                Requisicao
              </Button>
            </Link>
          </div>
          </div>

          {/* Header */}
          <DashboardHeader
            status={pdmActive ? "active" : "draft"}
            onSave={handleSave}
            onClone={handleClone}
          />

          {/* Content - PdmDetails + Attributes (Attributes has its own ScrollArea) */}
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
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
              />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
              <AttributesTable
                attributes={attributes}
                onAttributesChange={setAttributes}
                onOpenValueDictionary={handleOpenValueDictionary}
                selectedPdmId={selectedPdmId}
                isOpen={isAttributesOpen}
                onToggle={() => setIsAttributesOpen((prev) => !prev)}
              />
            </div>
          </div>

          {/* Sticky Footer Preview - shrink-0 keeps it visible */}
          <div className="shrink-0">
            <DescriptionPreview
            pdmName={pdmName}
            attributes={attributes}
          />
          </div>
        </div>
      </div>

      {/* Value Dictionary Sheet */}
      <ValueDictionary
        open={valueDictOpen}
        onOpenChange={setValueDictOpen}
        attribute={selectedAttribute}
        onUpdateValues={handleUpdateValues}
      />
    </div>
  )
}
