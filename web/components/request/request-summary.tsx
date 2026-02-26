"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Eye, FileText, Package } from "lucide-react"
import type { PDMTemplate } from "./phase-category"
import { cn } from "@/lib/utils"

interface RequestSummaryProps {
  pdm: PDMTemplate | null
  attrValues: Record<string, string>
  quantity: string
  requesterName: string
  costCenter: string
  urgency: "low" | "medium" | "high"
}

const urgencyLabels: Record<string, { label: string; className: string }> = {
  low: { label: "Baixa", className: "bg-success/10 text-success border-success/20" },
  medium: { label: "Media", className: "bg-warning/10 text-warning-foreground border-warning/20" },
  high: { label: "Alta", className: "bg-destructive/10 text-destructive border-destructive/20" },
}

export function RequestSummary({
  pdm,
  attrValues,
  quantity,
  requesterName,
  costCenter,
  urgency,
}: RequestSummaryProps) {
  const generatePreview = () => {
    if (!pdm) return "Selecione um material..."
    const parts: string[] = [pdm.name.toUpperCase()]
    pdm.attributes.forEach((attr) => {
      const val = attrValues[attr.id]
      if (val) {
        parts.push(val.toUpperCase())
      } else {
        parts.push(`[${attr.abbreviation}]`)
      }
    })
    return parts.join(" ")
  }

  const filledCount = pdm
    ? pdm.attributes.filter((a) => attrValues[a.id] && attrValues[a.id].trim() !== "").length
    : 0
  const totalCount = pdm ? pdm.attributes.length : 0
  const progress = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0

  return (
    <Card className="border-border/60 shadow-sm sticky top-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Eye className="size-4 text-primary" />
          Preview da Requisicao
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Generated description */}
        <div className="rounded-lg bg-preview-bg p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 mb-1.5">
            Descricao Gerada
          </p>
          <code className="text-xs font-mono font-bold text-preview-foreground leading-relaxed block break-words">
            {generatePreview()}
          </code>
        </div>

        {/* Fill progress */}
        {pdm && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Preenchimento</span>
              <span className="font-semibold text-foreground">{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  progress === 100 ? "bg-success" : "bg-primary"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <Separator />

        {/* Summary details */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <Package className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Material:</span>
            <span className="font-medium text-foreground truncate">
              {pdm ? pdm.name : "—"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <FileText className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Codigo:</span>
            <span className="font-mono font-medium text-foreground">
              {pdm ? pdm.code : "—"}
            </span>
          </div>
          {quantity && (
            <div className="flex items-center gap-2 text-xs">
              <span className="size-3.5 shrink-0 text-center text-muted-foreground font-bold">#</span>
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
              <span className="size-3.5 shrink-0 text-center text-muted-foreground font-bold text-[10px]">C</span>
              <span className="text-muted-foreground">CC:</span>
              <span className="font-mono font-medium text-foreground">{costCenter}</span>
            </div>
          )}
        </div>

        {/* Urgency badge */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">Urgencia</span>
          <Badge
            variant="outline"
            className={cn("text-[10px]", urgencyLabels[urgency]?.className)}
          >
            {urgencyLabels[urgency]?.label}
          </Badge>
        </div>

        {/* Attribute values filled */}
        {pdm && filledCount > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Atributos Preenchidos
              </p>
              {pdm.attributes
                .filter((a) => attrValues[a.id] && attrValues[a.id].trim() !== "")
                .map((attr) => (
                  <div key={attr.id} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{attr.name}</span>
                    <span className="font-mono font-medium text-foreground">
                      {attrValues[attr.id]}
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
