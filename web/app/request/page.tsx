'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiGet, apiPost } from '@/lib/api'
import { Stepper, type StepItem } from '@/components/request/stepper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FieldGroup, FieldLabel, FieldError } from '@/components/ui/field'
import { Toaster, toast } from 'sonner'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'

const STEPS: StepItem[] = [
  { id: 1, label: 'Phase 1', description: 'Category Selection' },
  { id: 2, label: 'Phase 2', description: 'Technical Attributes' },
  { id: 3, label: 'Phase 3', description: 'Review' },
]

type PDMTemplate = {
  id: number
  name: string
  internal_code: string
  is_active: boolean
}

type Attribute = {
  id: string
  order: number
  name: string
  dataType: string
  isRequired: boolean
  includeInDescription: boolean
  abbreviation: string
  allowedValues?: Array<{ value: string; abbreviation: string }>
}

export default function NewMaterialRequestPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [selectedPdm, setSelectedPdm] = useState<number | null>(null)
  const [pdms, setPdms] = useState<PDMTemplate[]>([])
  const [pdmsLoading, setPdmsLoading] = useState(false)
  const [pdmsError, setPdmsError] = useState<string | null>(null)
  const [attributes, setAttributes] = useState<Attribute[]>([])
  const [attributesLoading, setAttributesLoading] = useState(false)
  const [attributesError, setAttributesError] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [invalidFieldIds, setInvalidFieldIds] = useState<Set<string>>(new Set())

  // Fetch templates on mount
  useEffect(() => {
    setPdmsLoading(true)
    setPdmsError(null)
    apiGet<PDMTemplate[]>('/api/pdm')
      .then((data) => setPdms(data))
      .catch((e: unknown) => setPdmsError((e as Error)?.message ?? 'Erro ao carregar PDMs'))
      .finally(() => setPdmsLoading(false))
  }, [])

  // Fetch attributes when entering Phase 2 with a selected PDM (keep for Phase 3 review)
  useEffect(() => {
    if (currentStep === 1 || selectedPdm == null) {
      setAttributes([])
      return
    }
    if (currentStep !== 2) return // Phase 3: keep attributes from Phase 2
    setAttributesLoading(true)
    setAttributesError(null)
    apiGet<Attribute[]>(`/api/pdm/${selectedPdm}/attributes`)
      .then((data) => setAttributes([...data].sort((a, b) => a.order - b.order)))
      .catch((e: unknown) =>
        setAttributesError((e as Error)?.message ?? 'Erro ao carregar atributos')
      )
      .finally(() => setAttributesLoading(false))
  }, [currentStep, selectedPdm])

  const selectedPdmTemplate = pdms.find((p) => p.id === selectedPdm)

  const handleNext = () => {
    // Phase 3: Finalize (must run before early return)
    if (currentStep === 3 && selectedPdm != null) {
      const data = {
        pdm_id: selectedPdm,
        requester: 'Anonymous',
        values: formData,
      }
      apiPost<{ id: number }>('/api/requests', data)
        .then(() => {
          toast.success('Solicitação enviada para governança com sucesso!', {
            position: 'top-right',
            duration: 1500,
          })
          setTimeout(() => router.push('/'), 1500)
        })
        .catch(() => {
          toast.error('Falha ao enviar solicitação. Tente novamente.', {
            position: 'top-right',
            duration: 3000,
          })
        })
      return
    }

    if (currentStep >= STEPS.length) return

    // Phase 2: validate required fields before advancing
    if (currentStep === 2) {
      const requiredAttrs = attributes.filter((a) => a.isRequired)
      const missingIds = requiredAttrs.filter((a) => {
        const val = formData[a.id] ?? ''
        return !val.trim()
      }).map((a) => a.id)

      if (missingIds.length > 0) {
        setInvalidFieldIds(new Set(missingIds))
        toast.error('Por favor, preencha todos os campos obrigatórios.', {
          position: 'top-right',
          duration: 3000,
        })
        return
      }
      setInvalidFieldIds(new Set())
    }

    setCurrentStep(currentStep + 1)
  }

  const handleBack = () => {
    if (currentStep > 1) {
      if (currentStep === 2) setInvalidFieldIds(new Set())
      setCurrentStep(currentStep - 1)
    }
  }

  const canGoNext =
    currentStep <= STEPS.length &&
    (currentStep === 1 ? selectedPdm != null : true)

  const handleAttrChange = (attrId: string, value: string) => {
    setFormData((prev) => ({ ...prev, [attrId]: value }))
    // Clear validation error when user fixes the field
    if (value.trim()) {
      setInvalidFieldIds((prev) => {
        const next = new Set(prev)
        next.delete(attrId)
        return next
      })
    }
  }

  // Smart reset: when PDM changes, clear formData so user starts with a fresh form
  const handlePdmChange = (v: string) => {
    const newPdmId = v ? Number(v) : null
    if (newPdmId !== selectedPdm) {
      setFormData({})
    }
    setSelectedPdm(newPdmId)
  }

  const isListaDeValores = (attr: Attribute) =>
    attr.dataType === 'lov' && (attr.allowedValues?.length ?? 0) > 0
  const isTextoOuNumerico = (attr: Attribute) =>
    attr.dataType === 'text' || attr.dataType === 'numeric'

  return (
    <main className="flex min-h-screen flex-col p-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5 text-slate-500 hover:bg-transparent hover:text-[#0F1C38] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <ChevronLeft className="size-4" />
              Início
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              New Material Request
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Follow the steps to create a new material description request
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-[#B4B9BE] bg-card p-6 dark:border-zinc-700/50">
          <Stepper steps={STEPS} currentStep={currentStep} />

          {/* Phase 1: PDM Template Selection */}
          {currentStep === 1 && (
            <div className="mt-8">
              <FieldGroup>
                <Field>
                  <FieldLabel className="text-[#0F1C38] dark:text-heading">
                    PDM Template
                  </FieldLabel>
                  <Select
                    value={selectedPdm?.toString() ?? ''}
                    onValueChange={handlePdmChange}
                    disabled={pdmsLoading}
                  >
                    <SelectTrigger className="w-full border-[#B4B9BE] focus-visible:ring-[#C69A46]/50 dark:border-zinc-600/50">
                      <SelectValue
                        placeholder={
                          pdmsLoading ? 'Carregando...' : 'Selecione um template...'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {pdms.map((pdm) => (
                        <SelectItem key={pdm.id} value={pdm.id.toString()}>
                          {pdm.name} ({pdm.internal_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pdmsError && (
                    <p className="mt-1 text-sm text-destructive">{pdmsError}</p>
                  )}
                </Field>
              </FieldGroup>
            </div>
          )}

          {/* Phase 2: Technical Attributes */}
          {currentStep === 2 && (
            <div className="mt-8">
              {attributesLoading ? (
                <p className="text-muted-foreground">Carregando atributos...</p>
              ) : attributesError ? (
                <p className="text-sm text-destructive">{attributesError}</p>
              ) : attributes.length === 0 ? (
                <p className="text-muted-foreground">
                  Este PDM não possui atributos técnicos.
                </p>
              ) : (
                <FieldGroup>
                  {attributes.map((attr) => {
                    const isInvalid = invalidFieldIds.has(attr.id)
                    const inputCn = isInvalid
                      ? 'border-destructive focus-visible:ring-destructive/50 dark:border-destructive'
                      : 'border-[#B4B9BE] focus-visible:ring-[#C69A46]/50 dark:border-zinc-600/50'
                    return (
                      <Field key={attr.id} data-invalid={isInvalid}>
                        <FieldLabel className="text-[#0F1C38] dark:text-heading">
                          {attr.name}
                          {attr.isRequired && (
                            <span className="text-[#C69A46]"> *</span>
                          )}
                        </FieldLabel>
                        {isListaDeValores(attr) ? (
                          <Select
                            value={formData[attr.id] ?? ''}
                            onValueChange={(v) => handleAttrChange(attr.id, v)}
                          >
                            <SelectTrigger
                              className={`w-full ${inputCn}`}
                              aria-invalid={isInvalid}
                            >
                              <SelectValue placeholder={`Selecione ${attr.name}...`} />
                            </SelectTrigger>
                            <SelectContent>
                              {attr.allowedValues!.map((av, idx) => (
                                <SelectItem key={`${av.value}-${idx}`} value={av.value}>
                                  {av.value}
                                  {av.abbreviation && ` (${av.abbreviation})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : isTextoOuNumerico(attr) ? (
                          <Input
                            type={attr.dataType === 'numeric' ? 'number' : 'text'}
                            value={formData[attr.id] ?? ''}
                            onChange={(e) => handleAttrChange(attr.id, attr.dataType === 'numeric' ? e.target.value : e.target.value.toUpperCase())}
                            placeholder={attr.name}
                            className={attr.dataType === 'numeric' ? inputCn : `${inputCn} uppercase`}
                            aria-invalid={isInvalid}
                          />
                        ) : null}
                        {isInvalid && (
                          <FieldError>Campo obrigatório</FieldError>
                        )}
                      </Field>
                    )
                  })}
                </FieldGroup>
              )}
            </div>
          )}

          {/* Phase 3: Review */}
          {currentStep === 3 && (
            <div className="mt-8 space-y-6">
              <h2 className="text-lg font-semibold text-foreground">
                Confirmação da Solicitação
              </h2>

              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Template PDM
                </h3>
                <p className="text-base font-medium text-foreground">
                  {selectedPdmTemplate?.name ?? '—'}
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Atributos
                </h3>
                <div className="overflow-hidden rounded-lg border border-[#B4B9BE] dark:border-zinc-700/50">
                  <table className="w-full text-sm">
                    <tbody>
                      {attributes.map((attr) => (
                        <tr
                          key={attr.id}
                          className="border-b border-[#B4B9BE]/60 last:border-b-0 dark:border-zinc-700/40"
                        >
                          <td className="w-[45%] bg-muted/30 px-4 py-3 font-medium text-foreground">
                            {attr.name}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formData[attr.id]?.trim() || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-4">
            {currentStep > 1 ? (
              <Button variant="outline" onClick={handleBack}>
                <ChevronLeft className="size-4" />
                Back
              </Button>
            ) : (
              <div />
            )}
            <Button
              onClick={handleNext}
              disabled={!canGoNext}
              className="bg-[#0F1C38] hover:bg-[#0F1C38]/90 focus-visible:ring-[#C69A46]/50 dark:bg-primary dark:hover:bg-primary/90"
            >
              {currentStep === 3 ? (
                <>
                  Finalizar Solicitação
                  <Check className="size-4" />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      <Toaster position="top-right" richColors duration={3000} />
    </main>
  )
}
