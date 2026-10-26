/**
 * Content-Security-Policy com nonce por requisição (aplicada em proxy.ts).
 * Script só do próprio site com o nonce; 'strict-dynamic' deixa os chunks do Next carregarem os seus.
 * Estilo inline continua liberado (Tailwind, atributos style e o tema).
 */
export function buildCsp(nonce: string, opts: { supabaseUrl?: string; dev?: boolean } = {}): string {
  const supabase = opts.supabaseUrl ? new URL(opts.supabaseUrl) : null
  const supabaseHttp = supabase ? supabase.origin : ''
  const supabaseWs = supabase ? `wss://${supabase.host}` : ''

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", supabaseHttp, supabaseWs, ...(opts.dev ? ['ws:'] : [])].filter(Boolean),
    'frame-src': ["'self'", 'blob:', supabaseHttp].filter(Boolean),
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  const parts = Object.entries(directives).map(([key, values]) => `${key} ${values.join(' ')}`)
  if (!opts.dev) parts.push('upgrade-insecure-requests')
  return parts.join('; ')
}

export function newNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}
