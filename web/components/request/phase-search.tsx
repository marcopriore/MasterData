'use client'

import { useState, useEffect } from 'react'
import { getMaterialById, getFieldDictionary, getPdms, getPdmById } from '@/lib/supabase-api'
import { formatAttrValue } from '@/lib/format-attr-value'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Search, Loader2 } from 'lucide-react'

type MaterialSearchItem = {
  id: number
  id_erp: string | null
  id_sistema?: string | null
  description: string
  status: string
  pdm_code: string | null
  pdm_name?: string | null
  material_group: string | null
  unit_of_measure: string | null
  ncm: string | null
  material_type: string | null
  gross_weight: number | null
  net_weight: number | null
  cfop: string | null
  origin: string | null
  purchase_group: string | null
  lead_time: number | null
  mrp_type: string | null
  min_stock: number | null
  max_stock: number | null
  valuation_class: string | null
  standard_price: number | null
  profit_center: string | null
  technical_attributes?: Record<string, string | { value: string; unit?: string }> | null
}

type FieldByView = Record<string, Array<{ field_name: string; field_label: string; display_order?: number }>>
type PdmAttribute = { id?: string; name?: string; order?: number }

const STATUS_BADGE: Record<string, string> = {
  Ativo: 'bg-green-100 text-green-800 border border-green-300',
  Bloqueado: 'bg-red-100 text-red-800 border border-red-300',
  Obsoleto: 'bg-gray-200 text-gray-700 border border-gray-400',
}

function formatNumber(v: number | null): string {
  if (v == null) return '—'
  return String(v)
}

function formatCurrency(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function Row({ label, value }: { label: string; value: string | number | null }) {
  const s = value != null && String(value).trim() ? String(value) : '—'
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{s}</span>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-gray-50 p-3 dark:border-zinc-700/50 dark:bg-muted/30">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </div>
  )
}

interface PhaseSearchProps {
  hasSearched: boolean
  searchResults: MaterialSearchItem[]
  searchLoading: boolean
  onSearch: (q: string) => void
  onFoundGoHome: () => void
  onNotFoundCreateRequest: () => void
}

