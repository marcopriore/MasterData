/** Filtros da lista de chamados (mesmo modelo do Valore), lidos e gravados na URL. Sem banco. */
import type { AxisDeskCategoria, AxisDeskChamado } from '@/lib/axisdesk/types'

export type SupportListFilters = {
  q: string
  status: string[]
  tipo: string[]
  prioridade: string[]
  categoria: string[]
  responsavel: string[]
  slaDe: string
  slaAte: string
  criadoDe: string
  criadoAte: string
  /** true lista todos os chamados da empresa; false, só os do usuário logado */
  viewAll: boolean
  page: number
}

export const SUPPORT_PAGE_SIZE = 25

export const SUPPORT_LIST_DEFAULT_FILTERS: SupportListFilters = {
  q: '',
  status: [],
  tipo: [],
  prioridade: [],
  categoria: [],
  responsavel: [],
  slaDe: '',
  slaAte: '',
  criadoDe: '',
  criadoAte: '',
  viewAll: false,
  page: 1,
}

function parseCsv(param: string | null): string[] {
  if (!param) return []
  return param.split(',').map((v) => v.trim()).filter(Boolean)
}

function parsePage(param: string | null): number {
  const n = Number(param ?? '1')
  return Number.isInteger(n) && n >= 1 ? n : 1
}

export function parseSupportListFilters(searchParams: URLSearchParams): SupportListFilters {
  return {
    q: searchParams.get('q')?.trim() ?? '',
    status: parseCsv(searchParams.get('status')),
    tipo: parseCsv(searchParams.get('tipo')),
    prioridade: parseCsv(searchParams.get('prioridade')),
    categoria: parseCsv(searchParams.get('categoria')),
    responsavel: parseCsv(searchParams.get('responsavel')),
    slaDe: searchParams.get('slaDe')?.trim() ?? '',
    slaAte: searchParams.get('slaAte')?.trim() ?? '',
    criadoDe: searchParams.get('criadoDe')?.trim() ?? '',
    criadoAte: searchParams.get('criadoAte')?.trim() ?? '',
    viewAll: searchParams.get('viewAll') === '1' || searchParams.get('viewAll') === 'true',
    page: parsePage(searchParams.get('page')),
  }
}

export function buildSupportListSearchParams(filters: SupportListFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.status.length > 0) params.set('status', filters.status.join(','))
  if (filters.tipo.length > 0) params.set('tipo', filters.tipo.join(','))
  if (filters.prioridade.length > 0) params.set('prioridade', filters.prioridade.join(','))
  if (filters.categoria.length > 0) params.set('categoria', filters.categoria.join(','))
  if (filters.responsavel.length > 0) params.set('responsavel', filters.responsavel.join(','))
  if (filters.slaDe) params.set('slaDe', filters.slaDe)
  if (filters.slaAte) params.set('slaAte', filters.slaAte)
  if (filters.criadoDe) params.set('criadoDe', filters.criadoDe)
  if (filters.criadoAte) params.set('criadoAte', filters.criadoAte)
  if (filters.viewAll) params.set('viewAll', '1')
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

/** Data local no formato AAAA-MM-DD, o mesmo do input type="date". */
function localDateKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function matchesDateRange(iso: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true
  const key = localDateKey(iso)
  if (!key) return false
  if (from && key < from) return false
  if (to && key > to) return false
  return true
}

export function getCategoriaFilterOptions(categorias: AxisDeskCategoria[], tipoFilter: string[]) {
  const list = tipoFilter.length > 0 ? categorias.filter((c) => tipoFilter.includes(c.tipo)) : categorias
  return list.map((c) => ({ value: c.id, label: c.nome })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

export function sanitizeCategoriaFilter(categoria: string[], categorias: AxisDeskCategoria[], tipoFilter: string[]): string[] {
  const allowed = new Set(getCategoriaFilterOptions(categorias, tipoFilter).map((o) => o.value))
  return categoria.filter((id) => allowed.has(id))
}

export function applySupportListFilters(
  tickets: AxisDeskChamado[],
  filters: SupportListFilters,
  owner?: { userId?: string | null; email?: string | null }
): AxisDeskChamado[] {
  const q = filters.q.trim().toLowerCase()
  const ownerEmail = owner?.email?.trim().toLowerCase() ?? ''
  const ownerId = owner?.userId?.trim() ?? ''

  return tickets.filter((ticket) => {
    if (!filters.viewAll) {
      const sid = ticket.solicitante?.id_externo?.trim() ?? ''
      const semail = ticket.solicitante?.email?.trim().toLowerCase() ?? ''
      const isMine = (ownerId.length > 0 && sid === ownerId) || (ownerEmail.length > 0 && semail === ownerEmail)
      if (!isMine) return false
    }
    if (q && !ticket.titulo.toLowerCase().includes(q)) return false
    if (filters.status.length > 0 && !filters.status.includes(ticket.status)) return false
    if (filters.tipo.length > 0 && !filters.tipo.includes(ticket.tipo)) return false
    if (filters.prioridade.length > 0 && !filters.prioridade.includes(ticket.prioridade)) return false
    if (filters.categoria.length > 0) {
      const catId = ticket.categoria?.id
      if (!catId || !filters.categoria.includes(catId)) return false
    }
    if (filters.responsavel.length > 0) {
      const nome = ticket.solicitante?.nome?.trim()
      if (!nome || !filters.responsavel.includes(nome)) return false
    }
    if (!matchesDateRange(ticket.sla_prazo, filters.slaDe, filters.slaAte)) return false
    if (!matchesDateRange(ticket.created_at, filters.criadoDe, filters.criadoAte)) return false
    return true
  })
}

export function getResponsavelFilterOptions(tickets: AxisDeskChamado[]) {
  const names = new Set<string>()
  for (const ticket of tickets) {
    const nome = ticket.solicitante?.nome?.trim()
    if (nome) names.add(nome)
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((nome) => ({ value: nome, label: nome }))
}

export function hasActiveSupportListFilters(filters: SupportListFilters): boolean {
  return (
    filters.q.length > 0 ||
    filters.status.length > 0 ||
    filters.tipo.length > 0 ||
    filters.prioridade.length > 0 ||
    filters.categoria.length > 0 ||
    filters.responsavel.length > 0 ||
    filters.slaDe.length > 0 ||
    filters.slaAte.length > 0 ||
    filters.criadoDe.length > 0 ||
    filters.criadoAte.length > 0
  )
}
