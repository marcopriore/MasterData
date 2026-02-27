import { NextRequest, NextResponse } from 'next/server'

/**
 * Route-protection middleware.
 *
 * Rules:
 *  - /login          → always public
 *  - /_next/**       → static assets, always pass-through
 *  - /favicon.ico    → pass-through
 *  - everything else → requires the "mdm_session" cookie; if absent, redirect to /login
 */

const PUBLIC_PATHS = ['/login']
const STATIC_PREFIXES = ['/_next/', '/favicon']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow static Next.js assets
  if (STATIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Always allow public pages
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  // Check for session cookie
  const session = request.cookies.get('mdm_session')
  if (!session?.value) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    // Preserve the original destination so we can redirect back after login
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
