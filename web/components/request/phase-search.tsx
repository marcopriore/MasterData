'use client'

import { useState } from 'react'
import { apiGetWithAuth } from '@/lib/api'
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
  id_erp: string
  description: string
  status: string
  pdm_code: string | null
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
}

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
  accessToken: string | null
  hasSearched: boolean
  searchResults: MaterialSearchItem[]
  searchLoading: boolean
  onSearch: (q: string) => void
  onFoundGoHome: () => void
  onNotFoundCreateRequest: () => void
}

export function PhaseSearch({
  accessToken,
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

  const handleSearch = () => {
    const q = query.trim()
    if (q) onSearch(q)
  }

  const openDetailModal = (item: MaterialSearchItem) => {
    setModalMaterial(item)
    setDetailMaterial(null)
    if (!accessToken) return
    setDetailLoading(true)
    apiGetWithAuth<MaterialSearchItem>(`/api/database/materials/${item.id}`, accessToken)
      .then(setDetailMaterial)
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
                  {item.id_erp}
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
                  <span className="font-mono">{m.id_erp}</span>
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
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
