"use client"

import { useState, useEffect } from "react"
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
import { Plus, Trash2, BookOpen, Pencil, Check, X } from "lucide-react"
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
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const [editAbbrev, setEditAbbrev] = useState("")

  useEffect(() => {
    if (!open || !attribute) {
      setEditingIndex(null)
    }
  }, [open, attribute?.id])

  if (!attribute) return null

  const values = attribute.allowedValues || []

  const startEdit = (index: number, value: string, abbrev: string) => {
    setEditingIndex(index)
    setEditValue(value)
    setEditAbbrev(abbrev)
  }

  const cancelEdit = () => {
    setEditingIndex(null)
  }

  const confirmEdit = (index: number) => {
    if (!editValue.trim()) return
    const updated = [...values]
    updated[index] = {
      value: editValue.trim(),
      abbreviation: editAbbrev.trim() || editValue.trim().substring(0, 3).toUpperCase(),
    }
    onUpdateValues(attribute.id, updated)
    setEditingIndex(null)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault()
      confirmEdit(index)
    }
    if (e.key === "Escape") {
      cancelEdit()
    }
  }

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
                  onChange={(e) => setNewValue(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  placeholder="Ex: Stainless Steel"
                  className="h-8 text-sm bg-background uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Abreviacao</Label>
                <Input
                  value={newAbbr}
                  onChange={(e) => setNewAbbr(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  placeholder="Ex: SS"
                  className="h-8 text-sm font-mono bg-background uppercase"
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
                  {values.map((v, i) => {
                    const item = typeof v === "object" && v !== null && "value" in v
                      ? (v as { value: string; abbreviation?: string })
                      : { value: String(v), abbreviation: "" }
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-900/50 px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/50"
                      >
                        {editingIndex === i ? (
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <input
                              className="flex-1 min-w-0 rounded border border-slate-300 dark:border-zinc-500 px-2 py-1 text-sm bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-zinc-500"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value.toUpperCase())}
                              onKeyDown={(e) => handleEditKeyDown(e, i)}
                              placeholder="Valor"
                              autoFocus
                            />
                            <input
                              className="w-20 rounded border border-slate-300 dark:border-zinc-500 px-2 py-1 text-sm bg-white dark:bg-zinc-900 text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-slate-400 dark:focus:ring-zinc-500 font-mono uppercase"
                              value={editAbbrev}
                              onChange={(e) => setEditAbbrev(e.target.value.toUpperCase())}
                              onKeyDown={(e) => handleEditKeyDown(e, i)}
                              placeholder="Abrev."
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 shrink-0 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                              onClick={() => confirmEdit(i)}
                              title="Confirmar"
                            >
                              <Check className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 shrink-0 text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200"
                              onClick={cancelEdit}
                              title="Cancelar"
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span className="text-sm font-medium uppercase text-slate-800 dark:text-zinc-100 truncate">
                                {item.value}
                              </span>
                              {item.abbreviation && (
                                <span className="text-xs text-slate-500 dark:text-zinc-400 shrink-0">= {item.abbreviation}</span>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0 text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200"
                                onClick={() => startEdit(i, item.value, item.abbreviation || "")}
                                title="Editar"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 shrink-0"
                              onClick={() => removeValue(i)}
                            >
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
