'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiGet, apiGetWithAuth, apiPostWithAuth, apiUpload } from '@/lib/api'
import { useUser } from '@/contexts/user-context'
import { Stepper, type StepItem } from '@/components/request/stepper'
import { PhaseAdmin } from '@/components/request/phase-admin'
import { PhaseSearch } from '@/components/request/phase-search'
import { PhaseSpecs } from '@/components/request/phase-specs'
import { PhaseDocs } from '@/components/request/phase-docs'
import { RequestSummary } from '@/components/request/request-summary'
import { Button } from '@/components/ui/button'
import { Toaster, toast } from 'sonner'
import { Check, ChevronLeft, ChevronRight, FileText, Loader2, Search } from 'lucide-react'

const STEPS: StepItem[] = [
  { id: 0, label: 'Pesquisa', description: 'Verificar Base de Dados', indicator: <Search className="size-4" /> },
  { id: 1, label: 'Fase 1', description: 'Informações Administrativas' },
  { id: 2, label: 'Fase 2', description: 'Atributos Técnicos' },
  { id: 3, label: 'Fase 3', description: 'Documentação e Justificativa' },
  { id: 4, label: 'Fase 4', description: 'Revisão Final' },
]

export type PDMTemplate = {
  id: number
  name: string
  internal_code: string
  is_active: boolean
}

export type Attribute = {
  id: string
  order: number
  name: string
  description?: string
  dataType: string
  isRequired: boolean
  includeInDescription: boolean
  abbreviation: string
  allowedValues?: Array<{ value: string; abbreviation: string }>
}

export type UploadedFile = {
  id: string
  file: File
  preview?: string
}

type MaterialSearchItem = {
  id: number
  sap_code: string
  description: string
  status: string
  pdm_code: string | null
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
}

