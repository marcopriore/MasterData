'use client'

/**
 * AppShell — renders the sidebar + topbar + main content wrapper.
 * Hidden entirely on the /login route so the login page is full-screen.
 * --nav-width (aberta ou recolhida) é lida pela sidebar, pela topbar e pelo main.
 */

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { Topbar } from '@/components/topbar'

const SIDEBAR_HIDDEN_PATHS = ['/login', '/reset-password']
const COLLAPSED_KEY = 'promat:sidebar-collapsed'
const NAV_WIDTH_OPEN = '16rem'
const NAV_WIDTH_COLLAPSED = '4.25rem'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
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

  return (
    <div style={{ '--nav-width': collapsed ? NAV_WIDTH_COLLAPSED : NAV_WIDTH_OPEN } as React.CSSProperties}>
      <AppSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <Topbar />
      <main className="min-h-screen p-8 pt-[4.5rem] ml-0 transition-[margin] duration-200 md:ml-[var(--nav-width)]">{children}</main>
    </div>
  )
}
