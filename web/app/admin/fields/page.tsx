'use client'

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { apiGetWithAuth, apiPostWithAuth, apiPutWithAuth, apiDeleteWithAuth } from '@/lib/api'
import { useUser } from '@/contexts/user-context'
import { toast, Toaster } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  BookOpen,
  Plus,
  Loader2,
  X,
  Pencil,
  Eye,
  EyeOff,
  Type,
  Hash,
  Calendar,
  List,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldDictionary = {
  id: number
  field_name: string
  field_label: string
  sap_field: string | null
  sap_view: string
  field_type: string
  options: string[] | Record<string, unknown> | null
  responsible_role: string
  is_required: boolean
  is_active: boolean
  display_order: number
  created_at: string | null
}

type Role = { id: number; name: string }

const SAP_VIEWS = [
  { value: '', label: 'Todos' },
  { value: 'dados_basicos', label: 'Dados Básicos' },
  { value: 'fiscal', label: 'Fiscal' },
  { value: 'compras', label: 'Compras' },
  { value: 'mrp', label: 'MRP' },
  { value: 'contabilidade', label: 'Contabilidade' },
  { value: 'vendas', label: 'Vendas' },
] as const

const SAP_VIEW_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  dados_basicos: { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
  fiscal: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  compras: { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
  mrp: { bg: '#F5F3FF', text: '#5B21B6', border: '#DDD6FE' },
  contabilidade: { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
  vendas: { bg: '#FCE7F3', text: '#BE185D', border: '#FBCFE8' },
}

const FIELD_TYPES = [
  { value: 'text', label: 'Texto', icon: Type },
  { value: 'number', label: 'Número', icon: Hash },
  { value: 'date', label: 'Data', icon: Calendar },
  { value: 'select', label: 'Lista de Opções', icon: List },
] as const

const ROLE_BADGE_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  ADMIN: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  SOLICITANTE: { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' },
  TRIAGEM: { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
  FISCAL: { bg: '#F5F3FF', text: '#5B21B6', border: '#DDD6FE' },
  MASTER: { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' },
  MRP: { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFieldTypeIcon(type: string) {
  const t = FIELD_TYPES.find((x) => x.value === type)
  return t?.icon ?? Type
}

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function parseOptionsJson(value: string): string[] | null {
  if (!value.trim()) return null
  try {
    const parsed = JSON.parse(value.trim())
    if (Array.isArray(parsed)) return parsed.map(String)
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.values))
      return parsed.values.map(String)
    return null
  } catch {
    return undefined // invalid
  }
}

// ─── Section card ─────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#B4B9BE] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.04)]">
      {children}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

type ModalMode = 'create' | 'edit'

interface FieldModalProps {
  mode: ModalMode
  initial?: FieldDictionary | null
  roles: Role[]
  onClose: () => void
  onSaved: (f: FieldDictionary) => void
  accessToken: string | null
}

function FieldModal({ mode, initial, roles, onClose, onSaved, accessToken }: FieldModalProps) {
  const [fieldLabel, setFieldLabel] = useState(initial?.field_label ?? '')
  const [fieldName, setFieldName] = useState(initial?.field_name ?? '')
  const [sapField, setSapField] = useState(initial?.sap_field ?? '')
  const [sapView, setSapView] = useState(initial?.sap_view ?? 'dados_basicos')
  const [fieldType, setFieldType] = useState(initial?.field_type ?? 'text')
  const [responsibleRole, setResponsibleRole] = useState(initial?.responsible_role ?? 'TRIAGEM')
  const [isRequired, setIsRequired] = useState(initial?.is_required ?? false)
  const [optionsJson, setOptionsJson] = useState(() => {
    const o = initial?.options
    if (Array.isArray(o)) return JSON.stringify(o, null, 2)
    if (o && typeof o === 'object' && Array.isArray((o as { values?: unknown }).values))
      return JSON.stringify((o as { values: string[] }).values, null, 2)
    return ''
  })
  const [saving, setSaving] = useState(false)
  const [optionsError, setOptionsError] = useState<string | null>(null)

  function syncFieldNameFromLabel() {
    const slug = slugify(fieldLabel)
    if (slug) setFieldName((prev) => (mode === 'create' ? slug : prev))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!fieldLabel.trim()) {
      toast.error('Nome do campo é obrigatório.')
      return
    }
    if (!fieldName.trim()) {
      toast.error('Identificador é obrigatório.')
      return
    }
    if (!/^[a-z][a-z0-9_]*$/.test(fieldName)) {
      toast.error('Identificador deve ser snake_case (ex: descricao_basica).')
      return
    }
    if (fieldType === 'select') {
      const parsed = parseOptionsJson(optionsJson)
      if (parsed === undefined) {
        setOptionsError('JSON inválido. Use: ["Opção 1", "Opção 2"]')
        return
      }
      setOptionsError(null)
    }

    setSaving(true)
    try {
      const role = roles.find((r) => r.name === responsibleRole)
      const roleName = role?.name ?? responsibleRole

      const body = {
        field_name: fieldName.trim(),
        field_label: fieldLabel.trim(),
        sap_field: sapField.trim() || null,
        sap_view: sapView,
        field_type: fieldType,
        options: fieldType === 'select' ? parseOptionsJson(optionsJson) ?? [] : null,
        responsible_role: roleName,
        is_required: isRequired,
        is_active: true,
        display_order: 0,
      }

      let saved: FieldDictionary
      if (mode === 'create') {
        saved = await apiPostWithAuth<FieldDictionary>('/api/fields', body, accessToken)
        toast.success('Campo criado com sucesso.')
      } else {
        saved = await apiPutWithAuth<FieldDictionary>(
          `/api/fields/${initial!.id}`,
          body,
          accessToken
        )
        toast.success('Campo atualizado.')
      }
      onSaved(saved)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const etapasRoles = roles.filter((r) =>
    ['TRIAGEM', 'FISCAL', 'MASTER', 'MRP'].includes(r.name)
  )
  const roleOptions = etapasRoles.length > 0 ? etapasRoles : roles

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[#B4B9BE] bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#B4B9BE] px-6 py-4 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-[#0F1C38]">
            {mode === 'create' ? 'Novo Campo' : 'Editar Campo'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <Label htmlFor="field_label">Nome do Campo *</Label>
            <Input
              id="field_label"
              value={fieldLabel}
              onChange={(e) => setFieldLabel(e.target.value)}
              onBlur={syncFieldNameFromLabel}
              placeholder="Ex: Descrição Básica"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="field_name">Identificador (snake_case) *</Label>
            <Input
              id="field_name"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              placeholder="Ex: descricao_basica"
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div>
            <Label htmlFor="sap_field">Campo SAP</Label>
            <Input
              id="sap_field"
              value={sapField}
              onChange={(e) => setSapField(e.target.value)}
              placeholder="Ex: MAKTX"
              className="mt-1 font-mono text-sm"
            />
          </div>
          <div>
            <Label htmlFor="sap_view">Visão SAP *</Label>
            <select
              id="sap_view"
              value={sapView}
              onChange={(e) => setSapView(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {SAP_VIEWS.filter((v) => v.value).map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="field_type">Tipo *</Label>
            <select
              id="field_type"
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="responsible_role">Responsável *</Label>
            <select
              id="responsible_role"
              value={responsibleRole}
              onChange={(e) => setResponsibleRole(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {roleOptions.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_required"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="rounded border-input"
            />
            <Label htmlFor="is_required">Campo obrigatório</Label>
          </div>
          {fieldType === 'select' && (
            <div>
              <Label htmlFor="options">Opções (JSON array) *</Label>
              <textarea
                id="options"
                value={optionsJson}
                onChange={(e) => {
                  setOptionsJson(e.target.value)
                  setOptionsError(null)
                }}
                placeholder='["Opção 1", "Opção 2", "Opção 3"]'
                className="mt-1 w-full min-h-[100px] rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm"
              />
              {optionsError && (
                <p className="mt-1 text-sm text-destructive">{optionsError}</p>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="flex-1 bg-[#0F1C38] hover:bg-[#162444]"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Salvando…
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FieldsPage() {
  const { isAdmin, accessToken } = useUser()
  const [fields, setFields] = useState<FieldDictionary[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [sapViewFilter, setSapViewFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editTarget, setEditTarget] = useState<FieldDictionary | null>(null)

  const fetchData = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const url = sapViewFilter ? `/api/fields?sap_view=${sapViewFilter}` : '/api/fields'
      const [f, r] = await Promise.all([
        apiGetWithAuth<FieldDictionary[]>(url, accessToken),
        apiGetWithAuth<Role[]>('/admin/roles', accessToken),
      ])
      setFields(f)
      setRoles(r)
    } catch (err) {
      toast.error((err as Error).message)
      setFields([])
    } finally {
      setLoading(false)
    }
  }, [accessToken, sapViewFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function openCreate() {
    setEditTarget(null)
    setModalMode('create')
    setModalOpen(true)
  }

  function openEdit(f: FieldDictionary) {
    setEditTarget(f)
    setModalMode('edit')
    setModalOpen(true)
  }

  function handleSaved(saved: FieldDictionary) {
    setFields((prev) => {
      const idx = prev.findIndex((x) => x.id === saved.id)
      if (idx >= 0) return prev.map((x) => (x.id === saved.id ? saved : x))
      return [saved, ...prev]
    })
    setModalOpen(false)
  }

  async function toggleActive(f: FieldDictionary) {
    if (!accessToken) return
    try {
      if (f.is_active) {
        await apiDeleteWithAuth<FieldDictionary>(`/api/fields/${f.id}`, accessToken)
        toast.success('Campo desativado.')
      } else {
        await apiPutWithAuth<FieldDictionary>(
          `/api/fields/${f.id}`,
          { ...f, is_active: true },
          accessToken
        )
        toast.success('Campo reativado.')
      }
      fetchData()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-muted-foreground">Acesso restrito ao administrador.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Toaster richColors position="top-right" />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#0F1C38]/8">
            <BookOpen className="size-5 text-[#0F1C38]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Dicionário de Campos</h1>
            <p className="text-sm text-muted-foreground">
              Campos SAP MM01 e responsabilidades por etapa
            </p>
          </div>
        </div>
        <Button
          onClick={openCreate}
          className="bg-[#0F1C38] hover:bg-[#162444] text-white shrink-0"
        >
          <Plus className="size-4 mr-2" />
          Novo Campo
        </Button>
      </div>

      {/* Tabs filter */}
      <div className="flex flex-wrap gap-2">
        {SAP_VIEWS.map((v) => (
          <button
            key={v.value || 'all'}
            onClick={() => setSapViewFilter(v.value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              sapViewFilter === v.value
                ? 'bg-[#0F1C38] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" />
            Carregando campos…
          </div>
        ) : fields.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <BookOpen className="size-8 opacity-30" />
            <p className="text-sm">
              {sapViewFilter
                ? 'Nenhum campo nesta visão.'
                : 'Nenhum campo cadastrado.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#B4B9BE] text-left">
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Campo</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Referência SAP</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Visão</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Tipo</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Responsável</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Obrigatório</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f) => {
                  const viewStyle = SAP_VIEW_COLORS[f.sap_view] ?? {
                    bg: '#F8FAFC',
                    text: '#475569',
                    border: '#E2E8F0',
                  }
                  const roleStyle = ROLE_BADGE_STYLE[f.responsible_role] ?? {
                    bg: '#F8FAFC',
                    text: '#475569',
                    border: '#E2E8F0',
                  }
                  const TypeIcon = getFieldTypeIcon(f.field_type)
                  return (
                    <tr
                      key={f.id}
                      className="border-b border-[#B4B9BE]/50 last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="font-semibold text-foreground">{f.field_label}</p>
                          <p className="text-xs text-muted-foreground font-mono">{f.field_name}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {f.sap_field ? (
                          <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-600">
                            {f.sap_field}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className="inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: viewStyle.bg,
                            color: viewStyle.text,
                            borderColor: viewStyle.border,
                          }}
                        >
                          {SAP_VIEWS.find((v) => v.value === f.sap_view)?.label ?? f.sap_view}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <TypeIcon className="size-3.5" />
                          {FIELD_TYPES.find((t) => t.value === f.field_type)?.label ?? f.field_type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className="inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: roleStyle.bg,
                            color: roleStyle.text,
                            borderColor: roleStyle.border,
                          }}
                        >
                          {f.responsible_role}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {f.is_required ? (
                          <span className="text-green-600">✅</span>
                        ) : (
                          <span className="text-slate-300">○</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            f.is_active
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                        >
                          {f.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(f)}
                            className="rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                            title="Editar"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => toggleActive(f)}
                            className="rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                            title={f.is_active ? 'Desativar' : 'Reativar'}
                          >
                            {f.is_active ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && (
        <FieldModal
          mode={modalMode}
          initial={editTarget}
          roles={roles}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
          accessToken={accessToken}
        />
      )}
    </div>
  )
}