export default function NewMaterialRequestPage() {
  const router = useRouter()
  const { user, accessToken } = useUser()
  const [currentStep, setCurrentStep] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Step 0 – Link de Pesquisa
  const [hasSearched, setHasSearched] = useState(false)
  const [searchResults, setSearchResults] = useState<MaterialSearchItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  // Phase 1 – Admin
  const [requesterName, setRequesterName] = useState(user?.name ? user.name.toUpperCase() : '')
  const [costCenter, setCostCenter] = useState('')
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high'>('low')

  // Phase 2 – Specs
  const [pdms, setPdms] = useState<PDMTemplate[]>([])
  const [pdmsLoading, setPdmsLoading] = useState(false)
  const [selectedPdm, setSelectedPdm] = useState<number | null>(null)
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [attributesLoading, setAttributesLoading] = useState(false)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [invalidFieldIds, setInvalidFieldIds] = useState<Set<string>>(new Set())
  const [quantity, setQuantity] = useState('')
  const [descriptionNote, setDescriptionNote] = useState('')

  // Phase 3 – Docs & Justificativa
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [justificativa, setJustificativa] = useState('')

  // Auto-fill requester name from the logged-in user when it becomes available
  useEffect(() => {
    if (user?.name) {
      setRequesterName(user.name.toUpperCase())
    }
  }, [user?.name])

  // Fetch PDM templates on mount
  useEffect(() => {
    setPdmsLoading(true)
    apiGet<PDMTemplate[]>('/api/pdm')
      .then(setPdms)
      .catch((e: unknown) => toast.error((e as Error)?.message ?? 'Erro ao carregar PDMs'))
      .finally(() => setPdmsLoading(false))
  }, [])

  // Fetch full PDM template + attributes when a PDM is selected (entering Phase 2)
  useEffect(() => {
    if (selectedPdm == null) { setAttributes([]); return }
    setAttributesLoading(true)
    apiGet<{ id: number; name: string; internal_code: string; attributes: Attribute[] }>(
      `/api/pdm/${selectedPdm}`
    )
      .then((pdm) => {
        const sorted = [...pdm.attributes].sort((a, b) => a.order - b.order)
        setAttributes(sorted)

        // Development aid — log the full schema so the team can see all fields
        console.group(`[PDM] ${pdm.name} (${pdm.internal_code})`)
        console.log('id:', pdm.id)
        console.log('attributes (%d fields):', sorted.length)
        sorted.forEach((attr, i) => {
          const type = attr.dataType === 'lov'
            ? `LOV [${(attr.allowedValues ?? []).map(v => v.value).join(' | ')}]`
            : attr.dataType
          console.log(
            `  ${i + 1}. [${attr.id}] ${attr.name}` +
            ` — ${type}` +
            (attr.isRequired ? ' *required*' : '') +
            (attr.includeInDescription ? ' 📋' : '')
          )
        })
        console.groupEnd()
      })
      .catch((e: unknown) => toast.error((e as Error)?.message ?? 'Erro ao carregar atributos'))
      .finally(() => setAttributesLoading(false))
  }, [selectedPdm])

  const selectedPdmTemplate = pdms.find((p) => p.id === selectedPdm) ?? null

  const handleAttrChange = useCallback((attrId: string, value: string) => {
    setFormData((prev) => ({ ...prev, [attrId]: value }))
    if (value.trim()) {
      setInvalidFieldIds((prev) => { const n = new Set(prev); n.delete(attrId); return n })
    }
  }, [])

  const handlePdmChange = useCallback((v: string) => {
    const newId = v ? Number(v) : null
    if (newId !== selectedPdm) setFormData({})
    setSelectedPdm(newId)
  }, [selectedPdm])

  const handleSearch = useCallback((q: string) => {
    if (!accessToken || !q.trim()) return
    setSearchLoading(true)
    const params = new URLSearchParams()
    params.set('q', q.trim())
    apiGetWithAuth<MaterialSearchItem[]>(
      `/api/database/materials/search?${params.toString()}`,
      accessToken
    )
      .then((data) => {
        setSearchResults(Array.isArray(data) ? data : [])
        setHasSearched(true)
      })
      .catch(() => {
        setSearchResults([])
        setHasSearched(true)
      })
      .finally(() => setSearchLoading(false))
  }, [accessToken])

  const validateStep = (step: number): boolean => {
    if (step === 1) {
      if (!requesterName.trim()) { toast.error('Informe o nome do solicitante.'); return false }
      return true
    }
    if (step === 2) {
      if (!selectedPdm) { toast.error('Selecione um template PDM.'); return false }
      const missing = attributes.filter((a) => a.isRequired && !(formData[a.id] ?? '').trim()).map((a) => a.id)
      if (missing.length > 0) {
        setInvalidFieldIds(new Set(missing))
        toast.error('Preencha todos os campos obrigatórios.')
        return false
      }
      setInvalidFieldIds(new Set())
      return true
    }
    if (step === 3) {
      return true
    }
    return true
  }

  const handleNext = async () => {
    if (currentStep === 4) {
      // Build the generated description the same way ReviewPhase renders it
      const selectedPdmObj = pdms.find((p) => p.id === selectedPdm) ?? null
      const generatedDescription = selectedPdmObj
        ? [
            selectedPdmObj.name.toUpperCase(),
            ...attributes
              .filter((a) => a.includeInDescription)
              .map((a) => {
                const val = formData[a.id]
                const lov = a.allowedValues?.find((av) => av.value === val)
                return val ? (lov?.abbreviation || val).toUpperCase() : `[${a.abbreviation}]`
              }),
          ].join(' ')
        : ''

      const payload = {
        pdm_id: selectedPdm,
        requester: requesterName,
        cost_center: costCenter,
        urgency,
        generated_description: generatedDescription,
        values: formData,
        // Pass filenames for the legacy JSON column; the real files are
        // uploaded individually after the request row is created.
        attachments: uploadedFiles.map((f) => f.file.name),
      }

      setIsSubmitting(true)
      try {
        // Step 1 — create the request record
        const result = await apiPostWithAuth<{ id: number }>('/api/requests', payload, accessToken)
        const requestId = result.id

        // Step 2 — upload each file to the new request_attachments table
        if (uploadedFiles.length > 0) {
          const uploadResults = await Promise.allSettled(
            uploadedFiles.map((uf) =>
              apiUpload(`/api/requests/${requestId}/attachments`, uf.file)
            )
          )
          const failed = uploadResults.filter((r) => r.status === 'rejected')
          if (failed.length > 0) {
            const reasons = failed
              .map((r) => (r as PromiseRejectedResult).reason?.message ?? 'erro')
              .join('; ')
            // Non-fatal: request was saved, but warn about partial upload
            toast.warning(
              `Solicitação #${requestId} criada, mas ${failed.length} arquivo(s) falharam: ${reasons}`,
              { duration: 8000 }
            )
          }
        }

        toast.success(`Solicitação #${requestId} criada com sucesso!`, {
          description: 'Redirecionando para Governança…',
          duration: 3000,
        })
        setTimeout(() => router.push('/governance'), 1600)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido'
        toast.error('Falha ao enviar solicitação', {
          description: msg,
          duration: 6000,
        })
      } finally {
        setIsSubmitting(false)
      }
      return
    }
    if (!validateStep(currentStep)) return
    setCurrentStep((s) => s + 1)
  }

  const handleBack = () => {
    if (currentStep > 0 && currentStep !== 1) {
      if (currentStep === 2) setInvalidFieldIds(new Set())
      setCurrentStep((s) => s - 1)
    } else if (currentStep === 1) {
      setCurrentStep(0)
    }
  }

  const isPhase2 = currentStep === 2
  const isStep0 = currentStep === 0
  const showSidebar = isPhase2 && selectedPdmTemplate != null

  return (
    <main className="flex min-h-screen flex-col p-6 md:p-8">
      <div className="mx-auto w-full max-w-5xl">

        {/* Page header */}
        <div className="mb-6 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="shrink-0 gap-1.5 text-slate-500 hover:bg-transparent hover:text-[#0F1C38]">
              <ChevronLeft className="size-4" />
              Início
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
              <FileText className="size-6 text-[#0F1C38]" />
              Nova Solicitação de Cadastro
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Siga as etapas para criar uma nova solicitação de descrição de material
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div className="mb-6 rounded-2xl border border-[#B4B9BE] bg-white px-6 py-5 shadow-[var(--shadow-card-float)]">
          <Stepper steps={STEPS} currentStep={currentStep} />
        </div>

        {/* Main content area — sidebar layout on Phase 2 */}
        <div className={showSidebar ? 'grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]' : ''}>

          {/* Form card */}
          <div className="rounded-2xl border border-[#B4B9BE] bg-white px-6 py-6 shadow-[var(--shadow-card-float)]">

            {/* Step 0 – Link de Pesquisa */}
            {currentStep === 0 && (
              <PhaseSearch
                accessToken={accessToken}
                hasSearched={hasSearched}
                searchResults={searchResults}
                searchLoading={searchLoading}
                onSearch={handleSearch}
                onFoundGoHome={() => router.push('/')}
                onNotFoundCreateRequest={() => setCurrentStep(1)}
              />
            )}

            {/* Phase 1 – Admin */}
            {currentStep === 1 && (
              <PhaseAdmin
                requesterName={requesterName}
                requesterEmail={user?.email ?? ''}
                urgency={urgency}
                onUrgencyChange={setUrgency}
              />
            )}

            {/* Phase 2 – Technical Specs */}
            {currentStep === 2 && (
              <PhaseSpecs
                pdms={pdms}
                pdmsLoading={pdmsLoading}
                selectedPdmId={selectedPdm}
                onPdmChange={handlePdmChange}
                attributes={attributes}
                attributesLoading={attributesLoading}
                values={formData}
                onChange={handleAttrChange}
                invalidFieldIds={invalidFieldIds}
              />
            )}

            {/* Phase 3 – Docs & Justificativa */}
            {currentStep === 3 && (
              <PhaseDocs
                files={uploadedFiles}
                onFilesChange={setUploadedFiles}
              />
            )}

            {/* Phase 4 – Review */}
            {currentStep === 4 && (
              <ReviewPhase
                pdm={selectedPdmTemplate}
                attributes={attributes}
                formData={formData}
                quantity={quantity}
                requesterName={requesterName}
                costCenter={costCenter}
                urgency={urgency}
                justificativa={justificativa}
                files={uploadedFiles}
                descriptionNote={descriptionNote}
              />
            )}

            {/* Navigation buttons — hidden on Step 0 (has its own buttons) */}
            {!isStep0 && (
              <div className="mt-8 flex items-center justify-between gap-4 border-t border-[#B4B9BE]/40 pt-6">
                {currentStep >= 1 ? (
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    disabled={isSubmitting}
                    className="gap-1.5"
                  >
                    <ChevronLeft className="size-4" />
                    Voltar
                  </Button>
                ) : <div />}
                <Button
                  onClick={handleNext}
                  disabled={isSubmitting}
                  className="gap-1.5 bg-[#0F1C38] hover:bg-[#0F1C38]/90 focus-visible:ring-[#C69A46]/50 disabled:opacity-60"
                >
                  {currentStep === 4 ? (
                    isSubmitting ? (
                      <><Loader2 className="size-4 animate-spin" />Enviando…</>
                    ) : (
                      <><Check className="size-4" />Finalizar Solicitação</>
                    )
                  ) : (
                    <>Próximo<ChevronRight className="size-4" /></>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Sticky preview sidebar — only on Phase 2 */}
          {showSidebar && (
            <div className="hidden lg:block">
              <RequestSummary
                pdm={selectedPdmTemplate}
                attributes={attributes}
                attrValues={formData}
                quantity={quantity}
                requesterName={requesterName}
                costCenter={costCenter}
                urgency={urgency}
              />
            </div>
          )}
        </div>
      </div>
      <Toaster position="top-right" richColors duration={3000} />
    </main>
  )
}

// ─── Inline Review Phase ──────────────────────────────────────────────────────

type ReviewPhaseProps = {
  pdm: PDMTemplate | null
  attributes: Attribute[]
  formData: Record<string, string>
  quantity: string
  requesterName: string
  costCenter: string
  urgency: 'low' | 'medium' | 'high'
  justificativa: string
  files: UploadedFile[]
  descriptionNote: string
}

const urgencyLabel = { low: 'Baixa', medium: 'Média', high: 'Alta' }
const urgencyClass = {
  low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-red-50 text-red-700 border-red-200',
}

function ReviewSection({ title }: { title: string }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {title}
    </h3>
  )
}

function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[#B4B9BE]/30 last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className={`text-sm font-medium text-foreground text-right ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}

function ReviewPhase({ pdm, attributes, formData, quantity, requesterName, costCenter, urgency, justificativa, files, descriptionNote }: ReviewPhaseProps) {
  // Build description preview
  const preview = pdm
    ? [pdm.name.toUpperCase(), ...attributes.filter(a => a.includeInDescription).map(a => {
        const val = formData[a.id]
        const lov = a.allowedValues?.find(av => av.value === val)
        return val ? (lov?.abbreviation || val).toUpperCase() : `[${a.abbreviation}]`
      })].join(' ')
    : '—'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Revisão da Solicitação</h2>
        <p className="text-sm text-muted-foreground mt-1">Confirme todos os dados antes de enviar.</p>
      </div>

      {/* Description preview */}
      <div className="rounded-xl border border-[#B4B9BE]/60 bg-slate-50 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#0F1C38]/60 mb-2">Descrição Gerada</p>
        <code className="text-sm font-mono font-bold text-[#0F1C38] break-words leading-relaxed">{preview}</code>
      </div>

      {/* Admin */}
      <div>
        <ReviewSection title="Informações Administrativas" />
        <div className="rounded-xl border border-[#B4B9BE]/60 bg-white px-4">
          <ReviewRow label="Solicitante" value={requesterName} />
          <div className="flex items-start justify-between gap-4 py-2">
            <span className="text-sm text-muted-foreground">Urgência</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${urgencyClass[urgency]}`}>
              {urgencyLabel[urgency]}
            </span>
          </div>
        </div>
      </div>

      {/* Attributes */}
      <div>
        <ReviewSection title="Atributos Técnicos" />
        <div className="overflow-hidden rounded-xl border border-[#B4B9BE]/60">
          <table className="w-full text-sm">
            <tbody>
              {attributes.map((attr) => (
                <tr key={attr.id} className="border-b border-[#B4B9BE]/40 last:border-0">
                  <td className="w-[45%] bg-slate-50 px-4 py-2.5 font-medium text-foreground">{attr.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono">{formData[attr.id]?.trim() || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Docs */}
      {files.length > 0 && (
        <div>
          <ReviewSection title={`Documentação de Apoio (${files.length} arquivo${files.length !== 1 ? 's' : ''})`} />
          <div className="flex flex-wrap gap-2">
            {files.map((f) => (
              <span key={f.id} className="inline-flex items-center gap-1.5 rounded-lg border border-[#B4B9BE]/60 bg-slate-50 px-3 py-1.5 text-xs font-medium text-foreground">
                {f.file.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {descriptionNote && (
        <div>
          <ReviewSection title="Observação Complementar" />
          <div className="rounded-xl border border-[#B4B9BE]/60 bg-white px-4 py-3">
            <p className="text-sm text-foreground">{descriptionNote}</p>
          </div>
        </div>
      )}
    </div>
  )
}
