'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { apiGetWithAuth, apiPatchWithAuth } from '@/lib/api'
import { useUser } from '@/contexts/user-context'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { maskNCM, maskCFOP } from '@/lib/masks'

type MaterialDetail = {
  id: number
  sap_code: string
  description: string
  status: string
  pdm_code: string | null
  pdm_name: string | null
  material_group: string | null
  unit_of_measure: string | null
  ncm: string | null
  material_type: string | null
  gross_weight: number | null
  net_weight: number | null
  cfop: string | null
  origin: string | null
  purchase_group: string | null
  lead_time: number | null
  mrp_type: string | null
  min_stock: number | null
  max_stock: number | null
  valuation_class: string | null
  standard_price: number | null
  profit_center: string | null
  source: string | null
  erp_status: string | null
  erp_integrated_at: string | null
  standardized_at: string | null
  standardized_by: number | null
  created_at: string | null
  updated_at: string | null
}

const STATUS_BADGE: Record<string, string> = {
  Ativo: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Bloqueado: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  Obsoleto: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300',
}

const INPUT_BASE =
  'bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100 rounded-md px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatNumber(v: number | null): string {
  if (v == null) return '—'
  return String(v)
}

function formatCurrency(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v)
}

function Cell({ value }: { value: string | number | null }) {
  const s = value != null && String(value).trim() ? String(value) : '—'
  return (
    <span className="text-sm text-zinc-800 dark:text-zinc-200">
      {s}
    </span>
  )
}

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-700/50 dark:bg-card">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function EditableRow({
  label,
  fieldKey,
  editMode,
  formData,
  material,
  onUpdate,
  formatDisplay,
}: {
  label: string
  fieldKey: keyof MaterialDetail
  editMode: boolean
  formData: Record<string, unknown>
  material: MaterialDetail
  onUpdate: (key: string, value: string | number | null) => void
  formatDisplay?: (v: unknown) => string
}) {
  const raw = formData[fieldKey]
  const value = raw != null ? String(raw) : ''
  const mask = fieldKey === 'ncm' ? maskNCM : fieldKey === 'cfop' ? maskCFOP : undefined
  const displayValue = formatDisplay
    ? formatDisplay(material[fieldKey])
    : (material[fieldKey] != null && String(material[fieldKey]).trim() ? String(material[fieldKey]) : '—')

  if (editMode) {
    if (fieldKey === 'standard_price') {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
          <input
            type="number"
            step="0.01"
            value={raw != null ? String(raw) : ''}
            onChange={(e) => {
              const v = e.target.value
              onUpdate(fieldKey, v === '' ? null : parseFloat(v))
            }}
            className={INPUT_BASE}
          />
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
        <input
          type={fieldKey === 'gross_weight' || fieldKey === 'net_weight' || fieldKey === 'lead_time' || fieldKey === 'min_stock' || fieldKey === 'max_stock' ? 'number' : 'text'}
          step={fieldKey === 'gross_weight' || fieldKey === 'net_weight' || fieldKey === 'standard_price' ? '0.01' : undefined}
          value={value}
          onChange={(e) => {
            const v = e.target.value
            if (mask) {
              onUpdate(fieldKey, mask(v))
            } else if (fieldKey === 'lead_time' || fieldKey === 'min_stock' || fieldKey === 'max_stock' || fieldKey === 'gross_weight' || fieldKey === 'net_weight') {
              onUpdate(fieldKey, v === '' ? null : (fieldKey === 'lead_time' ? parseInt(v, 10) : parseFloat(v)))
            } else {
              onUpdate(fieldKey, v || null)
            }
          }}
          className={INPUT_BASE}
        />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-sm text-zinc-800 dark:text-zinc-200 font-medium">{displayValue}</span>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{value ?? '—'}</span>
    </div>
  )
}

export default function DatabaseDetailPage() {
  const params = useParams()
  const id = Number(params.id)
  const { accessToken, can } = useUser()
  const [material, setMaterial] = useState<MaterialDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!accessToken || !id || Number.isNaN(id)) return
    setLoading(true)
    setError(null)
    apiGetWithAuth<MaterialDetail>(`/api/database/materials/${id}`, accessToken)
      .then((m) => {
        setMaterial(m)
        setFormData({ ...m })
      })
      .catch((e: unknown) => setError((e as Error)?.message ?? 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }, [accessToken, id])

  const handleUpdate = (key: string, value: string | number | null) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }

  const handleCancelEdit = () => {
    if (material) {
      setFormData({ ...material })
    }
    setEditMode(false)
    setIsDirty(false)
  }

  const handleSave = async () => {
    if (!accessToken || !material) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}
      const editableKeys: (keyof MaterialDetail)[] = [
        'sap_code', 'description', 'status', 'pdm_code', 'pdm_name',
        'material_group', 'unit_of_measure', 'ncm', 'material_type',
        'gross_weight', 'net_weight', 'cfop', 'origin', 'purchase_group',
        'lead_time', 'mrp_type', 'min_stock', 'max_stock', 'valuation_class',
        'standard_price', 'profit_center', 'source',
      ]
      for (const k of editableKeys) {
        if (k in formData && formData[k] !== material[k]) {
          payload[k] = formData[k]
        }
      }
      const updated = await apiPatchWithAuth<MaterialDetail>(
        `/api/database/materials/${material.id}/standardize`,
        Object.keys(payload).length ? payload : formData,
        accessToken
      )
      setMaterial(updated)
      setFormData({ ...updated })
      setEditMode(false)
      setIsDirty(false)
      toast.success('Padronização salva com sucesso!')
    } catch (err) {
      console.error('Erro ao salvar padronização:', err)
      toast.error((err as Error)?.message ?? 'Falha ao salvar padronização')
    } finally {
      setSaving(false)
    }
  }

  const showActionBar = can('can_standardize')

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span>Carregando material...</span>
      </div>
    )
  }

  if (error || !material) {
    return (
      <div className="space-y-4">
        <Link href="/database">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ChevronLeft className="size-4" />
            Voltar
          </Button>
        </Link>
        <p className="text-muted-foreground">
          {error ?? 'Material não encontrado.'}
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${showActionBar ? 'pb-24' : ''}`}>
      <Toaster position="top-right" richColors />
      <Link href="/database">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <ChevronLeft className="size-4" />
          Voltar
        </Button>
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-mono">
            {material.sap_code}
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            {material.description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                STATUS_BADGE[material.status] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300'
              }`}
            >
              {material.status}
            </span>
            {material.erp_status === 'pendente_erp' && (
              <span className="text-xs px-2 py-0.5 rounded-full border bg-yellow-50 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700">
                Pendente ERP
              </span>
            )}
            {material.erp_status === 'integrado' && (
              <span className="text-xs px-2 py-0.5 rounded-full border bg-green-50 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">
                Integrado ERP
              </span>
            )}
            {showActionBar && material.standardized_at && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Última padronização: {new Date(material.standardized_at).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>
        {showActionBar && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!editMode ? (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors duration-150"
              >
                Iniciar Padronização
              </button>
            ) : (
              <>
                {isDirty && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    ● Alterações não salvas
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors duration-150"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  {saving ? 'Salvando...' : 'Salvar Padronização'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        <SectionCard title="Dados Básicos">
          {editMode ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Status</span>
              <select
                value={String(formData.status ?? material.status)}
                onChange={(e) => handleUpdate('status', e.target.value)}
                className={INPUT_BASE}
              >
                <option value="Ativo">Ativo</option>
                <option value="Bloqueado">Bloqueado</option>
                <option value="Obsoleto">Obsoleto</option>
              </select>
            </div>
          ) : (
            <Row label="Status" value={<Cell value={material.status} />} />
          )}
          <EditableRow
            label="Código SAP"
            fieldKey="sap_code"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Descrição"
            fieldKey="description"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Grupo de Mercadorias"
            fieldKey="material_group"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Unidade de Medida"
            fieldKey="unit_of_measure"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Tipo de Material"
            fieldKey="material_type"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Peso Bruto"
            fieldKey="gross_weight"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
            formatDisplay={formatNumber}
          />
          <EditableRow
            label="Peso Líquido"
            fieldKey="net_weight"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
            formatDisplay={formatNumber}
          />
        </SectionCard>

        <SectionCard title="Classificação Fiscal">
          <EditableRow
            label="NCM"
            fieldKey="ncm"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="CFOP"
            fieldKey="cfop"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Origem do Material"
            fieldKey="origin"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
        </SectionCard>

        <SectionCard title="Compras">
          <EditableRow
            label="Grupo de Compras"
            fieldKey="purchase_group"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Prazo de Entrega (dias)"
            fieldKey="lead_time"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
            formatDisplay={formatNumber}
          />
          <EditableRow
            label="Unidade de Pedido"
            fieldKey="unit_of_measure"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
        </SectionCard>

        <SectionCard title="MRP">
          <EditableRow
            label="Tipo MRP"
            fieldKey="mrp_type"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Estoque Mínimo"
            fieldKey="min_stock"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
            formatDisplay={formatNumber}
          />
          <EditableRow
            label="Estoque Máximo"
            fieldKey="max_stock"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
            formatDisplay={formatNumber}
          />
        </SectionCard>

        <SectionCard title="Contabilidade">
          <EditableRow
            label="Classe de Valoração"
            fieldKey="valuation_class"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Preço Padrão"
            fieldKey="standard_price"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
            formatDisplay={formatCurrency}
          />
          <EditableRow
            label="Centro de Lucro"
            fieldKey="profit_center"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
        </SectionCard>

        <SectionCard title="Metadados">
          <EditableRow
            label="Código PDM"
            fieldKey="pdm_code"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Nome PDM"
            fieldKey="pdm_name"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <Row label="Data de Criação" value={formatDate(material.created_at)} />
          <Row label="Data de Atualização" value={formatDate(material.updated_at)} />
        </SectionCard>
      </div>
    </div>
  )
}
