"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { PDMTemplate } from "@/components/mdm/category-tree"
import { DashboardHeader } from "@/components/mdm/dashboard-header"
import { PdmDetails } from "@/components/mdm/pdm-details"
import { AttributesTable, type Attribute } from "@/components/mdm/attributes-table"
import { ValueDictionary } from "@/components/mdm/value-dictionary"
import { PDM_LIST_STORAGE_KEY } from "@/lib/pdm-list"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createPdm, getPdmById, getPdmMaterialsCount, logAction, updatePdm } from "@/lib/supabase-api"

type RawAttribute = {
  id?: string
  order?: number
  name?: string
  dataType?: string
  isRequired?: boolean
  includeInDescription?: boolean
  abbreviation?: string
  allowedValues?: unknown[]
}

function toAttributes(raw: unknown[]): Attribute[] {
  return (raw as RawAttribute[]).map((a) => ({
    id: a.id ?? "",
    order: a.order ?? 0,
    name: a.name ?? "",
    dataType: (a.dataType ?? "text") as "numeric" | "text" | "lov",
    isRequired: a.isRequired ?? false,
    includeInDescription: a.includeInDescription ?? false,
    abbreviation: a.abbreviation ?? "",
    allowedValues: (a.allowedValues ?? []).map((v) =>
      typeof v === "object" && v != null && "value" in v
        ? { value: String((v as { value?: unknown }).value ?? ""), abbreviation: String((v as { abbreviation?: unknown }).abbreviation ?? "") }
        : { value: String(v), abbreviation: "" }
    ),
  }))
}

function attributesPayload(attributes: Attribute[]) {
  return attributes.map((a) => ({
    id: a.id,
    order: a.order,
    name: a.name,
    dataType: a.dataType,
    isRequired: a.isRequired,
    includeInDescription: a.includeInDescription,
    abbreviation: a.abbreviation,
    allowedValues: a.allowedValues ?? [],
  }))
}

