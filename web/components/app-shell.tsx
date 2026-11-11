'use client'

/**
 * AppShell — renders the sidebar + topbar + main content wrapper.
 * Hidden entirely on the /login route so the login page is full-screen.
 * --nav-width (aberta ou recolhida) é lida pela sidebar, pela topbar e pelo main.
 * A tela só monta se quem está logado pode abri-la (canOpenPath): o link colado não passa do menu.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { AppSidebar } from '@/components/app-sidebar'
import { Topbar } from '@/components/topbar'
import { NavigationProgress } from '@/components/navigation-progress'
import { PageLoading } from '@/components/ui/page-loading'
import { Button } from '@/components/ui/button'
import { useUser } from '@/contexts/user-context'
import { canOpenPath } from '@/lib/nav-access'
import { mergeRolePermissions } from '@/lib/permissions'

const SIDEBAR_HIDDEN_PATHS = ['/login', '/reset-password']
const COLLAPSED_KEY = 'promat:sidebar-collapsed'
const NAV_WIDTH_OPEN = '16rem'
const NAV_WIDTH_COLLAPSED = '4.25rem'

function AccessDenied() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <ShieldAlert className="size-10 text-red-500" aria-hidden="true" />
      <h1 className="text-xl font-semibold">Acesso negado</h1>
      <p className="text-sm text-muted-foreground">
        Seu perfil não tem permissão para esta tela. Se precisar dela, peça ao administrador da sua empresa.
      </p>
      <Link href="/"><Button variant="outline" size="sm">Voltar ao início</Button></Link>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, ready } = useUser()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === '1')
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }, [])

  const hideSidebar = SIDEBAR_HIDDEN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )

  if (hideSidebar) {
    return <>{children}</>
  }

  const allowed = ready && user
    ? canOpenPath(pathname, {
        isMaster: user.is_master === true,
        permissions: user.role_permissions ?? mergeRolePermissions([], []),
      })
    : false

  return (
    <div style={{ '--nav-width': collapsed ? NAV_WIDTH_COLLAPSED : NAV_WIDTH_OPEN } as React.CSSProperties}>
      <AppSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <Topbar />
      <NavigationProgress />
      <main className="min-h-screen p-8 pt-[4.5rem] ml-0 transition-[margin] duration-200 md:ml-[var(--nav-width)]">
        {!ready || !user ? <PageLoading /> : allowed ? children : <AccessDenied />}
      </main>
    </div>
  )
}
