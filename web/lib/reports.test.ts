import { describe, expect, it } from 'vitest'
import { defaultPeriod, formatHours, periodToRange, productivityByArea, rejectionsBy, totalsOfBase, type ProductivityRow } from './reports'

describe('rejeições por etapa e motivo', () => {
  it('soma e ordena do maior para o menor', () => {
    const rows = [
      { stage: 'cadastro', reason: 'duplicado', total: 3 },
      { stage: 'cadastro', reason: 'falta_informacao', total: 1 },
      { stage: 'fiscal', reason: 'duplicado', total: 2 },
    ]
    expect(rejectionsBy(rows, 'stage')).toEqual([{ key: 'cadastro', total: 4 }, { key: 'fiscal', total: 2 }])
    expect(rejectionsBy(rows, 'reason')).toEqual([{ key: 'duplicado', total: 5 }, { key: 'falta_informacao', total: 1 }])
  })
})

const person = (extra: Partial<ProductivityRow>): ProductivityRow => ({
  user_id: 'u',
  user_name: 'Pessoa',
  role_name: 'CADASTRO',
  attended: 0,
  approved: 0,
  rejected: 0,
  moved: 0,
  avg_decision_hours: null,
  ...extra,
})

describe('relatórios', () => {
  it('período padrão de 30 dias', () => {
    expect(defaultPeriod(new Date(2026, 9, 26))).toEqual({ from: '2026-09-26', to: '2026-10-26' })
  })

  it('o fim do período inclui o dia inteiro', () => {
    const range = periodToRange('2026-10-01', '2026-10-01')
    expect(new Date(range.to).getTime() - new Date(range.from).getTime()).toBe(24 * 3600 * 1000)
  })

  it('horas viram dias acima de 48', () => {
    expect(formatHours(3.5)).toBe('3,5 h')
    expect(formatHours(72)).toBe('3 dias')
    expect(formatHours(null)).toBe('—')
  })

  it('área soma as pessoas e pondera a média pelas decisões', () => {
    const areas = productivityByArea([
      person({ user_id: 'a', approved: 3, rejected: 1, avg_decision_hours: 2 }),
      person({ user_id: 'b', approved: 1, avg_decision_hours: 10 }),
      person({ user_id: 'c', role_name: 'COMPRAS', approved: 1, avg_decision_hours: 1 }),
    ])
    const cadastro = areas.find((a) => a.area === 'CADASTRO')!
    expect(cadastro.people).toBe(2)
    expect(cadastro.approved).toBe(4)
    expect(cadastro.avg_decision_hours).toBe(3.6)
  })

  it('totais da base', () => {
    const base = { pdm_code: 'X', pdm_name: 'X', total: 2, ativos: 1, bloqueados: 1, obsoletos: 0, pendente_erp: 2, integrados: 0, erro_erp: 0, duplicados: 2 }
    expect(totalsOfBase([base, base]).duplicados).toBe(4)
  })
})
