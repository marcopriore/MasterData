'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useUser } from '@/contexts/user-context'
import { apiGetWithAuth, apiPutWithAuth, apiPostWithAuth, apiPatchWithAuth } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  ChevronLeft,
  GripVertical,
  Save,
  Plus,
  Trash2,
  Settings,
  Archive,
  ArrowRight,
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type WorkflowHeader = {
  id: number
  name: string
  description?: string | null
  is_active: boolean
}

type WorkflowStep = {
  id: number
  workflow_id?: number
  step_name: string
  status_key?: string
  order: number
  is_active: boolean
}

type MigrationStepInfo = {
  step_name: string
  status_key: string
  request_count: number
}

type MigrationInfo = {
  workflow_name: string
  steps_with_requests: MigrationStepInfo[]
}

function slugifyStatusKey(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_')
  return s.replace(/[^a-z0-9_]/g, '_') || 'step'
}

function StepSettingsPanel({
  step,
  onUpdate,
}: {
  step: WorkflowStep
  onUpdate: (id: number, data: { step_name?: string; status_key?: string }) => void
}) {
  const [stepName, setStepName] = useState(step.step_name)
  const [statusKey, setStatusKey] = useState(step.status_key || '')

  useEffect(() => {
    setStepName(step.step_name)
    setStatusKey(step.status_key || '')
  }, [step.id, step.step_name, step.status_key])

  const handleSave = () => {
    const updates: { step_name?: string; status_key?: string } = {}
    const newName = stepName.trim()
    if (newName && newName !== step.step_name) {
      updates.step_name = newName
    }
    const newKey = statusKey.trim() || slugifyStatusKey(step.step_name)
    if (newKey && newKey !== (step.status_key || slugifyStatusKey(step.step_name))) {
      updates.status_key = newKey
    }
    if (Object.keys(updates).length > 0) {
      onUpdate(step.id, updates)
    }
  }

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-3 dark:border-zinc-400/40 dark:bg-white/5">
      <p className="mb-3 text-xs font-medium text-muted-foreground">Configurações</p>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label
            htmlFor="step-name-edit"
            className="text-[11px] font-medium uppercase tracking-wider text-slate-500"
          >
            Nome da Etapa
          </Label>
          <Input
            id="step-name-edit"
            value={stepName}
            onChange={(e) => setStepName(e.target.value.toUpperCase())}
            placeholder="Ex: Revisão Técnica"
            className="min-h-[40px] border-slate-200 bg-white text-sm uppercase text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#0F1C38] focus-visible:ring-offset-0 dark:border-slate-300 dark:bg-white"
          />
          <p className="text-[11px] text-muted-foreground">
            Nome exibido no Kanban e na lista de etapas.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="step-status-key"
            className="text-[11px] font-medium uppercase tracking-wider text-slate-500"
          >
            Chave de status (Kanban)
          </Label>
          <Input
            id="step-status-key"
            value={statusKey}
            onChange={(e) => setStatusKey(e.target.value.toUpperCase())}
            placeholder={slugifyStatusKey(step.step_name)}
            className="min-h-[40px] border-slate-200 bg-white font-mono text-sm uppercase text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#0F1C38] focus-visible:ring-offset-0 dark:border-slate-300 dark:bg-white"
          />
          <p className="text-[11px] text-muted-foreground">
            Usada para mapear requisições nesta etapa. Alterar pode quebrar cards existentes.
          </p>
        </div>
        <Button size="sm" onClick={handleSave} className="h-9">
          Salvar
        </Button>
      </div>
    </div>
  )
}

