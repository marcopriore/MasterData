"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Eye, FileText, Package, Hash } from "lucide-react"
import type { PDMTemplate, Attribute } from "@/app/request/page"
import type { AttrValue } from "@/components/request/phase-specs"
import { formatAttrValue } from "@/lib/format-attr-value"
import { cn } from "@/lib/utils"

interface RequestSummaryProps {
  pdm: PDMTemplate | null
  attributes: Attribute[]
  attrValues: Record<string, AttrValue>
  quantity: string
  requesterName: string
  costCenter: string
  urgency: "low" | "medium" | "high"
}

const urgencyLabels: Record<string, { label: string; className: string }> = {
  low:    { label: "Baixa",  className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  medium: { label: "Média",  className: "bg-amber-50 text-amber-700 border-amber-200" },
  high:   { label: "Alta",   className: "bg-red-50 text-red-700 border-red-200" },
}

export function RequestSummary({
  pdm,
  attributes,
  attrValues,
  quantity,
  requesterName,
  costCenter,
  urgency,
}: RequestSummaryProps) {

  // Build description preview using abbreviations from LOV or raw value
  const generatePreview = () => {
    if (!pdm) return "Selecione um PDM..."
    const parts: string[] = [pdm.name.toUpperCase()]
    attributes
      .filter((a) => a.includeInDescription)
      .forEach((attr) => {
        const val = attrValues[attr.id]
        if (!val) {
          parts.push(`[${attr.abbreviation}]`)
          return
        }
        if (typeof val === "object" && val !== null && "value" in val) {
          const v = val as { value: string; unit?: string }
          parts.push(`${v.value || ""}${v.unit || ""}`.toUpperCase().trim())
          return
        }
        const strVal = String(val)
        const lov = attr.allowedValues?.find((av) => av.value === strVal)
        parts.push((lov?.abbreviation || strVal).toUpperCase())
      })
    return parts.join(" ")
  }

  const filledCount = attributes.filter((a) => {
    const v = attrValues[a.id]
    const s = typeof v === "string" ? v : (v && typeof v === "object" ? v.value ?? "" : "")
    return (s ?? "").trim() !== ""
  }).length
  const totalCount = attributes.length
  const progress = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0

  return (
    <Card className="border-[#B4B9BE]/60 shadow-sm sticky top-20 z-40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Eye className="size-4 text-[#0F1C38]" />
          Preview da Descrição
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Generated description */}
        <div className="rounded-lg border border-[#B4B9BE]/40 bg-slate-50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#0F1C38]/60 mb-1.5">
            Descrição Gerada
          </p>
          <code className="text-xs font-mono font-bold text-[#0F1C38] leading-relaxed block break-words">
            {generatePreview()}
          </code>
        </div>

        {/* Fill progress */}
        {pdm && totalCount > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Preenchimento</span>
              <span className="font-semibold text-foreground">{filledCount}/{totalCount} · {progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  progress === 100 ? "bg-emerald-500" : "bg-[#0F1C38]"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <Separator className="bg-[#B4B9BE]/40" />

        {/* Summary details */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs">
            <Package className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Material:</span>
            <span className="font-medium text-foreground truncate">{pdm ? pdm.name : "—"}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <FileText className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Código:</span>
            <span className="font-mono font-medium text-foreground">{pdm ? pdm.internal_code : "—"}</span>
          </div>
          {quantity && (
            <div className="flex items-center gap-2 text-xs">
              <Hash className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Qtd:</span>
              <span className="font-semibold text-foreground">{quantity}</span>
            </div>
          )}
          {requesterName && (
            <div className="flex items-center gap-2 text-xs">
              <span className="size-3.5 shrink-0 text-center text-muted-foreground font-bold text-[10px]">S</span>
              <span className="text-muted-foreground">Solicitante:</span>
              <span className="font-medium text-foreground truncate">{requesterName}</span>
            </div>
          )}
          {costCenter && (
            <div className="flex items-center gap-2 text-xs">
              <span className="size-3.5 shrink-0 text-center text-muted-foreground font-bold text-[10px]">CC</span>
              <span className="text-muted-foreground">Centro:</span>
              <span className="font-mono font-medium text-foreground">{costCenter}</span>
            </div>
          )}
        </div>

        {/* Urgency badge */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">Urgência</span>
          <Badge variant="outline" className={cn("text-[10px]", urgencyLabels[urgency]?.className)}>
            {urgencyLabels[urgency]?.label}
          </Badge>
        </div>

        {/* Filled attributes */}
        {filledCount > 0 && (
          <>
            <Separator className="bg-[#B4B9BE]/40" />
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Atributos Preenchidos
              </p>
              {attributes
                .filter((a) => {
                  const v = attrValues[a.id]
                  const s = typeof v === "string" ? v : (v && typeof v === "object" ? v.value ?? "" : "")
                  return (s ?? "").trim() !== ""
                })
                .map((attr) => (
                  <div key={attr.id} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate mr-2">{attr.name}</span>
                    <span className="font-mono font-medium text-foreground shrink-0">{formatAttrValue(attrValues[attr.id])}</span>
                  </div>
                ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
