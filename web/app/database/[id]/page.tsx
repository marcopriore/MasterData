'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { apiGetWithAuth, apiPatchWithAuth, apiPostWithAuth } from '@/lib/api'
import { useUser } from '@/contexts/user-context'
import { useMeasurementUnits } from '@/hooks/useMeasurementUnits'
import { NumericUnitInput } from '@/components/ui/numeric-unit-input'
import { formatAttrValue } from '@/lib/format-attr-value'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { useTheme } from 'next-themes'
import { maskNCM, maskCFOP } from '@/lib/masks'
import { DescriptionLengthIndicator } from '@/components/ui/description-length-indicator'

type MaterialDetail = {
  id: number
  id_sistema?: string | null
  id_erp: string | null
  description: string
  status: string
  technical_attributes?: Record<string, string> | null
  pdm_code?: string | null
  pdm_name?: string | null
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
  'bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100 rounded-md px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400'

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
    <span className="text-sm text-zinc-900 dark:text-zinc-100">
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
  isDark,
}: {
  label: string
  fieldKey: keyof MaterialDetail
  editMode: boolean
  formData: Record<string, unknown>
  material: MaterialDetail
  onUpdate: (key: string, value: string | number | null) => void
  formatDisplay?: (v: unknown) => string
  isDark?: boolean
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
            style={{ colorScheme: isDark ? 'dark' : 'light' }}
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
          style={{ colorScheme: isDark ? 'dark' : 'light' }}
        />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-sm text-zinc-900 dark:text-zinc-100 font-medium">{displayValue}</span>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{value ?? '—'}</span>
    </div>
  )
}