/** Detalhe de um PDM (pdmId) ou criação de um novo (pdmId null). */
export function PdmEditor({ pdmId }: { pdmId: number | null }) {
  const router = useRouter()
  const isNew = pdmId == null
  const [loading, setLoading] = useState(!isNew)
  const [notFound, setNotFound] = useState(false)
  const [pdmName, setPdmName] = useState("")
  const [pdmCode, setPdmCode] = useState("")
  const [pdmActive, setPdmActive] = useState(true)
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [materialsCount, setMaterialsCount] = useState(0)
  const [isEditMode, setIsEditMode] = useState(isNew)
  const [isDetailsOpen, setIsDetailsOpen] = useState(true)
  const [isAttributesOpen, setIsAttributesOpen] = useState(true)
  const [valueDictOpen, setValueDictOpen] = useState(false)
  const [selectedAttrId, setSelectedAttrId] = useState<string | null>(null)
  const [cloneModalOpen, setCloneModalOpen] = useState(false)
  const [cloneName, setCloneName] = useState("")
  const [cloneCode, setCloneCode] = useState("")
  const [cloneLoading, setCloneLoading] = useState(false)
  const [listHref, setListHref] = useState("/admin-pdm")

  useEffect(() => {
    const query = sessionStorage.getItem(PDM_LIST_STORAGE_KEY)
    if (query) setListHref(`/admin-pdm?${query}`)
  }, [])

  useEffect(() => {
    if (pdmId == null) return
    let cancelled = false
    setLoading(true)
    getPdmById(pdmId)
      .then(async (full) => {
        if (cancelled) return
        setPdmName(full.name)
        setPdmCode((full.internal_code ?? "").slice(0, 7))
        setPdmActive(full.is_active ?? true)
        setAttributes(toAttributes(full.attributes ?? []))
        const count = await getPdmMaterialsCount(full.internal_code ?? "")
        if (!cancelled) setMaterialsCount(count)
      })
      .catch(() => { if (!cancelled) setNotFound(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [pdmId])

  const handleOpenValueDictionary = useCallback((attrId: string) => {
    setSelectedAttrId(attrId)
    setValueDictOpen(true)
  }, [])

  const handleUpdateValues = useCallback((attrId: string, values: { value: string; abbreviation: string }[]) => {
    setAttributes((prev) => prev.map((a) => (a.id === attrId ? { ...a, allowedValues: values } : a)))
  }, [])

  const handleSave = async () => {
    const payload = {
      name: pdmName,
      internal_code: pdmCode.slice(0, 7),
      is_active: pdmActive,
      attributes: attributesPayload(attributes),
    }
    try {
      const saved = pdmId != null ? await updatePdm(pdmId, payload) : await createPdm(payload)
      void logAction({
        category: "pdm",
        action: isNew ? "pdm_created" : "pdm_updated",
        description: `PDM "${pdmName}" ${isNew ? "criado" : "atualizado"}`,
        event_data: isNew ? { internal_code: pdmCode } : { id: pdmId, internal_code: pdmCode },
      })
      toast.success("Estrutura salva com sucesso!", { description: `PDM "${pdmName}" foi salvo.` })
      setIsEditMode(false)
      if (isNew) router.replace(`/admin-pdm/${saved.id}`)
    } catch (e) {
      toast.error("Falha ao salvar", { description: e instanceof Error ? e.message : "Erro ao salvar estrutura." })
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
      toast.error("Código obrigatório", { description: "Informe o código interno (máx. 7 caracteres)." })
      return
    }
    if (cloneCode.length > 7) {
      toast.error("Código inválido", { description: "O código interno deve ter no máximo 7 caracteres." })
      return
    }
    setCloneLoading(true)
    try {
      const saved: PDMTemplate = await createPdm({
        name: cloneName.trim(),
        internal_code: cloneCode.trim().slice(0, 7),
        is_active: true,
        attributes: attributesPayload(attributes).map((a, i) => ({ ...a, id: `attr-${Date.now()}-${i}` })),
      }) as PDMTemplate
      void logAction({
        category: "pdm",
        action: "pdm_cloned",
        description: `PDM "${cloneName.trim()}" clonado`,
        event_data: { source_name: pdmName, internal_code: cloneCode.trim().slice(0, 7) },
      })
      toast.success("PDM clonado!", { description: `"${saved.name}" foi criado com sucesso.` })
      setCloneModalOpen(false)
      router.push(`/admin-pdm/${saved.id}`)
    } catch (e) {
      toast.error("Falha ao clonar", { description: e instanceof Error ? e.message : "Erro ao clonar PDM." })
    } finally {
      setCloneLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Carregando PDM...
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <Link href={listHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Voltar para a lista
        </Link>
        <p className="text-muted-foreground">PDM não encontrado.</p>
      </div>
    )
  }

  const selectedAttribute = attributes.find((a) => a.id === selectedAttrId) || null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardHeader
        status={pdmActive ? "active" : "draft"}
        isEditMode={isEditMode}
        onEditClick={() => setIsEditMode(true)}
        onSave={handleSave}
        onClone={handleOpenCloneModal}
        minimal={false}
        pdmName={pdmName || undefined}
        listHref={listHref}
        headerActions={
          <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 rounded-xl" asChild>
            <Link href={listHref}>
              <ArrowLeft className="size-3.5" />
              Lista
            </Link>
          </Button>
        }
      />

      <div className="shrink-0 pt-6">
        <PdmDetails
          name={pdmName}
          code={pdmCode}
          isActive={pdmActive}
          onNameChange={setPdmName}
          onCodeChange={setPdmCode}
          onActiveChange={setPdmActive}
          selectedPdmId={pdmId}
          isOpen={isDetailsOpen}
          onToggle={() => setIsDetailsOpen((prev) => !prev)}
          readOnly={!isEditMode}
          attributes={attributes}
          materialsCount={materialsCount}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col py-5">
        <AttributesTable
          attributes={attributes}
          onAttributesChange={setAttributes}
          onOpenValueDictionary={handleOpenValueDictionary}
          selectedPdmId={pdmId}
          isOpen={isAttributesOpen}
          onToggle={() => setIsAttributesOpen((prev) => !prev)}
          readOnly={!isEditMode}
        />
      </div>

      <ValueDictionary
        open={valueDictOpen}
        onOpenChange={setValueDictOpen}
        attribute={selectedAttribute}
        onUpdateValues={handleUpdateValues}
        readOnly={!isEditMode}
      />

      <Dialog open={cloneModalOpen} onOpenChange={setCloneModalOpen}>
        <DialogContent
          overlayClassName="bg-slate-900/20 backdrop-blur-sm"
          className="border-slate-200 bg-white text-slate-900 shadow-lg dark:border-zinc-600 dark:bg-white dark:text-slate-900 sm:max-w-md"
        >
          <DialogHeader className="pb-2">
            <DialogTitle className="text-slate-900 font-semibold">Clonar PDM</DialogTitle>
            <DialogDescription className="text-slate-500 text-sm">
              Defina o nome e código do novo PDM. Todos os atributos serão copiados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="clone-name" className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Novo Nome</Label>
              <Input
                id="clone-name"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value.toUpperCase())}
                placeholder="Ex: Bearing Ball Radial"
                className="min-h-[40px] border-slate-200 bg-white text-sm uppercase text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#0F1C38] focus-visible:ring-offset-0 dark:border-slate-300 dark:bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clone-code" className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Novo Código Interno</Label>
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
            <Button onClick={handleCloneConfirm} disabled={cloneLoading} className="gap-2 bg-[#0F1C38] text-white hover:bg-[#0F1C38]/90">
              {cloneLoading ? "Clonando..." : "Clonar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
