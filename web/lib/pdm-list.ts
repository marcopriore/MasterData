/** Lista de PDMs: filtros, ordenação e paginação. O estado vive na URL para o voltar do navegador manter a busca. */

export const PDM_PAGE_SIZE = 25

/** Último endereço da lista na aba, para o detalhe voltar com os mesmos filtros e página. */
export const PDM_LIST_STORAGE_KEY = 'pdm-list-query'

export type PdmListRow = {
  id: number
  name: string
  internal_code: string
  is_active?: boolean
  materials_count?: number
}

export type PdmSort = 'codigo' | 'nome' | 'materiais' | 'situacao'

export type PdmListState = {
  q: string
  situacao: 'todos' | 'ativos' | 'inativos'
  uso: 'todos' | 'com' | 'sem'
  ordem: PdmSort
  dir: 'asc' | 'desc'
  pagina: number
}

export const DEFAULT_PDM_LIST: PdmListState = { q: '', situacao: 'todos', uso: 'todos', ordem: 'nome', dir: 'asc', pagina: 1 }

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export function readPdmListState(params: { get(name: string): string | null }): PdmListState {
  const page = Number(params.get('pagina'))
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    situacao: pick(params.get('situacao'), ['todos', 'ativos', 'inativos'] as const, 'todos'),
    uso: pick(params.get('uso'), ['todos', 'com', 'sem'] as const, 'todos'),
    ordem: pick(params.get('ordem'), ['codigo', 'nome', 'materiais', 'situacao'] as const, 'nome'),
    dir: pick(params.get('dir'), ['asc', 'desc'] as const, 'asc'),
    pagina: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/** Só grava na URL o que difere do padrão. */
export function pdmListQuery(state: PdmListState): string {
  const params = new URLSearchParams()
  if (state.q.trim()) params.set('q', state.q.trim())
  if (state.situacao !== DEFAULT_PDM_LIST.situacao) params.set('situacao', state.situacao)
  if (state.uso !== DEFAULT_PDM_LIST.uso) params.set('uso', state.uso)
  if (state.ordem !== DEFAULT_PDM_LIST.ordem) params.set('ordem', state.ordem)
  if (state.dir !== DEFAULT_PDM_LIST.dir) params.set('dir', state.dir)
  if (state.pagina > 1) params.set('pagina', String(state.pagina))
  return params.toString()
}

function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

export function applyPdmList<T extends PdmListRow>(rows: T[], state: PdmListState) {
  const q = normalize(state.q.trim())
  const filtered = rows.filter((row) => {
    const active = row.is_active !== false
    const materials = row.materials_count ?? 0
    if (state.situacao === 'ativos' && !active) return false
    if (state.situacao === 'inativos' && active) return false
    if (state.uso === 'com' && materials === 0) return false
    if (state.uso === 'sem' && materials > 0) return false
    if (q && !normalize(row.name).includes(q) && !normalize(row.internal_code ?? '').includes(q)) return false
    return true
  })

  const sign = state.dir === 'asc' ? 1 : -1
  const sorted = [...filtered].sort((a, b) => {
    let diff = 0
    if (state.ordem === 'codigo') diff = collator.compare(a.internal_code ?? '', b.internal_code ?? '')
    if (state.ordem === 'nome') diff = collator.compare(a.name, b.name)
    if (state.ordem === 'materiais') diff = (a.materials_count ?? 0) - (b.materials_count ?? 0)
    if (state.ordem === 'situacao') diff = Number(b.is_active !== false) - Number(a.is_active !== false)
    return diff * sign || collator.compare(a.name, b.name)
  })

  const pages = Math.max(1, Math.ceil(sorted.length / PDM_PAGE_SIZE))
  const page = Math.min(state.pagina, pages)
  return {
    total: sorted.length,
    pages,
    page,
    rows: sorted.slice((page - 1) * PDM_PAGE_SIZE, page * PDM_PAGE_SIZE),
  }
}