function SortableStepCard({
  step,
  onDelete,
  onUpdate,
  expandedId,
  onToggleSettings,
}: {
  step: WorkflowStep
  onDelete: (id: number) => void
  onUpdate: (id: number, data: { step_name?: string; status_key?: string }) => void
  expandedId: number | null
  onToggleSettings: (id: number) => void
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isExpanded = expandedId === step.id

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`flex flex-col gap-0 rounded-md border border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted/30 dark:border-zinc-400/40 dark:bg-zinc-400/30 ${
          isDragging ? 'opacity-90 shadow-lg ring-2 ring-[#0F1C38]/20' : ''
        }`}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing dark:hover:bg-white/10 dark:hover:text-white"
            {...attributes}
            {...listeners}
            aria-label="Arrastar para reordenar"
          >
            <GripVertical className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-medium uppercase text-slate-900 dark:text-foreground">{step.step_name}</p>
            <p className="text-xs text-slate-500 dark:text-muted-foreground">
              Ordem: {step.order}
              {step.status_key && ` • Chave: ${step.status_key}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={`size-8 shrink-0 text-slate-500 hover:text-slate-700 dark:hover:text-white ${isExpanded ? 'bg-slate-100 dark:bg-white/10' : ''}`}
              aria-label="Configurações"
              onClick={() => onToggleSettings(step.id)}
            >
              <Settings className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-slate-500 hover:text-red-600 dark:hover:text-red-400"
              aria-label="Excluir"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        {isExpanded ? (
          <StepSettingsPanel step={step} onUpdate={onUpdate} />
        ) : null}
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent
          overlayClassName="bg-slate-900/20 backdrop-blur-sm"
          className="border-slate-200 bg-white text-slate-900 shadow-lg"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900 font-semibold">
              Excluir etapa
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500">
              Tem certeza que deseja excluir &quot;{step.step_name}&quot;? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-2">
            <AlertDialogCancel className="border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900">
              Cancelar
            </AlertDialogCancel>
            <Button
              variant="destructive"
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                setDeleteConfirmOpen(false)
                onDelete(step.id)
              }}
            >
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default function WorkflowConfigPage() {
  const { accessToken } = useUser()
  const [workflows, setWorkflows] = useState<WorkflowHeader[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newStepName, setNewStepName] = useState('')
  const [insertAfterId, setInsertAfterId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [archiveModalOpen, setArchiveModalOpen] = useState(false)
  const [newWorkflowModalOpen, setNewWorkflowModalOpen] = useState(false)
  const [newWorkflowName, setNewWorkflowName] = useState('')
  const [activeToggleLoading, setActiveToggleLoading] = useState(false)
  const [migrationInfo, setMigrationInfo] = useState<MigrationInfo | null>(null)
  const [targetWorkflowId, setTargetWorkflowId] = useState<number | null>(null)
  const [targetSteps, setTargetSteps] = useState<WorkflowStep[]>([])
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [migrationLoading, setMigrationLoading] = useState(false)
  const [archiveLoading, setArchiveLoading] = useState(false)

  const fetchWorkflows = useCallback(() => {
    if (!accessToken) return
    apiGetWithAuth<WorkflowHeader[]>('/api/workflows', accessToken)
      .then(setWorkflows)
      .catch(() => setWorkflows([]))
  }, [accessToken])

  useEffect(() => {
    if (workflows.length > 0 && selectedWorkflowId === null) {
      const active = workflows.find((w) => w.is_active) ?? workflows[0]
      setSelectedWorkflowId(active.id)
    }
  }, [workflows, selectedWorkflowId])

  const fetchSteps = useCallback(() => {
    if (!selectedWorkflowId || !accessToken) {
      setSteps([])
      setLoading(false)
      return
    }
    setLoading(true)
    apiGetWithAuth<WorkflowStep[]>(`/api/workflow/config?workflow_id=${selectedWorkflowId}`, accessToken)
      .then(setSteps)
      .catch(() => {
        setSteps([])
        toast.error('Erro ao carregar etapas do workflow')
      })
      .finally(() => setLoading(false))
  }, [selectedWorkflowId, accessToken])

  useEffect(() => {
    fetchWorkflows()
  }, [fetchWorkflows])

  useEffect(() => {
    fetchSteps()
  }, [fetchSteps])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setSteps((prev) => {
        const oldIndex = prev.findIndex((s) => s.id === active.id)
        const newIndex = prev.findIndex((s) => s.id === over.id)
        if (oldIndex === -1 || newIndex === -1) return prev
        const reordered = arrayMove(prev, oldIndex, newIndex)
        return reordered.map((s, i) => ({ ...s, order: i + 1 }))
      })
    }
  }

  const handleSave = async () => {
    if (!selectedWorkflowId) {
      toast.error('Selecione um workflow.')
      return
    }
    if (steps.length === 0) {
      toast.error('O workflow precisa de pelo menos uma etapa.')
      return
    }
    if (!accessToken) return
    setSaving(true)
    try {
      const payload = {
        workflow_id: selectedWorkflowId,
        steps: steps.map((s, i) => ({
          id: s.id > 0 ? s.id : undefined,
          step_name: s.step_name,
          status_key: s.status_key || slugifyStatusKey(s.step_name),
          order: i + 1,
          is_active: s.is_active ?? true,
        })),
      }
      await apiPutWithAuth('/api/workflow/config/bulk', payload, accessToken)
      toast.success('Fluxo salvo com sucesso!')
      fetchSteps()
    } catch {
      toast.error('Falha ao salvar fluxo')
    } finally {
      setSaving(false)
    }
  }

  const nextTempIdRef = useRef(-1)

  const handleAddStep = () => {
    const name = newStepName.trim()
    if (!name) {
      toast.error('Informe o nome da etapa')
      return
    }
    const tempId = nextTempIdRef.current--
    const newStep: WorkflowStep = {
      id: tempId,
      step_name: name,
      status_key: slugifyStatusKey(name),
      order: 0,
      is_active: true,
    }
    setSteps((prev) => {
      let insertIndex = prev.length
      if (insertAfterId === 0) insertIndex = 0
      else if (insertAfterId != null) {
        const idx = prev.findIndex((s) => s.id === insertAfterId)
        if (idx >= 0) insertIndex = idx + 1
      }
      const inserted = [...prev.slice(0, insertIndex), newStep, ...prev.slice(insertIndex)]
      return inserted.map((s, i) => ({ ...s, order: i + 1 }))
    })
    setAddModalOpen(false)
    setNewStepName('')
    setInsertAfterId(null)
  }

  const handleUpdateStep = (id: number, data: { step_name?: string; status_key?: string }) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...data } : s))
    )
  }

  const handleDeleteFromList = (id: number) => {
    setSteps((prev) => {
      const filtered = prev.filter((s) => s.id !== id)
      return filtered.map((s, i) => ({ ...s, order: i + 1 }))
    })
    if (expandedId === id) setExpandedId(null)
  }

  const handleToggleSettings = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  const handleArchiveClick = async () => {
    if (!selectedWorkflowId || !accessToken) return
    setArchiveModalOpen(true)
    setMigrationInfo(null)
    try {
      const info = await apiGetWithAuth<MigrationInfo>(
        `/api/workflows/${selectedWorkflowId}/migration-info`,
        accessToken
      )
      setMigrationInfo(info)
      if (info.steps_with_requests.length > 0) {
        const others = workflows.filter((w) => w.id !== selectedWorkflowId && w.is_active)
        if (others.length > 0) {
          setTargetWorkflowId(others[0].id)
          const steps = await apiGetWithAuth<WorkflowStep[]>(
            `/api/workflow/config?workflow_id=${others[0].id}`,
            accessToken
          )
          setTargetSteps(steps)
          const initial: Record<string, string> = {}
          for (const s of info.steps_with_requests) {
            initial[s.status_key] = steps[0]?.status_key ?? ''
          }
          setMappings(initial)
        } else {
          setTargetWorkflowId(null)
          setTargetSteps([])
          setMappings({})
        }
      }
    } catch {
      toast.error('Erro ao carregar informações')
      setArchiveModalOpen(false)
    }
  }

  const handleTargetWorkflowChange = async (wfId: number) => {
    if (!accessToken) return
    setTargetWorkflowId(wfId)
    const steps = await apiGetWithAuth<WorkflowStep[]>(
      `/api/workflow/config?workflow_id=${wfId}`,
      accessToken
    )
    setTargetSteps(steps)
    if (migrationInfo) {
      const updated = { ...mappings }
      for (const s of migrationInfo.steps_with_requests) {
        if (!updated[s.status_key] || !steps.find((t) => t.status_key === updated[s.status_key])) {
          updated[s.status_key] = steps[0]?.status_key ?? ''
        }
      }
      setMappings(updated)
    }
  }

  const handleExecuteMigration = async () => {
    if (!selectedWorkflowId || !targetWorkflowId || !migrationInfo || !accessToken) return
    const ms = migrationInfo.steps_with_requests
    const missing = ms.some((s) => !mappings[s.status_key]?.trim())
    if (missing) {
      toast.error('Mapeie todas as etapas de origem para uma etapa de destino.')
      return
    }
    setMigrationLoading(true)
    try {
      const payload = {
        from_workflow_id: selectedWorkflowId,
        to_workflow_id: targetWorkflowId,
        mappings: ms.map((s) => ({
          from_status_key: s.status_key,
          to_status_key: mappings[s.status_key],
        })),
      }
      await apiPostWithAuth('/api/workflows/migrate', payload, accessToken)
      toast.success('Migração executada com sucesso!')
      setArchiveModalOpen(false)
      setMigrationInfo(null)
      fetchWorkflows()
      fetchSteps()
    } catch {
      toast.error('Falha ao executar migração')
    } finally {
      setMigrationLoading(false)
    }
  }

  const handleCreateWorkflow = async () => {
    const name = newWorkflowName.trim()
    if (!name) {
      toast.error('Informe o nome do workflow')
      return
    }
    try {
      const created = await apiPost<WorkflowHeader>('/api/workflows', {
        name,
        description: null,
      }, accessToken)
      setNewWorkflowModalOpen(false)
      setNewWorkflowName('')
      fetchWorkflows()
      setSelectedWorkflowId(created.id)
    } catch {
      toast.error('Falha ao criar workflow')
    }
  }

  const handleActiveToggle = async (checked: boolean) => {
    if (!selectedWorkflowId || !accessToken) return
    setActiveToggleLoading(true)
    try {
      await apiPatchWithAuth(`/api/workflows/${selectedWorkflowId}`, {
        is_active: checked,
      }, accessToken)
      toast.success(checked ? 'Workflow ativado' : 'Workflow desativado')
      fetchWorkflows()
    } catch {
      toast.error('Falha ao atualizar status')
    } finally {
      setActiveToggleLoading(false)
    }
  }

  const handleConfirmArchive = async () => {
    if (!selectedWorkflowId || !accessToken) return
    setArchiveLoading(true)
    try {
      await apiPatchWithAuth(`/api/workflows/${selectedWorkflowId}`, {
        is_active: false,
      }, accessToken)
      toast.success('Workflow arquivado')
      setArchiveModalOpen(false)
      setMigrationInfo(null)
      fetchWorkflows()
      if (workflows.find((w) => w.id !== selectedWorkflowId)) {
        setSelectedWorkflowId(workflows.find((w) => w.id !== selectedWorkflowId)!.id)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao arquivar'
      toast.error(msg)
    } finally {
      setArchiveLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#F1F5F9] dark:bg-transparent">
      <div className="mx-auto max-w-3xl p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="shrink-0">
                <ChevronLeft className="size-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
                Configuração de Workflow
              </h1>
              <p className="text-sm text-slate-600 dark:text-muted-foreground">
                Arraste a etapa para reordenar. Salve o workflow e clique em Salvar para aplicar no Kanban.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setNewWorkflowModalOpen(true)}
            className="gap-2 bg-[#0F1C38] text-white hover:bg-[#0F1C38]/90 dark:bg-[#C69A46] dark:text-[#0F1C38] dark:hover:bg-[#C69A46]/90"
          >
            <Plus className="size-4" />
            Novo Workflow
          </Button>
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4 dark:border-zinc-400/40 dark:bg-zinc-400/30 md:p-6">
          {/* Workflow selector + Adicionar Nova Etapa + Active toggle + Archive */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <Label className="text-xs font-medium text-muted-foreground shrink-0">
                Workflow
              </Label>
              <Select
                value={selectedWorkflowId?.toString() ?? ''}
                onValueChange={(v) => setSelectedWorkflowId(v ? Number(v) : null)}
              >
                <SelectTrigger className="w-[240px] h-9 border-slate-200 dark:border-zinc-400/40">
                  <SelectValue placeholder="Selecione o workflow" />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)} className="uppercase">
                      {w.name}
                      {w.is_active && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">(ativo)</span>
                      )}
                      {!w.is_active && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">(arquivado)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => setAddModalOpen(true)}
              disabled={!selectedWorkflowId}
              className="h-9 gap-1.5 border-slate-200 bg-[#0F1C38] text-white hover:bg-[#0F1C38]/90 dark:border-zinc-400/40 dark:bg-[#C69A46] dark:text-[#0F1C38] dark:hover:bg-[#C69A46]/90"
            >
              <Plus className="size-4" />
              Adicionar Nova Etapa
            </Button>
            {selectedWorkflowId && (
              <>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={workflows.find((w) => w.id === selectedWorkflowId)?.is_active ?? false}
                    onCheckedChange={handleActiveToggle}
                    disabled={activeToggleLoading}
                  />
                  <Label className="text-xs text-muted-foreground">Ativo</Label>
                </div>
                {workflows.find((w) => w.id === selectedWorkflowId)?.is_active && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-zinc-400/40 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                    onClick={handleArchiveClick}
                  >
                    <Archive className="size-4" />
                    Arquivar
                  </Button>
                )}
              </>
            )}
          </div>
          {loading ? (
            <p className="py-8 text-center text-slate-500 dark:text-muted-foreground">
              Carregando etapas...
            </p>
          ) : steps.length === 0 ? (
            <p className="py-8 text-center text-slate-500 dark:text-muted-foreground">
              Nenhuma etapa configurada. Clique em Adicionar Nova Etapa.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={steps.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {steps.map((step) => (
                    <SortableStepCard
                      key={step.id}
                      step={step}
                      onDelete={handleDeleteFromList}
                      onUpdate={handleUpdateStep}
                      expandedId={expandedId}
                      onToggleSettings={handleToggleSettings}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleSave}
              disabled={loading || steps.length === 0 || saving || !selectedWorkflowId}
              className="gap-2 bg-[#0F1C38] text-white hover:bg-[#0F1C38]/90 dark:bg-[#C69A46] dark:text-[#0F1C38] dark:hover:bg-[#C69A46]/90"
            >
              <Save className="size-4" />
              Salvar Novo Fluxo
            </Button>
          </div>
        </div>
      </div>

      {/* Add Step Modal - Light Mode style matching Dicionário de Valores */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent
          overlayClassName="bg-slate-900/20 backdrop-blur-sm"
          className="border-slate-200 bg-white text-slate-900 sm:max-w-md shadow-lg dark:border-zinc-600 dark:bg-white dark:text-slate-900"
        >
          <DialogHeader className="pb-2">
            <DialogTitle className="text-slate-900 font-semibold">
              Adicionar Nova Etapa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="step-name"
                className="text-[11px] font-medium uppercase tracking-wider text-slate-500"
              >
                Nome da etapa
              </Label>
              <Input
                id="step-name"
                placeholder="Ex: Revisão Técnica"
                value={newStepName}
                onChange={(e) => setNewStepName(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleAddStep()}
                className="min-h-[40px] border-slate-200 bg-white text-sm uppercase text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#0F1C38] focus-visible:ring-offset-0 dark:border-slate-300 dark:bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="insert-after"
                className="text-[11px] font-medium uppercase tracking-wider text-slate-500"
              >
                Posicionar após
              </Label>
              <select
                id="insert-after"
                value={insertAfterId === 0 ? 'start' : insertAfterId ?? 'end'}
                onChange={(e) => {
                  const v = e.target.value
                  setInsertAfterId(v === 'start' ? 0 : v === 'end' ? null : Number(v))
                }}
                className="flex min-h-[40px] w-full items-center rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 ring-offset-0 focus:outline-none focus:ring-2 focus:ring-[#0F1C38] focus:ring-offset-0 dark:border-slate-300 dark:bg-white"
              >
                <option value="start">No início</option>
                {steps.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.step_name}
                  </option>
                ))}
                <option value="end">No final</option>
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setAddModalOpen(false)}
              className="border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddStep}
              className="gap-2 bg-[#0F1C38] text-white hover:bg-[#0F1C38]/90"
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Workflow Modal */}
      <Dialog open={newWorkflowModalOpen} onOpenChange={setNewWorkflowModalOpen}>
        <DialogContent
          overlayClassName="bg-slate-900/20 backdrop-blur-sm"
          className="border-slate-200 bg-white text-slate-900 sm:max-w-md shadow-lg dark:border-zinc-600 dark:bg-white dark:text-slate-900"
        >
          <DialogHeader className="pb-2">
            <DialogTitle className="text-slate-900 font-semibold">
              Novo Workflow
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="new-workflow-name"
                className="text-[11px] font-medium uppercase tracking-wider text-slate-500"
              >
                Nome do workflow
              </Label>
              <Input
                id="new-workflow-name"
                placeholder="Ex: Fluxo Principal"
                value={newWorkflowName}
                onChange={(e) => setNewWorkflowName(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateWorkflow()}
                maxLength={40}
                className="min-h-[40px] border-slate-200 bg-white text-sm uppercase text-slate-900 placeholder:text-slate-400 focus-visible:ring-[#0F1C38] focus-visible:ring-offset-0 dark:border-slate-300 dark:bg-white"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setNewWorkflowModalOpen(false)
                setNewWorkflowName('')
              }}
              className="border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateWorkflow}
              disabled={!newWorkflowName.trim()}
              className="gap-2 bg-[#0F1C38] text-white hover:bg-[#0F1C38]/90"
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive / Migration Modal */}
      <Dialog open={archiveModalOpen} onOpenChange={setArchiveModalOpen}>
        <DialogContent
          overlayClassName="bg-slate-900/20 backdrop-blur-sm"
          className="border-slate-200 bg-white text-slate-900 sm:max-w-lg shadow-lg dark:border-zinc-600 dark:bg-white dark:text-slate-900"
        >
          <DialogHeader className="pb-2">
            <DialogTitle className="text-slate-900 font-semibold">
              {migrationInfo?.steps_with_requests?.length
                ? 'Migrar requisições antes de arquivar'
                : 'Arquivar workflow'}
            </DialogTitle>
          </DialogHeader>
          {migrationInfo?.steps_with_requests && migrationInfo.steps_with_requests.length > 0 ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-slate-600 dark:text-slate-600">
                O workflow &quot;{migrationInfo.workflow_name}&quot; possui requisições ativas.
                Mapeie cada etapa para uma etapa do workflow de destino.
              </p>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Workflow de destino
                </Label>
                {workflows.filter(
                  (w) => w.id !== selectedWorkflowId && w.is_active
                ).length === 0 ? (
                  <p className="text-sm text-amber-600 dark:text-amber-500">
                    Não há outro workflow ativo. Crie um novo workflow para migrar as requisições.
                  </p>
                ) : (
                  <Select
                    value={targetWorkflowId?.toString() ?? ''}
                    onValueChange={(v) => handleTargetWorkflowChange(Number(v))}
                  >
                    <SelectTrigger className="h-9 border-slate-200 dark:border-zinc-300">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {workflows
                        .filter(
                          (w) => w.id !== selectedWorkflowId && w.is_active
                        )
                        .map((w) => (
                          <SelectItem key={w.id} value={String(w.id)}>
                            {w.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Mapeamento de etapas
                </Label>
                <div className="rounded-lg border border-slate-200 dark:border-zinc-300 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-100/50">
                        <th className="px-3 py-2 text-left font-medium text-slate-700">
                          Etapa atual ({migrationInfo.workflow_name})
                        </th>
                        <th className="px-2 w-8" />
                        <th className="px-3 py-2 text-left font-medium text-slate-700">
                          Mover para
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {migrationInfo.steps_with_requests.map((s) => (
                        <tr
                          key={s.status_key}
                          className="border-t border-slate-200 dark:border-zinc-200/50"
                        >
                          <td className="px-3 py-2">
                            <span className="font-medium">{s.step_name}</span>
                            <span className="ml-1.5 text-xs text-slate-500">
                              ({s.request_count} requisição{s.request_count !== 1 ? 'ões' : ''})
                            </span>
                          </td>
                          <td className="px-2">
                            <ArrowRight className="size-4 text-slate-400" />
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={mappings[s.status_key] ?? ''}
                              onValueChange={(v) =>
                                setMappings((prev) => ({
                                  ...prev,
                                  [s.status_key]: v,
                                }))
                              }
                            >
                              <SelectTrigger className="h-8 w-full border-slate-200 dark:border-zinc-300">
                                <SelectValue placeholder="Selecione a etapa" />
                              </SelectTrigger>
                              <SelectContent>
                                {targetSteps.map((t) => (
                                  <SelectItem key={t.id} value={t.status_key ?? ''}>
                                    {t.step_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setArchiveModalOpen(false)}
                  className="border-slate-200"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleExecuteMigration}
                  disabled={
                    migrationLoading ||
                    !targetWorkflowId ||
                    migrationInfo.steps_with_requests.some(
                      (s) => !mappings[s.status_key]?.trim()
                    )
                  }
                  className="gap-2 bg-[#0F1C38] text-white hover:bg-[#0F1C38]/90"
                >
                  Executar migração
                </Button>
              </DialogFooter>
            </div>
          ) : migrationInfo ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-slate-600 dark:text-slate-600">
                O workflow &quot;{migrationInfo.workflow_name}&quot; não possui requisições. Você
                pode arquivá-lo.
              </p>
              <DialogFooter className="gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setArchiveModalOpen(false)}
                  className="border-slate-200"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirmArchive}
                  disabled={archiveLoading}
                  className="gap-2 bg-[#0F1C38] text-white hover:bg-[#0F1C38]/90"
                >
                  Arquivar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <p className="py-4 text-sm text-slate-500">Carregando...</p>
          )}
        </DialogContent>
      </Dialog>

      <Toaster position="top-right" richColors />
    </main>
  )
}
