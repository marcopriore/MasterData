/**
 * Quem protege cada caminho. O proxy (web/proxy.ts) usa isto, e o gate de segurança testa.
 * - page: exige sessão; sem ela, vai para /login
 * - login: público; com sessão, volta para o app
 * - api-session: exige sessão; sem ela, 401 em JSON
 * - api-key: /api/v1, autenticada pela x-api-key na própria rota
 * - api-webhook: autenticada por segredo compartilhado na própria rota
 */
export type RouteKind = 'page' | 'login' | 'api-session' | 'api-key' | 'api-webhook'

export const API_KEY_PREFIX = '/api/v1'
export const WEBHOOK_ROUTES = ['/api/support/webhook']

function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function classifyPath(pathname: string): RouteKind {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (under(path, '/login')) return 'login'
  if (under(path, API_KEY_PREFIX)) return 'api-key'
  if (WEBHOOK_ROUTES.some((route) => path === route)) return 'api-webhook'
  if (under(path, '/api')) return 'api-session'
  return 'page'
}

/** Destino depois do login: só caminhos internos, nunca outro domínio. */
export function safeRedirectTarget(from: string | null | undefined): string {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return '/'
  if (classifyPath(from) !== 'page') return '/'
  return from
}
