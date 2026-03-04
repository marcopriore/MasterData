"use client"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, ChevronDown, ChevronUp } from "lucide-react"
import type { Attribute } from "./attributes-table"

interface PdmDetailsProps {
  name: string
  code: string
  isActive: boolean
  onNameChange: (value: string) => void
  onCodeChange: (value: string) => void
  onActiveChange: (value: boolean) => void
  selectedPdmId?: number | null
  isOpen?: boolean
  onToggle?: () => void
  readOnly?: boolean
  attributes?: Attribute[]
  materialsCount?: number
}

export function PdmDetails({
  name,
  code,
  isActive,
  onNameChange,
  onCodeChange,
  onActiveChange,
  selectedPdmId = null,
  isOpen = true,
  onToggle,
  readOnly = false,
  attributes = [],
  materialsCount = 0,
}: PdmDetailsProps) {
  const isActivePdm = selectedPdmId != null
  const countLabel =
    materialsCount === 0
      ? "Sem materiais"
      : materialsCount === 1
        ? "1 material"
        : `${materialsCount} materiais`
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl pt-0 dark:border-zinc-700/50",
        isActivePdm && "border-l-4 border-l-[#C69A46]"
      )}
    >
      <CardHeader className="relative flex h-8 min-h-8 items-center justify-between bg-[#192D50] py-1 px-6 rounded-t-2xl">
        <CardTitle className="flex items-center gap-2 text-base font-semibold !text-white">
          <FileText className="size-4 shrink-0 !text-white" />
          Detalhes do PDM
        </CardTitle>
        {onToggle && (
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center text-[#C69A46] leading-none transition-none"
            onClick={onToggle}
            aria-label={isOpen ? "Recolher seção" : "Expandir seção"}
          >
            {isOpen ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
          </button>
        )}
      </CardHeader>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <CardContent>
        <div className="grid gap-5 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="pdm-name" className="text-sm font-medium text-foreground">
              Nome do PDM
            </Label>
            <Input
              id="pdm-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value.toUpperCase())}
              placeholder="Ex: Bearing Ball Radial"
              disabled={readOnly}
              className={cn("bg-background uppercase", readOnly && "cursor-not-allowed bg-slate-100 dark:bg-slate-800/50")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pdm-code" className="text-sm font-medium text-foreground">
              Codigo Interno
            </Label>
            <Input
              id="pdm-code"
              type="text"
              value={code}
              onChange={(e) => onCodeChange(e.target.value.toUpperCase().slice(0, 7))}
              placeholder="Ex: MEC001"
              maxLength={7}
              disabled={readOnly}
              className={cn("font-mono bg-background uppercase", readOnly && "cursor-not-allowed bg-slate-100 dark:bg-slate-800/50")}
            />
            <p className="text-xs text-muted-foreground">
              Máximo 7 caracteres
            </p>
          </div>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <span
              className={cn(
                "inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium border",
                materialsCount === 0
                  ? "bg-gray-100 text-gray-600 border-gray-200"
                  : "bg-blue-100 text-blue-800 border-blue-200"
              )}
            >
              {countLabel}
            </span>
            <div className={cn("flex items-center gap-2", readOnly && "opacity-70")}>
              <Switch
                id="pdm-active"
                checked={isActive}
                onCheckedChange={onActiveChange}
                disabled={readOnly}
              />
              <Label htmlFor="pdm-active" className="text-sm font-medium text-foreground cursor-pointer">
                {isActive ? "Ativo" : "Inativo"}
              </Label>
            </div>
          </div>
        </div>
          </CardContent>
        </div>
      </div>
    </Card>
  )
}
