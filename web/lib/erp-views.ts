import { toErpText } from '@/lib/erp-text'

/** Visões ERP do dicionário de campos. No banco fica o código (migration 034); na tela, o rótulo. */
export const ERP_VIEWS = [
  { value: 'dados_basicos', label: 'Dados Básicos' },
  { value: 'compras', label: 'Compras' },
  { value: 'mrp', label: 'MRP' },
  { value: 'fiscal', label: 'Fiscal' },
  { value: 'contabilidade', label: 'Contabilidade' },
  { value: 'vendas', label: 'Vendas' },
] as const

const ALIASES: Record<string, string> = {
  classificacao_fiscal: 'fiscal',
  dados_basicos_1: 'dados_basicos',
}

/** Código da visão a partir do que estiver gravado ("Dados Básicos", "dados_basicos", "Compras"...). */
export function erpViewCode(raw: string | null | undefined): string {
  const code = toErpText(raw ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return ALIASES[code] ?? code
}

export function erpViewLabel(raw: string | null | undefined): string {
  const code = erpViewCode(raw)
  if (!code) return 'Outros'
  return ERP_VIEWS.find((v) => v.value === code)?.label ?? (raw ?? '').trim()
}
