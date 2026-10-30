import { describe, expect, it } from 'vitest'
import { isClosedStatus, statusGroup } from './request-status'

describe('situação da solicitação', () => {
  it('agrupa os status gravados pelo banco e pela tela', () => {
    expect(statusGroup('finalizado')).toBe('done')
    expect(statusGroup('Rejected')).toBe('rejected')
    expect(statusGroup('cancelado')).toBe('cancelled')
    expect(statusGroup('compras')).toBe('open')
    expect(statusGroup(null)).toBe('open')
  })

  it('fechada = finalizada, rejeitada ou cancelada', () => {
    expect(isClosedStatus('cancelado')).toBe(true)
    expect(isClosedStatus('rejeitado')).toBe(true)
    expect(isClosedStatus('mrp')).toBe(false)
  })
})
