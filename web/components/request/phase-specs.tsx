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
import { Clipboard, Hash, Settings2, Info, Asterisk } from "lucide-react"
import type { PDMTemplate } from "./phase-category"

interface PhaseSpecsProps {
  pdm: PDMTemplate
  values: Record<string, string>
  onChange: (attrId: string, value: string) => void
  quantity: string
  onQuantityChange: (v: string) => void
  description: string
  onDescriptionChange: (v: string) => void
}

export function PhaseSpecs({
  pdm,
  values,
  onChange,
  quantity,
  onQuantityChange,
  description,
  onDescriptionChange,
}: PhaseSpecsProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Especificacoes Tecnicas</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Preencha os campos obrigatorios para{" "}
          <span className="font-semibold text-foreground">{pdm.name}</span>.
        </p>
      </div>

      {/* General info */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clipboard className="size-4 text-primary" />
            Informacoes Gerais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quantity" className="text-sm font-medium flex items-center gap-1">
                <Hash className="size-3.5 text-muted-foreground" />
                Quantidade
                <Asterisk className="size-2.5 text-destructive" />
              </Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => onQuantityChange(e.target.value)}
                placeholder="Ex: 10"
                className="h-10 uppercase bg-card"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pdm-code" className="text-sm font-medium flex items-center gap-1">
                <Settings2 className="size-3.5 text-muted-foreground" />
                PDM Selecionado
              </Label>
              <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3">
                <span className="text-sm font-mono text-muted-foreground">{pdm.code}</span>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {pdm.category}
                </Badge>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description-note" className="text-sm font-medium">
              Observacao / Descricao Complementar
            </Label>
            <Input
              id="description-note"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value.toUpperCase())}
              placeholder="Informacoes adicionais relevantes para esta requisicao..."
              className="h-10 uppercase bg-card"
            />
          </div>
        </CardContent>
      </Card>

      {/* Technical Attributes */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Settings2 className="size-4 text-primary" />
            Atributos Tecnicos
            <Badge variant="outline" className="ml-auto text-[10px] font-normal">
              {pdm.attributes.filter((a) => a.isRequired).length} obrigatorio(s)
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {pdm.attributes.map((attr, index) => (
              <div key={attr.id}>
                {index > 0 && <Separator className="my-4" />}
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[1fr_1.5fr] items-start">
                  <div className="flex items-center gap-2 sm:pt-2.5">
                    <Label
                      htmlFor={`attr-${attr.id}`}
                      className="text-sm font-medium flex items-center gap-1.5"
                    >
                      {attr.name}
                      {attr.isRequired && (
                        <Asterisk className="size-2.5 text-destructive" />
                      )}
                    </Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="size-3.5 text-muted-foreground/50" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[200px]">
                          <p className="text-xs">
                            Tipo: {attr.dataType === "numeric" ? "Numerico" : attr.dataType === "text" ? "Texto" : "Lista"}
                            {attr.unit ? ` (${attr.unit})` : ""}
                            <br />
                            Abreviacao: <span className="font-mono font-bold">{attr.abbreviation}</span>
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <div>
                    {attr.dataType === "lov" && attr.allowedValues ? (
                      <Select
                        value={values[attr.id] || ""}
                        onValueChange={(v) => onChange(attr.id, v)}
                      >
                        <SelectTrigger
                          id={`attr-${attr.id}`}
                          className="h-10 bg-card w-full"
                        >
                          <SelectValue placeholder={`Selecione ${attr.name.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {attr.allowedValues.map((val) => (
                            <SelectItem key={val} value={val}>
                              {val}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={`attr-${attr.id}`}
                        type={attr.dataType === "numeric" ? "number" : "text"}
                        value={values[attr.id] || ""}
                        onChange={(e) => onChange(attr.id, attr.dataType === "numeric" ? e.target.value : e.target.value.toUpperCase())}
                        placeholder={
                          attr.dataType === "numeric"
                            ? `Valor em ${attr.unit || "numerico"}`
                            : `Informe ${attr.name.toLowerCase()}`
                        }
                        className="h-10 uppercase bg-card"
                      />
                    )}
                    {attr.unit && attr.dataType === "numeric" && (
                      <p className="text-[11px] text-muted-foreground mt-1 ml-0.5">
                        Unidade: {attr.unit}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
