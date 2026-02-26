"use client"

import { useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, BookOpen } from "lucide-react"
import type { Attribute } from "./attributes-table"

interface ValueDictionaryProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  attribute: Attribute | null
  onUpdateValues: (
    attrId: string,
    values: { value: string; abbreviation: string }[]
  ) => void
}

export function ValueDictionary({
  open,
  onOpenChange,
  attribute,
  onUpdateValues,
}: ValueDictionaryProps) {
  const [newValue, setNewValue] = useState("")
  const [newAbbr, setNewAbbr] = useState("")

  if (!attribute) return null

  const values = attribute.allowedValues || []

  const addValue = () => {
    if (!newValue.trim()) return
    const updated = [
      ...values,
      { value: newValue.trim(), abbreviation: newAbbr.trim() || newValue.trim().substring(0, 3).toUpperCase() },
    ]
    onUpdateValues(attribute.id, updated)
    setNewValue("")
    setNewAbbr("")
  }

  const removeValue = (index: number) => {
    const updated = values.filter((_, i) => i !== index)
    onUpdateValues(attribute.id, updated)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addValue()
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full bg-white dark:bg-[#0F1C38] sm:max-w-md" side="right">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <BookOpen className="size-5 text-primary" />
            Dicionario de Valores
          </SheetTitle>
          <SheetDescription>
            Gerencie os valores permitidos para{" "}
            <span className="font-semibold text-foreground">{attribute.name || "este atributo"}</span>
          </SheetDescription>
        </SheetHeader>

        <Separator />

        <div className="flex flex-col gap-4 py-4 px-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="mb-3 text-sm font-medium text-foreground">Adicionar Novo Valor</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Valor</Label>
                <Input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ex: Stainless Steel"
                  className="h-8 text-sm bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Abreviacao</Label>
                <Input
                  value={newAbbr}
                  onChange={(e) => setNewAbbr(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ex: SS"
                  className="h-8 text-sm font-mono bg-background"
                />
              </div>
              <Button
                onClick={addValue}
                size="sm"
                className="w-full gap-1.5"
                disabled={!newValue.trim()}
              >
                <Plus className="size-3.5" />
                Adicionar Valor
              </Button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-foreground">
                Valores Permitidos
              </p>
              <Badge variant="secondary" className="text-xs">
                {values.length} {values.length === 1 ? "valor" : "valores"}
              </Badge>
            </div>

            <ScrollArea className="h-[calc(100vh-480px)]">
              {values.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8">
                  <BookOpen className="mb-2 size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum valor adicionado
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {values.map((v, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate">
                          {v.value}
                        </span>
                        <Badge variant="outline" className="font-mono text-xs shrink-0">
                          {v.abbreviation}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={() => removeValue(i)}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
