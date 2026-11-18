import { describe, expect, it } from 'vitest'
import { pageSlice } from './pagination'

const list = Array.from({ length: 120 }, (_, i) => i + 1)

describe('paginação', () => {
  it('fatia pela página e informa a posição', () => {
    expect(pageSlice(list, 1, 50)).toMatchObject({ page: 1, pages: 3, from: 1, to: 50, total: 120 })
    const last = pageSlice(list, 3, 50)
    expect(last).toMatchObject({ page: 3, from: 101, to: 120 })
    expect(last.items).toHaveLength(20)
  })

  it('página fora do intervalo cai na primeira ou na última', () => {
    expect(pageSlice(list, 9, 50).page).toBe(3)
    expect(pageSlice(list, 0, 50).page).toBe(1)
  })

  it('lista vazia tem uma página sem itens', () => {
    expect(pageSlice([], 1, 50)).toEqual({ items: [], page: 1, pages: 1, from: 0, to: 0, total: 0 })
  })
})