export function PhaseSearch({
  hasSearched,
  searchResults,
  searchLoading,
  onSearch,
  onFoundGoHome,
  onNotFoundCreateRequest,
}: PhaseSearchProps) {
  const [query, setQuery] = useState('')
  const [modalMaterial, setModalMaterial] = useState<MaterialSearchItem | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailMaterial, setDetailMaterial] = useState<MaterialSearchItem | null>(null)
  const [fieldsByView, setFieldsByView] = useState<FieldByView>({})
  const [pdmTemplate, setPdmTemplate] = useState<{ name: string; attributes?: PdmAttribute[] } | null>(null)

  useEffect(() => {
    getFieldDictionary()
      .then((fields) => {
        const byView: FieldByView = {}
        for (const f of fields) {
          const view = (f.erp_view as string) || 'Outros'
          if (!byView[view]) byView[view] = []
          byView[view].push({
            field_name: f.field_name as string,
            field_label: f.field_label as string,
            display_order: f.display_order as number | undefined,
          })
        }
        for (const arr of Object.values(byView)) {
          arr.sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999) || a.field_label.localeCompare(b.field_label))
        }
        setFieldsByView(byView)
      })
      .catch(() => setFieldsByView({}))
  }, [])

  useEffect(() => {
    if (!detailMaterial?.pdm_code) {
      setPdmTemplate(null)
      return
    }
    getPdms()
      .then((pdms) => {
        const found = pdms.find((p) => p.internal_code === detailMaterial.pdm_code)
        if (!found) return
        return getPdmById(found.id)
      })
      .then((pdm) => setPdmTemplate(pdm ?? null))
      .catch(() => setPdmTemplate(null))
  }, [detailMaterial?.pdm_code])

  const handleSearch = () => {
    const q = query.trim()
    if (q) onSearch(q)
  }

  const openDetailModal = (item: MaterialSearchItem) => {
    setModalMaterial(item)
    setDetailMaterial(null)
    setDetailLoading(true)
    getMaterialById(item.id)
      .then((d) => setDetailMaterial(d as MaterialSearchItem))
      .catch(() => setDetailMaterial(item))
      .finally(() => setDetailLoading(false))
  }

  const m = detailMaterial ?? modalMaterial

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Link de Pesquisa</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pesquise se o material já existe antes de criar uma solicitação.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Digite a descrição ou código do material..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button
          onClick={handleSearch}
          disabled={!query.trim() || searchLoading}
          className="gap-2"
        >
          {searchLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Pesquisar
        </Button>
      </div>

      {/* Resultados */}
      {searchResults.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Resultados encontrados</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {searchResults.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openDetailModal(item)}
                className="flex cursor-pointer flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50 dark:border-zinc-700/50 dark:bg-card dark:hover:bg-muted/30"
              >
                <span className="font-mono text-sm font-semibold text-foreground">
                  {item.id_sistema ?? item.id_erp ?? item.id}
                </span>
                <span className="text-sm text-muted-foreground line-clamp-2">
                  {item.description}
                </span>
                <span
                  className={`mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium border ${
                    STATUS_BADGE[item.status] ?? 'bg-slate-200 text-slate-700 border border-slate-400'
                  }`}
                >
                  {item.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {hasSearched && searchResults.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-muted-foreground dark:border-zinc-700/50 dark:bg-muted/30">
          Nenhum material encontrado para a busca realizada.
        </p>
      )}

      {/* Botões de ação */}
      <div className="flex flex-wrap gap-3 border-t border-[#B4B9BE]/40 pt-6">
        {!hasSearched ? (
          <Button disabled variant="outline" className="gap-2">
            Pesquisar antes de continuar
          </Button>
        ) : (
          <>
            {searchResults.length > 0 && (
              <Button
                onClick={onFoundGoHome}
                className="gap-2 bg-[#0F1C38] hover:bg-[#0F1C38]/90"
              >
                Encontrei o que precisava
              </Button>
            )}
            <Button
              onClick={onNotFoundCreateRequest}
              variant={searchResults.length > 0 ? 'outline' : 'default'}
              className={searchResults.length > 0 ? '' : 'gap-2 bg-[#0F1C38] hover:bg-[#0F1C38]/90'}
            >
              Não encontrei, criar solicitação
            </Button>
          </>
        )}
      </div>

      {/* Modal de detalhe */}
      <Dialog open={!!modalMaterial} onOpenChange={(open) => !open && setModalMaterial(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto bg-white dark:bg-card">
          <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
              {m && (
                <>
                  <span className="font-mono">{m.id_erp ?? m.id_sistema ?? m.id}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium border ${
                      STATUS_BADGE[m.status] ?? 'bg-slate-200 text-slate-700 border border-slate-400'
                    }`}
                  >
                    {m.status}
                  </span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>Carregando detalhes...</span>
            </div>
          ) : m ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{m.description}</p>

              {/* 1. Atributos Técnicos (PDM + demais) — sempre primeiro */}
              {m.technical_attributes && Object.keys(m.technical_attributes).length > 0 && (() => {
                const shownInFields = new Set(Object.values(fieldsByView).flat().map((f) => f.field_name))
                const pdmAttrs = (pdmTemplate?.attributes ?? []) as Array<{ id?: string; name?: string; order?: number }>
                const sortedPdm = [...pdmAttrs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                const pdmFilled = sortedPdm.filter((a) => {
                  const v = m.technical_attributes?.[a.id ?? '']
                  return v != null && (typeof v === 'string' ? v.trim() : String((v as { value?: string }).value ?? '').trim())
                })
                const remaining = Object.entries(m.technical_attributes).filter(
                  ([k, v]) => !shownInFields.has(k) && v != null && (typeof v === 'string' ? v.trim() : String((v as { value?: string }).value ?? '').trim())
                )
                const pdmIds = new Set(pdmFilled.map((a) => a.id ?? ''))
                const remainingFiltered = remaining.filter(([k]) => !pdmIds.has(k))
                if (pdmFilled.length === 0 && remainingFiltered.length === 0) return null
                return (
                  <SectionCard title="Atributos Técnicos">
                    {pdmFilled.map((attr) => {
                      const rawVal = m.technical_attributes?.[attr.id ?? '']
                      const displayVal = rawVal != null ? formatAttrValue(rawVal) : '—'
                      return (
                        <Row key={attr.id ?? ''} label={attr.name ?? attr.id ?? ''} value={displayVal} />
                      )
                    })}
                    {remainingFiltered.map(([key, val]) => (
                      <Row
                        key={key}
                        label={key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        value={formatAttrValue(val)}
                      />
                    ))}
                  </SectionCard>
                )
              })()}

              {/* 2. Campos do Dicionário agrupados por erp_view — ordem fixa */}
              {Object.keys(fieldsByView).length > 0 && (() => {
                const viewOrder = ['Dados Básicos', 'Compras', 'MRP', 'Fiscal', 'Contabilidade', 'Vendas']
                const orderedViews = [...new Set([...viewOrder, ...Object.keys(fieldsByView)])]
                return orderedViews.map((viewName) => {
                  const viewFields = fieldsByView[viewName]
                  if (!viewFields || viewFields.length === 0) return null
                  const withValues = viewFields.filter((f) => {
                    const v = m.technical_attributes?.[f.field_name] ?? (m as Record<string, unknown>)[f.field_name]
                    return v != null && (typeof v === 'string' ? v.trim() : String(v).trim())
                  })
                  if (withValues.length === 0) return null
                  return (
                    <SectionCard key={viewName} title={viewName}>
                      {withValues.map((field) => {
                        const rawVal = m.technical_attributes?.[field.field_name] ?? (m as Record<string, unknown>)[field.field_name]
                        const displayVal = rawVal != null ? formatAttrValue(rawVal) : '—'
                        return (
                          <Row key={field.field_name} label={field.field_label} value={displayVal} />
                        )
                      })}
                    </SectionCard>
                  )
                })
              })()}

              {/* Fallback: colunas diretas se não houver technical_attributes */}
              {(!m.technical_attributes || Object.keys(m.technical_attributes).length === 0) && (
                <>
                  <SectionCard title="Dados Básicos">
                    <Row label="Grupo de Mercadorias" value={m.material_group} />
                    <Row label="Unidade de Medida" value={m.unit_of_measure} />
                    <Row label="Tipo de Material" value={m.material_type} />
                    <Row label="Peso Bruto" value={formatNumber(m.gross_weight)} />
                    <Row label="Peso Líquido" value={formatNumber(m.net_weight)} />
                  </SectionCard>
                  <SectionCard title="Classificação Fiscal">
                    <Row label="NCM" value={m.ncm} />
                    <Row label="CFOP" value={m.cfop} />
                    <Row label="Origem" value={m.origin} />
                  </SectionCard>
                  <SectionCard title="Compras">
                    <Row label="Grupo de Compras" value={m.purchase_group} />
                    <Row label="Prazo de Entrega (dias)" value={formatNumber(m.lead_time)} />
                  </SectionCard>
                  <SectionCard title="MRP">
                    <Row label="Tipo MRP" value={m.mrp_type} />
                    <Row label="Estoque Mínimo" value={formatNumber(m.min_stock)} />
                    <Row label="Estoque Máximo" value={formatNumber(m.max_stock)} />
                  </SectionCard>
                  <SectionCard title="Contabilidade">
                    <Row label="Classe de Valoração" value={m.valuation_class} />
                    <Row label="Preço Padrão" value={formatCurrency(m.standard_price)} />
                    <Row label="Centro de Lucro" value={m.profit_center} />
                  </SectionCard>
                </>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
