'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { apiGetWithAuth } from '@/lib/api'
import { useUser } from '@/contexts/user-context'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Loader2 } from 'lucide-react'

type MaterialDetail = {
  id: number
  sap_code: string
  description: string
  status: string
  pdm_code: string | null
  pdm_name: string | null
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
  created_at: string | null
  updated_at: string | null
}

const STATUS_BADGE: Record<string, string> = {
  Ativo: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Bloqueado: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  Obsoleto: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatNumber(v: number | null): string {
  if (v == null) return '—'
  return String(v)
}

function formatCurrency(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(v)
}

function Cell({ value }: { value: string | number | null }) {
  const s = value != null && String(value).trim() ? String(value) : '—'
  return <span className="text-sm text-foreground">{s}</span>
}

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-700/50 dark:bg-card">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value ?? '—'}</span>
    </div>
  )
}

export default function DatabaseDetailPage() {
  const params = useParams()
  const id = Number(params.id)
  const { accessToken } = useUser()
  const [material, setMaterial] = useState<MaterialDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken || !id || Number.isNaN(id)) return
    setLoading(true)
    setError(null)
    apiGetWithAuth<MaterialDetail>(`/api/database/materials/${id}`, accessToken)
      .then(setMaterial)
      .catch((e: unknown) => setError((e as Error)?.message ?? 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }, [accessToken, id])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span>Carregando material...</span>
      </div>
    )
  }

  if (error || !material) {
    return (
      <div className="space-y-4">
        <Link href="/database">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ChevronLeft className="size-4" />
            Voltar
          </Button>
        </Link>
        <p className="text-muted-foreground">
          {error ?? 'Material não encontrado.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link href="/database">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <ChevronLeft className="size-4" />
          Voltar
        </Button>
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-mono">
            {material.sap_code}
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            {material.description}
          </p>
          <span
            className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              STATUS_BADGE[material.status] ?? 'bg-slate-100 text-slate-700'
            }`}
          >
            {material.status}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        <SectionCard title="Dados Básicos">
          <Row label="Descrição" value={<Cell value={material.description} />} />
          <Row label="Grupo de Mercadorias" value={<Cell value={material.material_group} />} />
          <Row label="Unidade de Medida" value={<Cell value={material.unit_of_measure} />} />
          <Row label="Tipo de Material" value={<Cell value={material.material_type} />} />
          <Row label="Peso Bruto" value={formatNumber(material.gross_weight)} />
          <Row label="Peso Líquido" value={formatNumber(material.net_weight)} />
        </SectionCard>

        <SectionCard title="Classificação Fiscal">
          <Row label="NCM" value={<Cell value={material.ncm} />} />
          <Row label="CFOP" value={<Cell value={material.cfop} />} />
          <Row label="Origem do Material" value={<Cell value={material.origin} />} />
        </SectionCard>

        <SectionCard title="Compras">
          <Row label="Grupo de Compras" value={<Cell value={material.purchase_group} />} />
          <Row label="Prazo de Entrega (dias)" value={formatNumber(material.lead_time)} />
          <Row label="Unidade de Pedido" value={<Cell value={material.unit_of_measure} />} />
        </SectionCard>

        <SectionCard title="MRP">
          <Row label="Tipo MRP" value={<Cell value={material.mrp_type} />} />
          <Row label="Estoque Mínimo" value={formatNumber(material.min_stock)} />
          <Row label="Estoque Máximo" value={formatNumber(material.max_stock)} />
        </SectionCard>

        <SectionCard title="Contabilidade">
          <Row label="Classe de Valoração" value={<Cell value={material.valuation_class} />} />
          <Row label="Preço Padrão" value={formatCurrency(material.standard_price)} />
          <Row label="Centro de Lucro" value={<Cell value={material.profit_center} />} />
        </SectionCard>

        <SectionCard title="Metadados">
          <Row label="Código PDM" value={<Cell value={material.pdm_code} />} />
          <Row label="Nome PDM" value={<Cell value={material.pdm_name} />} />
          <Row label="Data de Criação" value={formatDate(material.created_at)} />
          <Row label="Data de Atualização" value={formatDate(material.updated_at)} />
        </SectionCard>
      </div>
    </div>
  )
}
