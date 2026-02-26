"use client"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, ChevronDown, ChevronUp } from "lucide-react"

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
}: PdmDetailsProps) {
  const isActivePdm = selectedPdmId != null
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
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Ex: Bearing Ball Radial"
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pdm-code" className="text-sm font-medium text-foreground">
              Codigo Interno
            </Label>
            <Input
              id="pdm-code"
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder="Ex: MEC-BRG-001"
              className="font-mono bg-background"
            />
          </div>
          <div className="flex items-end gap-3 pb-1">
            <div className="flex items-center gap-3">
              <Switch
                id="pdm-active"
                checked={isActive}
                onCheckedChange={onActiveChange}
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