export default function DatabaseDetailPage() {
  const params = useParams()
  const id = Number(params.id)
  const { user, accessToken, can } = useUser()
  const maxLength = user?.max_description_length ?? 40
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [material, setMaterial] = useState<MaterialDetail | null>(null)
  const isDescriptionOverLimit = (material?.description?.length ?? 0) > maxLength
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingAttributes, setEditingAttributes] = useState(false)
  const [attrValues, setAttrValues] = useState<Record<string, string | { value: string; unit: string }>>({})
  const [generatedDesc, setGeneratedDesc] = useState<string>('')
  const isGeneratedDescOverLimit = generatedDesc.length > maxLength
  const [savingAttrs, setSavingAttrs] = useState(false)
  const [isIntegrating, setIsIntegrating] = useState(false)
  const measurementUnits = useMeasurementUnits()
  const [pdmTemplate, setPdmTemplate] = useState<{
    id: number
    name: string
    internal_code: string
    attributes?: Array<{
      id: string
      order?: number
      name: string
      dataType?: string
      isRequired?: boolean
      includeInDescription?: boolean
      abbreviation?: string
      allowedValues?: Array<{ value: string; abbreviation?: string } | string>
    }>
  } | null>(null)

  const generateDescription = useCallback(
    (
      _pdmName: string,
      attrs: Record<string, string | { value: string; unit?: string }>,
      template: { name: string; attributes?: Array<{ id: string; dataType?: string; includeInDescription?: boolean; abbreviation?: string; allowedValues?: Array<{ value: string; abbreviation?: string } | string> }> } | null
    ) => {
      if (!template) return ''
      const parts = [template.name.toUpperCase()]
      const sorted = [...(template.attributes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      sorted.forEach((attr) => {
        if (!attr.includeInDescription) return
        const val = attrs[attr.id]
        if (!val) {
          parts.push(`[${attr.abbreviation || attr.id}]`)
          return
        }
        if (typeof val === 'object' && val !== null && 'value' in val) {
          const v = val as { value: string; unit?: string }
          parts.push(`${v.value || ''}${v.unit || ''}`.toUpperCase().trim())
          return
        }
        const strVal = String(val)
        const allowed = attr.allowedValues || []
        const lov = allowed.find((av) =>
          typeof av === 'object' && av !== null && 'value' in av ? (av as { value: string }).value === strVal : String(av) === strVal
        )
        const abbr = typeof lov === 'object' && lov !== null && 'abbreviation' in lov ? (lov as { abbreviation?: string }).abbreviation : null
        parts.push((abbr || strVal).toUpperCase())
      })
      return parts.join(' ')
    },
    []
  )

  const fetchPdmTemplate = useCallback(
    async (pdmCode: string | null) => {
      if (!accessToken || !pdmCode) return
      try {
        const pdms = await apiGetWithAuth<Array<{ id: number; name: string; internal_code: string; is_active: boolean }>>(
          '/api/pdm',
          accessToken
        )
        const found = pdms.find((p) => p.internal_code === pdmCode)
        if (!found) return
        const full = await apiGetWithAuth<{
          id: number
          name: string
          internal_code: string
          attributes?: Array<{
            id: string
            order?: number
            name: string
            dataType?: string
            isRequired?: boolean
            includeInDescription?: boolean
            abbreviation?: string
            allowedValues?: Array<{ value: string; abbreviation?: string } | string>
          }>
        }>(`/api/pdm/${found.id}`, accessToken)
        setPdmTemplate(full)

        const currentAttrs = (material?.technical_attributes as Record<string, string | { value: string; unit: string }>) || {}
        const merged: Record<string, string | { value: string; unit: string }> = {}
        const sortedAttrs = [...(full.attributes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        sortedAttrs.forEach((attr) => {
          merged[attr.id] = currentAttrs[attr.id] !== undefined ? currentAttrs[attr.id] : ''
        })
        setAttrValues(merged)
        setGeneratedDesc(generateDescription(full.name || '', merged, full))
      } catch {
        setPdmTemplate(null)
      }
    },
    [accessToken, material?.technical_attributes, generateDescription]
  )

  const handleSaveAttributes = useCallback(async () => {
    if (!material || !accessToken) return
    setSavingAttrs(true)
    try {
      const updated = await apiPatchWithAuth<MaterialDetail>(
        `/api/database/materials/${material.id}/attributes`,
        {
          technical_attributes: attrValues,
          description: generatedDesc,
          ...(material.pdm_code && { pdm_code: material.pdm_code }),
          ...(material.pdm_name && { pdm_name: material.pdm_name }),
        },
        accessToken
      )
      setMaterial((prev) => (prev ? { ...prev, ...updated } : updated))
      setFormData((prev) => ({ ...prev, ...updated }))
      setIsDirty(true)
      setEditingAttributes(false)
      toast.success('Atributos salvos com sucesso!')
    } catch (e) {
      console.error('Erro ao salvar atributos:', e)
      toast.error((e as Error)?.message ?? 'Falha ao salvar atributos')
    } finally {
      setSavingAttrs(false)
    }
  }, [material, accessToken, attrValues, generatedDesc])

  useEffect(() => {
    if (!accessToken || !id || Number.isNaN(id)) return
    setLoading(true)
    setError(null)
    apiGetWithAuth<MaterialDetail>(`/api/database/materials/${id}`, accessToken)
      .then((m) => {
        setMaterial(m)
        setFormData({ ...m })
        setAttrValues((m.technical_attributes as Record<string, string | { value: string; unit: string }>) || {})
        setGeneratedDesc(m.description || '')
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
      setAttrValues((material.technical_attributes as Record<string, string | { value: string; unit: string }>) || {})
      setGeneratedDesc(material.description || '')
    }
    setEditMode(false)
    setEditingAttributes(false)
    setIsDirty(false)
  }

  const handleSave = async () => {
    if (!accessToken || !material) return
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}
      const editableKeys: (keyof MaterialDetail)[] = [
        'id_erp', 'description', 'status', 'pdm_code', 'pdm_name',
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

  const handleIntegrate = useCallback(async () => {
    if (!material || !accessToken) return
    setIsIntegrating(true)
    try {
      const res = await apiPostWithAuth<{ integrated: number[]; skipped: number[] }>(
        '/api/database/materials/erp-integrate',
        { material_ids: [material.id] },
        accessToken
      )
      if (res.integrated?.includes(material.id)) {
        setMaterial((prev) => prev ? { ...prev, erp_status: 'integrado', erp_integrated_at: new Date().toISOString() } : null)
        toast.success('Material integrado com sucesso!')
      } else {
        toast.error('Não foi possível integrar o material.')
      }
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Falha na integração')
    } finally {
      setIsIntegrating(false)
    }
  }, [material, accessToken])

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
            {material.id_erp ?? material.id_sistema ?? '—'}
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
            {material.erp_status === 'pendente_erp' && (
              <div className="relative group inline-block">
                <button
                  type="button"
                  disabled={isDescriptionOverLimit || isIntegrating}
                  onClick={handleIntegrate}
                  className="px-4 py-2 text-sm rounded-lg bg-[#0F1C38] dark:bg-[#C69A46] text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  {isIntegrating ? (
                    <>
                      <Loader2 className="size-4 animate-spin inline mr-2" />
                      Integrando...
                    </>
                  ) : (
                    'Integrar com ERP'
                  )}
                </button>
                {isDescriptionOverLimit && (
                  <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:flex bg-slate-800 dark:bg-slate-700 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-50 shadow-lg">
                    Corrija a Descrição Curta antes de integrar ({material?.description?.length ?? 0}/{maxLength} caracteres)
                    <div className="absolute right-4 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-800 dark:border-t-slate-700" />
                  </div>
                )}
              </div>
            )}
              {!editMode ? (
              <button
                type="button"
                onClick={() => {
                  setEditMode(true)
                  setEditingAttributes(true)
                  fetchPdmTemplate(material.pdm_code ?? null)
                }}
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
                style={{ colorScheme: isDark ? 'dark' : 'light' }}
              >
                <option value="Ativo">Ativo</option>
                <option value="Bloqueado">Bloqueado</option>
                <option value="Obsoleto">Obsoleto</option>
              </select>
            </div>
          ) : (
            <Row label="Status" value={<Cell value={material.status} />} />
          )}
          {material.id_sistema && (
            <Row label="ID Sistema" value={<span className="font-mono font-medium">{material.id_sistema}</span>} />
          )}
          <EditableRow
            label="Código ERP"
            isDark={isDark}
            fieldKey="id_erp"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Grupo de Mercadorias"
            isDark={isDark}
            fieldKey="material_group"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Unidade de Medida"
            isDark={isDark}
            fieldKey="unit_of_measure"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Tipo de Material"
            isDark={isDark}
            fieldKey="material_type"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Peso Bruto"
            isDark={isDark}
            fieldKey="gross_weight"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
            formatDisplay={formatNumber}
          />
          <EditableRow
            label="Peso Líquido"
            isDark={isDark}
            fieldKey="net_weight"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
            formatDisplay={formatNumber}
          />
        </SectionCard>

        {editingAttributes ? (
          <div className="rounded-xl border-2 border-blue-300 dark:border-blue-700 bg-white dark:bg-card p-6 sm:col-span-2">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
              Atributos Técnicos
            </h3>
            <div className="mb-4 rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-muted-foreground">
                Descrição Curta (gerada automaticamente)
              </p>
              <p className="font-mono text-sm font-bold text-slate-800 dark:text-foreground">
                {generatedDesc || '—'}
              </p>
              <DescriptionLengthIndicator
                description={generatedDesc || ''}
                maxLength={maxLength}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {pdmTemplate?.attributes && pdmTemplate.attributes.length > 0 ? pdmTemplate.attributes.map((attr) => {
                const isLov = attr.dataType === 'lov'
                const isNumeric = (attr.dataType === 'numeric' || attr.dataType === 'number') && measurementUnits.length > 0
                const options = (attr.allowedValues || []).map((av) =>
                  typeof av === 'object' && av !== null && 'value' in av ? (av as { value: string }).value : String(av)
                )
                const label = attr.name || attr.id
                const rawVal = attrValues[attr.id]
                const numericVal = typeof rawVal === 'object' && rawVal !== null ? (rawVal as { value?: string }).value ?? '' : String(rawVal ?? '')
                const numericUnit = typeof rawVal === 'object' && rawVal !== null ? (rawVal as { unit?: string }).unit ?? '' : ''
                return (
                  <div key={attr.id}>
                    <label className="text-xs font-medium capitalize text-slate-600 dark:text-muted-foreground">
                      {label.replace(/_/g, ' ')}
                      {attr.isRequired && <span className="ml-1 text-red-500">*</span>}
                    </label>
                    {isNumeric ? (
                      <div className="mt-1">
                        <NumericUnitInput
                          value={numericVal}
                          unit={numericUnit}
                          units={measurementUnits}
                          onChange={(val, unit) => {
                            const newVals = { ...attrValues, [attr.id]: { value: val, unit } }
                            setAttrValues(newVals)
                            setGeneratedDesc(generateDescription(material.pdm_name || '', newVals, pdmTemplate))
                          }}
                          placeholder={`Informe ${label.toLowerCase()}...`}
                        />
                      </div>
                    ) : isLov && options.length > 0 ? (
                      <select
                        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-background px-3 py-2 text-sm text-slate-800 dark:text-foreground"
                        value={typeof rawVal === 'string' ? rawVal : ''}
                        onChange={(e) => {
                          const newVals = { ...attrValues, [attr.id]: e.target.value }
                          setAttrValues(newVals)
                          setGeneratedDesc(
                            generateDescription(material.pdm_name || '', newVals, pdmTemplate)
                          )
                        }}
                      >
                        <option value="">Selecione...</option>
                        {options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="mt-1 w-full rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-background px-3 py-2 text-sm text-slate-800 dark:text-foreground"
                        value={typeof rawVal === 'string' ? rawVal : numericVal}
                        placeholder={`Informe ${label.toLowerCase()}...`}
                        onChange={(e) => {
                          const newVals = { ...attrValues, [attr.id]: e.target.value }
                          setAttrValues(newVals)
                          setGeneratedDesc(
                            generateDescription(material.pdm_name || '', newVals, pdmTemplate)
                          )
                        }}
                      />
                    )}
                  </div>
                )
              }) : (
                <p className="col-span-2 text-sm text-slate-500 dark:text-muted-foreground">
                  {material.pdm_code
                    ? 'Carregando template PDM...'
                    : 'Material sem código PDM. Atributos não podem ser editados.'}
                </p>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-lg border border-slate-200 dark:border-border px-4 py-2 text-sm text-slate-600 dark:text-foreground hover:bg-slate-50 dark:hover:bg-muted"
                onClick={() => {
                  setEditingAttributes(false)
                  setAttrValues((material.technical_attributes as Record<string, string | { value: string; unit: string }>) || {})
                  setGeneratedDesc(material.description || '')
                }}
              >
                Cancelar
              </button>
              <div className="relative group inline-block">
                <button
                  type="button"
                  className="rounded-lg bg-[#0F1C38] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-[#C69A46]"
                  disabled={savingAttrs}
                  onClick={() => handleSaveAttributes()}
                >
                  {savingAttrs ? 'Salvando...' : 'Salvar Atributos'}
                </button>
                {isGeneratedDescOverLimit && !savingAttrs && (
                  <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:flex bg-slate-800 dark:bg-slate-700 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-50 shadow-lg">
                    ⚠️ Descrição acima do limite ({generatedDesc.length}/{maxLength} caracteres) — salvo com alerta
                    <div className="absolute right-4 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-slate-800 dark:border-t-slate-700" />
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <SectionCard title="Atributos Técnicos">
            <div>
              <p className="text-xs text-slate-500 dark:text-muted-foreground">Descrição Curta</p>
              <p className="mt-0.5 font-bold font-mono text-slate-800 dark:text-foreground">
                {material.description || '—'}
              </p>
              <DescriptionLengthIndicator
                description={material.description || ''}
                maxLength={maxLength}
              />
            </div>
            {material.technical_attributes && Object.keys(material.technical_attributes).length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(material.technical_attributes).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-xs capitalize text-slate-500 dark:text-muted-foreground">
                      {key.replace(/_/g, ' ')}
                    </p>
                    <p className="mt-0.5 font-medium text-slate-800 dark:text-foreground">
                      {formatAttrValue(value)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 dark:text-muted-foreground">
                Nenhum atributo técnico registrado.
              </p>
            )}
          </SectionCard>
        )}

        <SectionCard title="Classificação Fiscal">
          <EditableRow
            label="NCM"
            isDark={isDark}
            fieldKey="ncm"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="CFOP"
            isDark={isDark}
            fieldKey="cfop"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Origem do Material"
            isDark={isDark}
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
            isDark={isDark}
            fieldKey="purchase_group"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Prazo de Entrega (dias)"
            isDark={isDark}
            fieldKey="lead_time"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
            formatDisplay={formatNumber}
          />
          <EditableRow
            label="Unidade de Pedido"
            isDark={isDark}
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
            isDark={isDark}
            fieldKey="mrp_type"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Estoque Mínimo"
            isDark={isDark}
            fieldKey="min_stock"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
            formatDisplay={formatNumber}
          />
          <EditableRow
            label="Estoque Máximo"
            isDark={isDark}
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
            isDark={isDark}
            fieldKey="valuation_class"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Preço Padrão"
            isDark={isDark}
            fieldKey="standard_price"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
            formatDisplay={formatCurrency}
          />
          <EditableRow
            label="Centro de Lucro"
            isDark={isDark}
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
            isDark={isDark}
            fieldKey="pdm_code"
            editMode={editMode}
            formData={formData}
            material={material}
            onUpdate={handleUpdate}
          />
          <EditableRow
            label="Nome PDM"
            isDark={isDark}
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
