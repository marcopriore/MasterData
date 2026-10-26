import { describe, expect, it } from 'vitest'
import { buildCsp, newNonce } from './csp'

describe('Content-Security-Policy', () => {
  const csp = buildCsp('abc', { supabaseUrl: 'https://xyz.supabase.co' })

  it('script só com nonce, sem eval em produção', () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'")
    expect(csp).not.toContain('unsafe-eval')
  })

  it('bloqueia embutir o site e plugins', () => {
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })

  it('libera o Supabase (API e realtime)', () => {
    expect(csp).toContain("connect-src 'self' https://xyz.supabase.co wss://xyz.supabase.co")
  })

  it('em desenvolvimento libera eval e websocket do Next', () => {
    const dev = buildCsp('abc', { supabaseUrl: 'https://xyz.supabase.co', dev: true })
    expect(dev).toContain("'unsafe-eval'")
    expect(dev).not.toContain('upgrade-insecure-requests')
  })

  it('nonce novo a cada chamada', () => {
    expect(newNonce()).not.toBe(newNonce())
  })
})
