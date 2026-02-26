"use client"

import { useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Search,
  Cog,
  HardHat,
  Briefcase,
  Zap,
  CircleDot,
  Wrench,
  Cable,
  ShieldCheck,
  Glasses,
  Footprints,
  ChevronRight,
  ArrowLeft,
} from "lucide-react"
import { Button } from "@/components/ui/button"

export interface PDMTemplate {
  id: string
  name: string
  code: string
  category: string
  parentCategory: string
  attributes: PDMAttribute[]
}

export interface PDMAttribute {
  id: string
  name: string
  dataType: "numeric" | "text" | "lov"
  isRequired: boolean
  abbreviation: string
  unit?: string
  allowedValues?: string[]
}

interface CategoryCard {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  color: string
  templates: PDMTemplate[]
}

const pdmDatabase: CategoryCard[] = [
  {
    id: "mechanical",
    label: "Mechanical",
    description: "Rolamentos, fixadores, vedacoes e componentes mecanicos",
    icon: <Cog className="size-7" />,
    color: "text-primary",
    templates: [
      {
        id: "mec-brg-001",
        name: "Bearing Ball Radial",
        code: "MEC-BRG-001",
        category: "Bearings",
        parentCategory: "Mechanical",
        attributes: [
          { id: "a1", name: "Inner Diameter", dataType: "numeric", isRequired: true, abbreviation: "ID", unit: "mm" },
          { id: "a2", name: "Outer Diameter", dataType: "numeric", isRequired: true, abbreviation: "OD", unit: "mm" },
          { id: "a3", name: "Width", dataType: "numeric", isRequired: true, abbreviation: "W", unit: "mm" },
          { id: "a4", name: "Material", dataType: "lov", isRequired: true, abbreviation: "MAT", allowedValues: ["Stainless Steel", "Chrome Steel", "Ceramic", "Carbon Steel"] },
          { id: "a5", name: "Seal Type", dataType: "lov", isRequired: false, abbreviation: "SEAL", allowedValues: ["Open", "Shielded", "Sealed", "Contact Seal"] },
        ],
      },
      {
        id: "mec-brg-002",
        name: "Bearing Roller Tapered",
        code: "MEC-BRG-002",
        category: "Bearings",
        parentCategory: "Mechanical",
        attributes: [
          { id: "a1", name: "Bore Diameter", dataType: "numeric", isRequired: true, abbreviation: "BD", unit: "mm" },
          { id: "a2", name: "Outer Diameter", dataType: "numeric", isRequired: true, abbreviation: "OD", unit: "mm" },
          { id: "a3", name: "Material", dataType: "lov", isRequired: true, abbreviation: "MAT", allowedValues: ["Chrome Steel", "Case Hardened Steel"] },
        ],
      },
      {
        id: "mec-fst-001",
        name: "Bolt Hex Head",
        code: "MEC-FST-001",
        category: "Fasteners",
        parentCategory: "Mechanical",
        attributes: [
          { id: "a1", name: "Diameter", dataType: "lov", isRequired: true, abbreviation: "DIA", allowedValues: ["M6", "M8", "M10", "M12", "M16", "M20"] },
          { id: "a2", name: "Length", dataType: "numeric", isRequired: true, abbreviation: "L", unit: "mm" },
          { id: "a3", name: "Grade", dataType: "lov", isRequired: true, abbreviation: "GR", allowedValues: ["8.8", "10.9", "12.9", "A2-70", "A4-80"] },
          { id: "a4", name: "Finish", dataType: "lov", isRequired: false, abbreviation: "FIN", allowedValues: ["Zinc Plated", "Hot Dip Galvanized", "Plain", "Black Oxide"] },
        ],
      },
    ],
  },
  {
    id: "electrical",
    label: "Electrical",
    description: "Cabos, conectores, componentes eletricos e instrumentacao",
    icon: <Zap className="size-7" />,
    color: "text-warning",
    templates: [
      {
        id: "elc-cab-001",
        name: "Cable Power Low Voltage",
        code: "ELC-CAB-001",
        category: "Cables",
        parentCategory: "Electrical",
        attributes: [
          { id: "a1", name: "Conductor Size", dataType: "lov", isRequired: true, abbreviation: "AWG", allowedValues: ["14 AWG", "12 AWG", "10 AWG", "8 AWG", "6 AWG"] },
          { id: "a2", name: "Number of Conductors", dataType: "numeric", isRequired: true, abbreviation: "COND" },
          { id: "a3", name: "Insulation", dataType: "lov", isRequired: true, abbreviation: "INS", allowedValues: ["PVC", "XLPE", "EPR", "Silicone"] },
          { id: "a4", name: "Voltage Rating", dataType: "lov", isRequired: true, abbreviation: "VOLT", allowedValues: ["300V", "600V", "1000V"] },
        ],
      },
    ],
  },
  {
    id: "ppe",
    label: "PPE",
    description: "Equipamentos de protecao individual para seguranca",
    icon: <HardHat className="size-7" />,
    color: "text-success",
    templates: [
      {
        id: "ppe-hd-001",
        name: "Safety Helmet Industrial",
        code: "PPE-HD-001",
        category: "Head Protection",
        parentCategory: "PPE",
        attributes: [
          { id: "a1", name: "Type", dataType: "lov", isRequired: true, abbreviation: "TYP", allowedValues: ["Type I", "Type II"] },
          { id: "a2", name: "Class", dataType: "lov", isRequired: true, abbreviation: "CLS", allowedValues: ["Class E", "Class G", "Class C"] },
          { id: "a3", name: "Color", dataType: "lov", isRequired: false, abbreviation: "CLR", allowedValues: ["White", "Yellow", "Blue", "Red", "Green", "Orange"] },
        ],
      },
      {
        id: "ppe-eye-001",
        name: "Safety Glasses Standard",
        code: "PPE-EYE-001",
        category: "Eye Protection",
        parentCategory: "PPE",
        attributes: [
          { id: "a1", name: "Lens Type", dataType: "lov", isRequired: true, abbreviation: "LENS", allowedValues: ["Clear", "Tinted", "Photochromic", "Polarized"] },
          { id: "a2", name: "Frame Style", dataType: "lov", isRequired: false, abbreviation: "FRM", allowedValues: ["Wraparound", "Standard", "Over-Glasses"] },
          { id: "a3", name: "Anti-Fog", dataType: "lov", isRequired: false, abbreviation: "AF", allowedValues: ["Yes", "No"] },
        ],
      },
    ],
  },
  {
    id: "office",
    label: "Office",
    description: "Material de escritorio e suprimentos administrativos",
    icon: <Briefcase className="size-7" />,
    color: "text-muted-foreground",
    templates: [
      {
        id: "off-ppr-001",
        name: "Paper A4 Standard",
        code: "OFF-PPR-001",
        category: "Paper",
        parentCategory: "Office",
        attributes: [
          { id: "a1", name: "Weight", dataType: "lov", isRequired: true, abbreviation: "WT", allowedValues: ["75g/m2", "90g/m2", "120g/m2"] },
          { id: "a2", name: "Color", dataType: "lov", isRequired: false, abbreviation: "CLR", allowedValues: ["White", "Chamois", "Blue"] },
        ],
      },
    ],
  },
]

