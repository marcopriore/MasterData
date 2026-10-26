import { describe, expect, it } from 'vitest'
import { isCrossSiteWrite } from './route-guard'

const h = (values: Record<string, string>) => new Headers(values)

describe('alteração vinda de outro site (CSRF)', () => {
  it('leitura nunca é barrada', () => {
    expect(isCrossSiteWrite('GET', h({ 'sec-fetch-site': 'cross-site' }))).toBe(false)
  })

  it('barra POST de outro site pelo Sec-Fetch-Site', () => {
    expect(isCrossSiteWrite('POST', h({ 'sec-fetch-site': 'cross-site' }))).toBe(true)
    expect(isCrossSiteWrite('DELETE', h({ 'sec-fetch-site': 'same-site' }))).toBe(true)
  })

  it('aceita o próprio site', () => {
    expect(isCrossSiteWrite('POST', h({ 'sec-fetch-site': 'same-origin' }))).toBe(false)
  })

  it('sem Sec-Fetch-Site, compara Origin com o host', () => {
    expect(isCrossSiteWrite('POST', h({ origin: 'https://app.promat.com.br', host: 'app.promat.com.br' }))).toBe(false)
    expect(isCrossSiteWrite('POST', h({ origin: 'https://evil.example', host: 'app.promat.com.br' }))).toBe(true)
  })

  it('sem cabeçalho de origem (servidor, curl) passa', () => {
    expect(isCrossSiteWrite('POST', h({}))).toBe(false)
  })
})
