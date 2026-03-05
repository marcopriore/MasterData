"use client"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  Inbox,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Timer,
} from "lucide-react"
import type { MaterialRequest } from "./request-card"

export type GovernanceStats = {
  total: number
  em_andamento: number
  atrasadas: number
  taxa_rejeicao: number
  tempo_medio_ciclo: number
  sla_por_etapa: Record<string, number>
}

interface StatsSummaryProps {
  requests: MaterialRequest[]
  variant?: "default" | "governance"
  governanceStats?: GovernanceStats | null
  governanceStatsLoading?: boolean
}

export function StatsSummary({ requests, variant = "default", governanceStats, governanceStatsLoading }: StatsSummaryProps) {
  if (variant === "governance") {
    const stats = governanceStats
      ? [
          { label: "EM ANDAMENTO", value: governanceStats.em_andamento, icon: <Clock className="size-5" />, color: "text-blue-300", bgColor: "bg-blue-500/25", labelColor: "text-blue-300" },
          { label: "ATRASADAS", value: governanceStats.atrasadas, icon: <AlertTriangle className="size-5" />, color: governanceStats.atrasadas > 0 ? "text-red-300" : "text-green-300", bgColor: governanceStats.atrasadas > 0 ? "bg-red-500/25" : "bg-green-500/25", labelColor: governanceStats.atrasadas > 0 ? "text-red-300" : "text-green-300" },
          { label: "TAXA DE REJEIÇÃO", value: `${governanceStats.taxa_rejeicao}%`, icon: <XCircle className="size-5" />, color: "text-orange-300", bgColor: "bg-orange-500/25", labelColor: "text-orange-300" },
          { label: "TEMPO MÉDIO DE CICLO", value: `${governanceStats.tempo_medio_ciclo} dias`, icon: <Timer className="size-5" />, color: "text-purple-300", bgColor: "bg-purple-500/25", labelColor: "text-purple-300" },
        ]
      : []
    if (governanceStatsLoading || stats.length === 0) {
      return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-[#192D50]/30 bg-[#0F1C38] p-4 shadow-sm dark:border-zinc-400/40 dark:bg-[#0F1C38] animate-pulse">
              <div className="size-12 shrink-0 rounded-full bg-white/10" />
              <div className="flex-1">
                <div className="h-8 w-12 rounded bg-white/10" />
                <div className="mt-2 h-4 w-24 rounded bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      )
    }
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-4 rounded-xl border border-[#192D50]/30 bg-[#0F1C38] p-4 shadow-sm dark:border-zinc-400/40 dark:bg-[#0F1C38]"
          >
            <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-full", stat.bgColor, stat.color)}>
              {stat.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-3xl font-bold tracking-tight text-white leading-none">{stat.value}</p>
              <p className={cn("mt-1.5 text-xs font-medium uppercase tracking-wider truncate", stat.labelColor)}>{stat.label}</p>
            </div>
          </div>
        ))}
      </div>
    )
  }

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
