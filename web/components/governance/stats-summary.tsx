"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  Inbox,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from "lucide-react"
import type { MaterialRequest } from "./request-card"

interface StatsSummaryProps {
  requests: MaterialRequest[]
}

export function StatsSummary({ requests }: StatsSummaryProps) {
  const total = requests.length
  const pending = requests.filter(
    (r) => r.status === "pending_technical" || r.status === "pending_fiscal" || r.status === "pending_mrp"
  ).length
  const urgent = requests.filter((r) => r.urgency === "high" && r.status !== "completed").length
  const completed = requests.filter((r) => r.status === "completed").length

  const stats = [
    {
      label: "Total de Requisicoes",
      value: total,
      icon: <Inbox className="size-5" />,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Pendentes",
      value: pending,
      icon: <Clock className="size-5" />,
      color: "text-warning-foreground",
      bgColor: "bg-warning/10",
    },
    {
      label: "Urgencia Alta",
      value: urgent,
      icon: <AlertTriangle className="size-5" />,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      label: "Concluidas",
      value: completed,
      icon: <CheckCircle2 className="size-5" />,
      color: "text-success",
      bgColor: "bg-success/10",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="border-border/60">
          <CardContent className="flex items-center gap-3 p-4">
            <div className={cn("flex size-10 items-center justify-center rounded-xl shrink-0", stat.bgColor, stat.color)}>
              {stat.icon}
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-foreground leading-none">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1 truncate">{stat.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
