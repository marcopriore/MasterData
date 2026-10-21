import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { classifyPath, safeRedirectTarget } from '@/lib/route-guard'

/**
 * Porta de entrada de toda página e rota de API (regras em lib/route-guard.ts).
 * - Faz refresh da sessão Supabase
 * - Página sem sessão vai para /login; API sem sessão recebe 401
 * - /api/v1 e o webhook do suporte se autenticam na própria rota (chave ou segredo)
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const kind = classifyPath(pathname)
  if (kind === 'api-key' || kind === 'api-webhook') return NextResponse.next()

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

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
