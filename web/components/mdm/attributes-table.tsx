"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  GripVertical,
  Plus,
  Trash2,
  ListFilter,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

export interface Attribute {
  id: string
  order: number
  name: string
  dataType: "numeric" | "text" | "lov"
  isRequired: boolean
  includeInDescription: boolean
  abbreviation: string
  allowedValues?: { value: string; abbreviation: string }[]
}

interface AttributesTableProps {
  attributes: Attribute[]
  onAttributesChange: (attrs: Attribute[]) => void
  onOpenValueDictionary: (attrId: string) => void
  selectedPdmId?: number | null
  isOpen?: boolean
  onToggle?: () => void
  readOnly?: boolean
}

export function AttributesTable({
  attributes,
  onAttributesChange,
  onOpenValueDictionary,
  selectedPdmId = null,
  isOpen = true,
  onToggle,
  readOnly = false,
}: AttributesTableProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevAttributesLengthRef = useRef(attributes.length)

  useEffect(() => {
    if (attributes.length > prevAttributesLengthRef.current) {
      const container = scrollContainerRef.current
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    }
    prevAttributesLengthRef.current = attributes.length
  }, [attributes.length])

  const addAttribute = () => {
    const newAttr: Attribute = {
      id: `attr-${Date.now()}`,
      order: attributes.length + 1,
      name: "",
      dataType: "text",
      isRequired: false,
      includeInDescription: true,
      abbreviation: "",
      allowedValues: [],
    }
    onAttributesChange([...attributes, newAttr])
  }

  const removeAttribute = (id: string) => {
    const updated = attributes
      .filter((a) => a.id !== id)
      .map((a, i) => ({ ...a, order: i + 1 }))
    onAttributesChange(updated)
  }

  const updateAttribute = useCallback(
    (id: string, field: keyof Attribute, value: unknown) => {
      onAttributesChange(
        attributes.map((a) => (a.id === id ? { ...a, [field]: value } : a))
      )
    },
    [attributes, onAttributesChange]
  )

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }
    const updated = [...attributes]
    const [removed] = updated.splice(draggedIndex, 1)
    updated.splice(index, 0, removed)
    onAttributesChange(updated.map((a, i) => ({ ...a, order: i + 1 })))
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const dataTypeLabels: Record<string, string> = {
    numeric: "Numerico",
    text: "Texto",
    lov: "Lista de Valores",
  }

  const isActivePdm = selectedPdmId != null
  return (
    <Card
      className={cn(
        "flex flex-col gap-0 rounded-2xl border pt-0 dark:border-zinc-700/50",
        isOpen ? "flex-1 min-h-0" : "h-auto shrink-0",
        isActivePdm && "border-l-4 border-l-[#C69A46]"
      )}
    >
      <CardHeader className="relative flex h-8 min-h-8 shrink-0 flex-row items-center justify-between bg-[#192D50] py-1 px-6 rounded-t-2xl">
        <CardTitle className="flex items-center gap-2 text-base font-semibold !text-white">
          <ListFilter className="size-4 shrink-0 !text-white" />
          Atributos Tecnicos
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            onClick={addAttribute}
            size="sm"
            variant="outline"
            disabled={readOnly}
            className="h-7 gap-1.5 border-white/40 bg-transparent px-3 !text-white transition-none hover:bg-transparent hover:!text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="size-3.5" />
            Adicionar
          </Button>
          {onToggle && (
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center text-[#C69A46] transition-none leading-none"
              onClick={onToggle}
              aria-label={isOpen ? "Recolher seção" : "Expandir seção"}
            >
              {isOpen ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
            </button>
          )}
        </div>
      </CardHeader>
      <div
        className={cn(
          "grid min-h-0 transition-[grid-template-rows] duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-visible">
      <CardContent className="relative flex min-h-0 flex-1 flex-col p-0">
        <div
          ref={scrollContainerRef}
          className="attributes-scroll-container scrollbar-thin scrollbar-thumb-slate-300 flex max-h-[500px] min-h-0 flex-1 flex-col overflow-y-auto overflow-x-auto"
        >
          <div className="pb-4">
          <Table className="shrink-0">
              <TableHeader>
                <TableRow className="sticky top-0 z-10 border-b-2 border-slate-300/60 bg-[#334155] font-bold shadow-[0_2px_6px_rgba(0,0,0,0.08)] transition-none hover:bg-[#334155] [&>th]:bg-[#334155] [&>th]:!text-white [&>th]:transition-none">
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead className="min-w-[200px]">Nome da Caracteristica</TableHead>
                <TableHead className="w-[160px]">Tipo de Dado</TableHead>
                <TableHead className="w-[90px] text-center">Obrigatorio</TableHead>
                <TableHead className="w-[90px] text-center">Descricao</TableHead>
                <TableHead className="w-[140px]">Abreviacao</TableHead>
                <TableHead className="w-[80px] text-center">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attributes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    Nenhum atributo adicionado. Clique em &quot;Adicionar&quot; para comecar.
                  </TableCell>
                </TableRow>
              ) : (
                attributes.filter((a) => a?.id).map((attr, index) => (
                  <TableRow
                    key={attr.id}
                    draggable={!readOnly}
                    onDragStart={() => !readOnly && handleDragStart(index)}
                    onDragOver={(e) => !readOnly && handleDragOver(e, index)}
                    onDrop={() => !readOnly && handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "transition-colors hover:bg-[#F0F0F0] dark:hover:bg-[#0F1C38]/25",
                      dragOverIndex === index && "bg-accent",
                      draggedIndex === index && "opacity-50"
                    )}
                  >
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <GripVertical className={cn("size-3.5 text-muted-foreground/50", readOnly ? "cursor-default" : "cursor-grab hover:text-muted-foreground active:cursor-grabbing")} />
                        <span className="text-xs font-medium text-muted-foreground">
                          {attr.order}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={attr.name}
                        onChange={(e) =>
                          updateAttribute(attr.id, "name", e.target.value.toUpperCase())
                        }
                        placeholder="Ex: Inner Diameter"
                        disabled={readOnly}
                        className={cn("h-8 text-sm bg-background uppercase", readOnly && "cursor-not-allowed bg-slate-100 dark:bg-slate-800/50")}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={attr.dataType}
                        onValueChange={(v) =>
                          updateAttribute(attr.id, "dataType", v)
                        }
                        disabled={readOnly}
                      >
                        <SelectTrigger className={cn("h-8 text-sm w-full", readOnly && "cursor-not-allowed bg-slate-100 dark:bg-slate-800/50")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="numeric">{dataTypeLabels.numeric}</SelectItem>
                          <SelectItem value="text">{dataTypeLabels.text}</SelectItem>
                          <SelectItem value="lov">{dataTypeLabels.lov}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <Checkbox
                          checked={attr.isRequired}
                          onCheckedChange={(v) =>
                            updateAttribute(attr.id, "isRequired", v)
                          }
                          disabled={readOnly}
                          className={readOnly ? "opacity-70" : undefined}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <Checkbox
                          checked={attr.includeInDescription}
                          onCheckedChange={(v) =>
                            updateAttribute(attr.id, "includeInDescription", v)
                          }
                          disabled={readOnly}
                          className={readOnly ? "opacity-70" : undefined}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={attr.abbreviation}
                        onChange={(e) =>
                          updateAttribute(attr.id, "abbreviation", e.target.value.toUpperCase())
                        }
                        placeholder="Ex: ID"
                        disabled={readOnly}
                        className={cn("h-8 text-sm font-mono bg-background uppercase", readOnly && "cursor-not-allowed bg-slate-100 dark:bg-slate-800/50")}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <TooltipProvider>
                          {attr.dataType === "lov" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => onOpenValueDictionary(attr.id)}
                                  disabled={readOnly}
                                >
                                  <BookOpen className="size-3.5 text-primary" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Dicionario de Valores</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => removeAttribute(attr.id)}
                                disabled={readOnly}
                              >
                                <Trash2 className="size-3.5 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remover Atributo</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </div>
      </CardContent>
        </div>
      </div>
    </Card>
  )
}
