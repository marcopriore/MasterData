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
import { ScrollArea } from "@/components/ui/scroll-area"
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
}

export function AttributesTable({
  attributes,
  onAttributesChange,
  onOpenValueDictionary,
  selectedPdmId = null,
  isOpen = true,
  onToggle,
}: AttributesTableProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [showBottomFade, setShowBottomFade] = useState(false)
  const scrollViewportRef = useRef<HTMLDivElement>(null)

  const checkScrollFade = useCallback(() => {
    const viewport = scrollViewportRef.current
    if (!viewport) return
    const { scrollTop, scrollHeight, clientHeight } = viewport
    const hasOverflow = scrollHeight > clientHeight
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 2
    setShowBottomFade(hasOverflow && !isAtBottom)
  }, [])

  const handleViewportScroll = useCallback(() => {
    checkScrollFade()
  }, [checkScrollFade])

  useEffect(() => {
    checkScrollFade()
    const viewport = scrollViewportRef.current
    if (!viewport) return
    const ro = new ResizeObserver(checkScrollFade)
    ro.observe(viewport)
    return () => ro.disconnect()
  }, [checkScrollFade, attributes.length])

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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const viewport = scrollViewportRef.current
        if (viewport) {
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })
        }
      })
    })
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
        "flex min-h-0 flex-col gap-0 overflow-hidden rounded-2xl border pt-0 dark:border-zinc-700/50",
        isOpen ? "h-full" : "h-auto shrink-0",
        isActivePdm && "border-l-4 border-l-[#C69A46]"
      )}
    >
      <CardHeader className="relative flex h-8 min-h-8 shrink-0 flex-row items-center justify-between bg-[#192D50] py-1 px-6 rounded-t-2xl">
        <CardTitle className="flex items-center gap-2 text-base font-semibold !text-white">
          <ListFilter className="size-4 shrink-0 !text-white" />
          Atributos Tecnicos
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button onClick={addAttribute} size="sm" variant="outline" className="h-7 gap-1.5 border-white/40 bg-transparent px-3 !text-white transition-none hover:bg-transparent hover:!text-white">
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
          "grid min-h-0 flex-1 transition-[grid-template-rows] duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
      <CardContent className="relative min-h-0 overflow-hidden p-0">
        <ScrollArea
          viewportRef={scrollViewportRef}
          onViewportScroll={handleViewportScroll}
          className="h-[calc(100vh-450px)] max-h-[500px] min-h-[200px]"
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-10 border-b border-[#334155]/80 bg-[#334155] font-bold transition-none hover:bg-[#334155] [&>th]:!text-white [&>th]:transition-none">
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
                attributes.map((attr, index) => (
                  <TableRow
                    key={attr.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "transition-colors hover:bg-[#F0F0F0] dark:hover:bg-[#0F1C38]/25",
                      dragOverIndex === index && "bg-accent",
                      draggedIndex === index && "opacity-50"
                    )}
                  >
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <GripVertical className="size-3.5 cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing" />
                        <span className="text-xs font-medium text-muted-foreground">
                          {attr.order}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={attr.name}
                        onChange={(e) =>
                          updateAttribute(attr.id, "name", e.target.value)
                        }
                        placeholder="Ex: Inner Diameter"
                        className="h-8 text-sm bg-background"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={attr.dataType}
                        onValueChange={(v) =>
                          updateAttribute(attr.id, "dataType", v)
                        }
                      >
                        <SelectTrigger className="h-8 text-sm w-full">
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
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={attr.abbreviation}
                        onChange={(e) =>
                          updateAttribute(attr.id, "abbreviation", e.target.value)
                        }
                        placeholder="Ex: ID"
                        className="h-8 text-sm font-mono bg-background"
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
        </ScrollArea>
        {showBottomFade && (
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-12 rounded-b-2xl bg-gradient-to-t from-card to-transparent"
          />
        )}
      </CardContent>
        </div>
      </div>
    </Card>
  )
}
