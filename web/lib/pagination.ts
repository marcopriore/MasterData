/** Fatia de uma lista para mostrar por página. Sem banco. */
export type PageSlice<T> = {
  items: T[]
  /** Página efetiva (1..pages), corrigida se a pedida passou do fim. */
  page: number
  pages: number
  /** Posição do primeiro e do último item na lista toda (1-based); 0 se vazia. */
  from: number
  to: number
  total: number
}

export function pageSlice<T>(items: T[], page: number, size: number): PageSlice<T> {
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / Math.max(1, size)))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  const start = (current - 1) * size
  const slice = items.slice(start, start + size)
  return { items: slice, page: current, pages, from: total === 0 ? 0 : start + 1, to: start + slice.length, total }
}
