"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import {
  User,
  Building2,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Asterisk,
} from "lucide-react"

interface PhaseAdminProps {
  requesterName: string
  onRequesterNameChange: (v: string) => void
  costCenter: string
  onCostCenterChange: (v: string) => void
  urgency: "low" | "medium" | "high"
  onUrgencyChange: (v: "low" | "medium" | "high") => void
}

const urgencyOptions = [
  {
    value: "low" as const,
    label: "Baixa",
    description: "Prazo padrao de entrega",
    icon: <ArrowDown className="size-4" />,
    color: "text-success border-success/30 bg-success/5",
    ring: "ring-success/20",
  },
  {
    value: "medium" as const,
    label: "Media",
    description: "Necessidade em ate 15 dias",
    icon: <ArrowRight className="size-4" />,
    color: "text-warning border-warning/30 bg-warning/5",
    ring: "ring-warning/20",
  },
  {
    value: "high" as const,
    label: "Alta",
    description: "Urgente - parada de producao",
    icon: <ArrowUp className="size-4" />,
    color: "text-destructive border-destructive/30 bg-destructive/5",
    ring: "ring-destructive/20",
  },
]

export function PhaseAdmin({
  requesterName,
  onRequesterNameChange,
  costCenter,
  onCostCenterChange,
  urgency,
  onUrgencyChange,
}: PhaseAdminProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Informacoes Administrativas</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Preencha os dados de identificacao e prioridade da requisicao.
        </p>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <User className="size-4 text-primary" />
            Dados do Solicitante
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="requester-name" className="text-sm font-medium flex items-center gap-1">
                Nome do Solicitante
                <Asterisk className="size-2.5 text-destructive" />
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  id="requester-name"
                  value={requesterName}
                  onChange={(e) => onRequesterNameChange(e.target.value.toUpperCase())}
                  placeholder="Nome completo"
                  className="h-10 pl-10 uppercase bg-card"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost-center" className="text-sm font-medium flex items-center gap-1">
                Centro de Custo
                <Asterisk className="size-2.5 text-destructive" />
              </Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  id="cost-center"
                  value={costCenter}
                  onChange={(e) => onCostCenterChange(e.target.value.toUpperCase())}
                  placeholder="Ex: CC-4500-MNT"
                  className="h-10 pl-10 uppercase bg-card font-mono"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="size-4 text-primary" />
            Nivel de Urgencia
            <Asterisk className="size-2.5 text-destructive" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={urgency}
            onValueChange={(v) => onUrgencyChange(v as "low" | "medium" | "high")}
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            {urgencyOptions.map((option) => {
              const isSelected = urgency === option.value
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all hover:shadow-sm",
                    isSelected
                      ? cn(option.color, "ring-1", option.ring)
                      : "border-border bg-card hover:border-primary/20"
                  )}
                >
                  <RadioGroupItem value={option.value} className="mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("shrink-0", isSelected ? "" : "text-muted-foreground")}>
                        {option.icon}
                      </span>
                      <span className="text-sm font-semibold">{option.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {option.description}
                    </p>
                  </div>
                </label>
              )
            })}
          </RadioGroup>
        </CardContent>
      </Card>
    </div>
  )
}
