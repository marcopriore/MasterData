'use client'

/**
 * AppShell — renders the sidebar + main content wrapper.
 * Hidden entirely on the /login route so the login page is full-screen.
 */

import { usePathname } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'

const SIDEBAR_HIDDEN_PATHS = ['/login']

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hideSidebar = SIDEBAR_HIDDEN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )

  if (hideSidebar) {
    return <>{children}</>
  }

  return (
    <>
      <AppSidebar />
      <main className="min-h-screen p-8 ml-0 md:ml-[14rem]">{children}</main>
    </>
  )
}
