'use client'

/**
 * AppShell — renders the sidebar + topbar + main content wrapper.
 * Hidden entirely on the /login route so the login page is full-screen.
 */

import { usePathname } from 'next/navigation'
import { AppSidebar } from '@/components/app-sidebar'
import { Topbar } from '@/components/topbar'

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
      <Topbar />
      <main className="min-h-screen p-8 pt-[4.5rem] ml-0 md:ml-[14rem]">{children}</main>
    </>
  )
}
