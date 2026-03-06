"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Clipboard, Settings2, Info, AlertCircle } from "lucide-react"
import { FIELD_MASKS } from "@/lib/masks"
import { NumericUnitInput } from "@/components/ui/numeric-unit-input"
import type { MeasurementUnit } from "@/hooks/useMeasurementUnits"
import type { PDMTemplate, Attribute } from "@/app/request/page"

export type AttrValue = string | { value: string; unit: string }

function getMaskForAttr(attr: Attribute): ((v: string) => string) | null {
  const id = attr.id?.toLowerCase().replace(/\s+/g, '_') ?? ''
  const name = attr.name?.toLowerCase().replace(/\s+/g, '_') ?? ''
  return FIELD_MASKS[id] ?? FIELD_MASKS[name] ?? null
}

interface PhaseSpecsProps {
  pdms: PDMTemplate[]
  pdmsLoading: boolean
  selectedPdmId: number | null
  onPdmChange: (v: string) => void
  attributes: Attribute[]
  attributesLoading: boolean
  values: Record<string, AttrValue>
  onChange: (attrId: string, value: AttrValue) => void
  invalidFieldIds: Set<string>
  measurementUnits?: MeasurementUnit[]
}

export function PhaseSpecs({
  pdms,
  pdmsLoading,
  selectedPdmId,
  onPdmChange,
  attributes,
  attributesLoading,
  values,
  onChange,
  invalidFieldIds,
  measurementUnits = [],
}: PhaseSpecsProps) {
  const selectedPdm = pdms.find((p) => p.id === selectedPdmId)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Especificações Técnicas</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Selecione o template PDM e preencha os atributos do material.
        </p>
      </div>

      {/* PDM Selection + General Info */}
      <Card className="border-[#B4B9BE]/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clipboard className="size-4 text-[#0F1C38]" />
            Informações Gerais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* PDM Template selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1">
              Template PDM
              <span className="text-[#C69A46]"> *</span>
            </Label>
            <Select
              value={selectedPdmId?.toString() ?? ''}
              onValueChange={onPdmChange}
              disabled={pdmsLoading}
            >
              <SelectTrigger className="w-full border-[#B4B9BE] focus-visible:ring-[#C69A46]/50">
                <SelectValue placeholder={pdmsLoading ? 'Carregando...' : 'Selecione um template PDM...'} />
              </SelectTrigger>
              <SelectContent>
                {pdms.map((pdm) => (
                  <SelectItem key={pdm.id} value={pdm.id.toString()}>
                    {pdm.name} ({pdm.internal_code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* PDM selecionado */}
          {selectedPdm && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1">
                <Settings2 className="size-3.5 text-muted-foreground" />
                PDM Selecionado
              </Label>
              <div className="flex h-10 items-center rounded-lg border border-[#B4B9BE]/60 bg-slate-50 px-3">
                <span className="text-sm font-mono text-muted-foreground truncate">
                  {selectedPdm.internal_code}
                </span>
                <Badge variant="secondary" className="ml-auto text-[10px] shrink-0">
                  {selectedPdm.name}
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Technical Attributes */}
      {selectedPdmId != null && (
        <Card className="border-[#B4B9BE]/60 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Settings2 className="size-4 text-[#0F1C38]" />
              Atributos Técnicos
              {!attributesLoading && attributes.length > 0 && (
                <Badge variant="outline" className="ml-auto text-[10px] font-normal border-[#B4B9BE]">
                  {attributes.filter((a) => a.isRequired).length} obrigatório(s)
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {attributesLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Carregando atributos...</p>
            ) : attributes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Este PDM não possui atributos técnicos.</p>
            ) : (
              <div className="space-y-1">
                {attributes.map((attr, index) => {
                  const isInvalid = invalidFieldIds.has(attr.id)
                  const isLov = attr.dataType === 'lov' && (attr.allowedValues?.length ?? 0) > 0
                  const inputCn = isInvalid
                    ? 'border-destructive focus-visible:ring-destructive/50'
                    : 'border-[#B4B9BE] focus-visible:ring-[#C69A46]/50'

                  return (
                    <div key={attr.id}>
                      {index > 0 && <Separator className="my-4 bg-[#B4B9BE]/30" />}
                      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[1fr_1.5fr] items-start">

                        {/* Label + tooltip */}
                        <div className="flex items-center gap-2 sm:pt-2.5">
                          <Label
                            htmlFor={`attr-${attr.id}`}
                            className="text-sm font-medium"
                          >
                            {attr.name}
                            {attr.isRequired && (
                              <span className="text-[#C69A46] ml-0.5"> *</span>
                            )}
                          </Label>
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="size-3.5 text-muted-foreground/50 cursor-help shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-[220px] space-y-1">
                                {attr.description && (
                                  <p className="text-xs leading-relaxed">{attr.description}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  Tipo:{' '}
                                  {attr.dataType === 'numeric' ? 'Numérico' : attr.dataType === 'text' ? 'Texto' : 'Lista de Valores'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Abreviação:{' '}
                                  <span className="font-mono font-bold text-foreground">{attr.abbreviation}</span>
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>

                        {/* Input */}
                        <div className="space-y-1">
                          {(attr.dataType === "numeric" || attr.dataType === "number") && measurementUnits.length > 0 ? (
                            <NumericUnitInput
                              value={typeof values[attr.id] === "object" && values[attr.id] !== null ? (values[attr.id] as { value?: string }).value ?? "" : String(values[attr.id] ?? "")}
                              unit={typeof values[attr.id] === "object" && values[attr.id] !== null ? (values[attr.id] as { unit?: string }).unit ?? "" : ""}
                              units={measurementUnits}
                              onChange={(val, unit) => onChange(attr.id, { value: val, unit })}
                              placeholder={`Informe ${attr.name.toLowerCase()}...`}
                              required={attr.isRequired}
                            />
                          ) : isLov ? (
                            <Select
                              value={typeof values[attr.id] === "string" ? values[attr.id] ?? "" : ""}
                              onValueChange={(v) => onChange(attr.id, v)}
                            >
                              <SelectTrigger
                                id={`attr-${attr.id}`}
                                className={`h-10 w-full ${inputCn}`}
                                aria-invalid={isInvalid}
                              >
                                <SelectValue placeholder={`Selecione ${attr.name.toLowerCase()}...`} />
                              </SelectTrigger>
                              <SelectContent>
                                {attr.allowedValues!.map((av, i) => (
                                  <SelectItem key={`${av.value}-${i}`} value={av.value}>
                                    {av.value}
                                    {av.abbreviation && (
                                      <span className="ml-1.5 text-muted-foreground font-mono text-[11px]">({av.abbreviation})</span>
                                    )}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (() => {
                            const maskFn = getMaskForAttr(attr)
                            const hasMask = !!maskFn
                            const strVal = typeof values[attr.id] === "object" && values[attr.id] !== null
                              ? (values[attr.id] as { value?: string }).value ?? ""
                              : String(values[attr.id] ?? "")
                            const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                              const raw = e.target.value
                              const val = hasMask
                                ? maskFn(raw)
                                : attr.dataType === "numeric"
                                  ? raw
                                  : raw.toUpperCase()
                              onChange(attr.id, val)
                            }
                            return (
                              <Input
                                id={`attr-${attr.id}`}
                                type={hasMask ? "text" : attr.dataType === "numeric" ? "number" : "text"}
                                value={strVal}
                                onChange={handleChange}
                                placeholder={attr.dataType === 'numeric' && !hasMask ? 'Valor numérico...' : `INFORME ${attr.name.toUpperCase()}...`}
                                className={`h-10 ${attr.dataType !== 'numeric' && !hasMask ? 'uppercase' : ''} ${inputCn}`}
                                aria-invalid={isInvalid}
                                maxLength={hasMask ? undefined : 100}
                                min={!hasMask && attr.dataType === 'numeric' ? 0 : undefined}
                              />
                            )
                          })()}
                          {isInvalid && (
                            <p className="flex items-center gap-1 text-xs text-destructive">
                              <AlertCircle className="size-3" />
                              Campo obrigatório
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