const subcategoryIcons: Record<string, React.ReactNode> = {
  Bearings: <CircleDot className="size-4" />,
  Fasteners: <Wrench className="size-4" />,
  Cables: <Cable className="size-4" />,
  "Head Protection": <ShieldCheck className="size-4" />,
  "Eye Protection": <Glasses className="size-4" />,
  "Foot Protection": <Footprints className="size-4" />,
}

interface PhaseCategoryProps {
  selectedPDM: PDMTemplate | null
  onSelectPDM: (pdm: PDMTemplate) => void
}

export function PhaseCategory({ selectedPDM, onSelectPDM }: PhaseCategoryProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  const allTemplates = useMemo(
    () => pdmDatabase.flatMap((cat) => cat.templates),
    []
  )

  const filteredTemplates = useMemo(() => {
    if (!searchTerm.trim()) return []
    const term = searchTerm.toLowerCase()
    return allTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(term) ||
        t.code.toLowerCase().includes(term) ||
        t.category.toLowerCase().includes(term) ||
        t.parentCategory.toLowerCase().includes(term)
    )
  }, [searchTerm, allTemplates])

  const isSearching = searchTerm.trim().length > 0

  if (expandedCategory) {
    const category = pdmDatabase.find((c) => c.id === expandedCategory)
    if (!category) return null

    const groups: Record<string, PDMTemplate[]> = {}
    category.templates.forEach((t) => {
      if (!groups[t.category]) groups[t.category] = []
      groups[t.category].push(t)
    })

    return (
      <div className="space-y-5">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
          onClick={() => setExpandedCategory(null)}
        >
          <ArrowLeft className="size-3.5" />
          Voltar para categorias
        </Button>

        <div className="flex items-center gap-3">
          <div className={cn("flex size-10 items-center justify-center rounded-xl bg-accent", category.color)}>
            {category.icon}
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">{category.label}</h3>
            <p className="text-sm text-muted-foreground">{category.description}</p>
          </div>
        </div>

        {Object.entries(groups).map(([subcategory, templates]) => (
          <div key={subcategory} className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              {subcategoryIcons[subcategory] || <CircleDot className="size-4" />}
              {subcategory}
            </div>
            <div className="grid gap-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => onSelectPDM(template)}
                  className={cn(
                    "flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-left transition-all hover:border-primary/30 hover:bg-accent/40",
                    selectedPDM?.id === template.id &&
                      "border-primary bg-primary/5 ring-1 ring-primary/20"
                  )}
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{template.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{template.code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {template.attributes.length} atributos
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground/40" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-foreground">Selecione o Tipo de Material</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Busque por nome ou codigo, ou navegue pelas categorias abaixo.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar material... (ex: bearing, bolt, cable)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-11 bg-card"
        />
      </div>

      {isSearching ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {filteredTemplates.length} resultado{filteredTemplates.length !== 1 ? "s" : ""} encontrado{filteredTemplates.length !== 1 ? "s" : ""}
          </p>
          {filteredTemplates.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 py-10 text-center">
              <Search className="mx-auto size-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhum material encontrado para &quot;{searchTerm}&quot;
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => onSelectPDM(template)}
                  className={cn(
                    "flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-left transition-all hover:border-primary/30 hover:bg-accent/40",
                    selectedPDM?.id === template.id &&
                      "border-primary bg-primary/5 ring-1 ring-primary/20"
                  )}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{template.name}</p>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                        {template.parentCategory}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{template.code}</p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground/40 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pdmDatabase.map((category) => (
            <button
              key={category.id}
              onClick={() => setExpandedCategory(category.id)}
              className="group flex items-start gap-4 rounded-xl border bg-card p-5 text-left transition-all hover:border-primary/30 hover:shadow-md"
            >
              <div
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent transition-colors group-hover:bg-primary/10",
                  category.color
                )}
              >
                {category.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-foreground">{category.label}</h3>
                  <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                </div>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {category.description}
                </p>
                <p className="text-xs text-primary font-medium mt-2">
                  {category.templates.length} template{category.templates.length !== 1 ? "s" : ""} disponivel(is)
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export { pdmDatabase }
