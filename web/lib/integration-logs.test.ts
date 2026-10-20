import { describe, expect, it } from 'vitest'
import { integrationStatusTone } from './integration-log-status'

describe('tom do status no monitor', () => {
  it('trata 2xx e sucesso como ok', () => {
    expect(integrationStatusTone(201, true)).toBe('ok')
    expect(integrationStatusTone(200, false)).toBe('ok')
  })

  it('trata falha e 4xx como erro', () => {
    expect(integrationStatusTone(401, false)).toBe('error')
    expect(integrationStatusTone(null, false)).toBe('error')
  })
})
