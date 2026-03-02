import { NextRequest, NextResponse } from 'next/server'

/**
 * Route-protection middleware.
 *
 * A request is allowed through when ANY of these is true:
 *   1. The pathname is in PUBLIC_PATHS (exact match or sub-path)
 *   2. The "mdm_session" cookie is present
 *
 * Everything else is redirected to /login?from=<original-path>.
 *
 * The `config.matcher` below is the first line of defence — it excludes
 * Next.js internals, static files, and the /api/* proxy so the middleware
 * never even runs for those requests.
 */

const PUBLIC_PATHS = ['/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Diagnostic log — visible in the Next.js terminal ──────────────────────
  console.log('[middleware]', request.method, pathname)

  // 1. Public page — always pass through, never loop
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    console.log('[middleware] → PUBLIC, pass')
    return NextResponse.next()
  }

  // 2. Session cookie present — allow through
  const session = request.cookies.get('mdm_session')
  if (session?.value) {
    console.log('[middleware] → SESSION OK, pass')
    return NextResponse.next()
  }

  // 3. No session — redirect to /login
  console.log('[middleware] → NO SESSION, redirect → /login?from=' + pathname)
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    /*
     * Run on every route EXCEPT:
     *   /_next/static, /_next/image, /_next/data, /_next/webpack-hmr
     *   /favicon.ico
     *   /api/*   — FastAPI backend proxy, no edge auth needed
     *   /admin/* — FastAPI admin proxy, same reason
     *   image files (.png .jpg .svg .ico .webp)
     */
    '/((?!_next/static|_next/image|_next/data|_next/webpack-hmr|favicon\\.ico|api/|admin/|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)',
  ],
}
