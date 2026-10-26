import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { classifyPath, isCrossSiteWrite, safeRedirectTarget } from '@/lib/route-guard'
import { buildCsp, newNonce } from '@/lib/csp'

/**
 * Porta de entrada de toda página e rota de API (regras em lib/route-guard.ts).
 * - Faz refresh da sessão Supabase
 * - Página sem sessão vai para /login; API sem sessão recebe 401
 * - /api/v1 e o webhook do suporte se autenticam na própria rota (chave ou segredo)
 * - Alteração em /api vinda de outro site é recusada (CSRF)
 * - Content-Security-Policy com nonce por requisição
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const kind = classifyPath(pathname)
  if (kind === 'api-key' || kind === 'api-webhook') return NextResponse.next()

  if (kind === 'api-session' && isCrossSiteWrite(request.method, request.headers)) {
    return NextResponse.json({ error: 'Origem não permitida' }, { status: 403 })
  }

  const nonce = newNonce()
  const csp = buildCsp(nonce, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV !== 'production',
  })
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const next = () => NextResponse.next({ request: { headers: requestHeaders } })

  let supabaseResponse = next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          requestHeaders.set('cookie', request.headers.get('cookie') ?? '')
          supabaseResponse = next()
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims valida o JWT localmente com as chaves de assinatura do projeto (sem ida ao Auth a cada
  // requisição); com segredo HS256 legado, ele mesmo cai no getUser.
  const { data: claimsData } = await supabase.auth.getClaims()
  const user = claimsData?.claims?.sub ? { id: claimsData.claims.sub } : null

  if (!user && kind === 'api-session') {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  if (!user && kind === 'page') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('from', pathname)
    return NextResponse.redirect(url)
  }

  if (user && kind === 'login') {
    const url = request.nextUrl.clone()
    url.pathname = safeRedirectTarget(request.nextUrl.searchParams.get('from'))
    url.search = ''
    return NextResponse.redirect(url)
  }

  supabaseResponse.headers.set('Content-Security-Policy', csp)
  // Evitar cache da navegação client-side para que dados carreguem corretamente
  supabaseResponse.headers.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  )
  supabaseResponse.headers.set('Pragma', 'no-cache')
  supabaseResponse.headers.set('Expires', '0')

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
