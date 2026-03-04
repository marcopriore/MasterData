"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"
import {
  User,
  Mail,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Asterisk,
} from "lucide-react"

interface PhaseAdminProps {
  requesterName: string
  requesterEmail: string | null
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
    color: "bg-amber-50 text-amber-800 border-amber-400",
    ring: "ring-amber-200",
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
  requesterEmail,
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
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                Nome do Solicitante
                <Asterisk className="size-2.5 text-destructive" />
              </Label>
              <p className="mt-0.5 flex items-center gap-2 text-sm font-medium text-foreground">
                <User className="size-4 text-muted-foreground" />
                <span className="truncate">{requesterName || "—"}</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                E-mail
              </Label>
              <p className="mt-0.5 flex items-center gap-2 text-sm text-foreground">
                <Mail className="size-4 text-muted-foreground" />
                <span className="truncate">{requesterEmail || "—"}</span>
              </p>
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
