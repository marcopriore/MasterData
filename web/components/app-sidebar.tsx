'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Home, FileText, ShieldCheck, Database, Settings, GitBranch, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

const NAV_WIDTH = '14rem'

const navLinks = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/request', label: 'Solicitações', icon: FileText },
  { href: '/governance', label: 'Governança', icon: ShieldCheck },
  { href: '/admin-pdm', label: 'Gestão PDM', icon: Database },
] as const

const configItems = [
  { href: '/settings/workflow', label: 'Workflows', icon: GitBranch },
] as const

function NavLink({
  href,
  label,
  icon: Icon,
}: { href: string; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
      style={{
        color: 'var(--sidebar-text)',
        fontWeight: isActive ? 600 : 500,
        backgroundColor: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--sidebar-hover-bg)' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
    >
      <Icon className="size-4 shrink-0" style={{ color: 'var(--sidebar-icon)' }} />
      {label}
    </Link>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [configExpanded, setConfigExpanded] = useState(pathname.startsWith('/settings/workflow'))

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (pathname.startsWith('/settings/workflow')) {
      setConfigExpanded(true)
    }
  }, [pathname])

  const isDark = mounted && resolvedTheme === "dark"

  const sidebarStyle = {
    '--nav-width': NAV_WIDTH,
    backgroundColor: 'var(--sidebar-bg)',
    borderColor: 'var(--sidebar-border)',
  } as React.CSSProperties

  return (
    <aside
      className="fixed left-0 top-0 z-40 hidden h-screen w-[--nav-width] flex-col border-r md:flex"
      style={sidebarStyle}
    >
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: 'var(--sidebar-border)' }}>
        <div className="flex size-8 items-center justify-center rounded-lg bg-[#0F1C38] text-white">
          <Database className="size-4" />
        </div>
        <span className="text-sm font-bold" style={{ color: 'var(--sidebar-text)' }}>
          MDM Platform
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {navLinks.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        {/* Configurações - Collapsible */}
        <Collapsible
          open={configExpanded}
          onOpenChange={setConfigExpanded}
          className="mt-2"
        >
          <CollapsibleTrigger
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{ color: 'var(--sidebar-text)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--sidebar-hover-bg)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <div className="flex items-center gap-3">
              <Settings className="size-4 shrink-0" style={{ color: 'var(--sidebar-icon)' }} />
              Configurações
            </div>
            {configExpanded ? (
              <ChevronDown className="size-4 shrink-0" style={{ color: 'var(--sidebar-icon)' }} />
            ) : (
              <ChevronRight className="size-4 shrink-0" style={{ color: 'var(--sidebar-icon)' }} />
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1 flex flex-col gap-0.5 pl-4">
              {configItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors"
                    style={{
                      color: 'var(--sidebar-text)',
                      fontWeight: isActive ? 600 : 500,
                      backgroundColor: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--sidebar-hover-bg)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <item.icon className="size-4 shrink-0" style={{ color: 'var(--sidebar-icon)' }} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </nav>

      {/* Theme Toggle - bottom of sidebar */}
      <div className="shrink-0 border-t p-3" style={{ borderColor: 'var(--sidebar-border)' }}>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 transition-colors"
          style={{ color: 'var(--sidebar-text)' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--sidebar-hover-bg)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          onClick={() => setTheme(isDark ? "light" : "dark")}
          aria-label={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
        >
          {mounted ? (
            isDark ? (
              <Sun className="size-4 shrink-0" style={{ color: 'var(--sidebar-icon)' }} />
            ) : (
              <Moon className="size-4 shrink-0" style={{ color: 'var(--sidebar-icon)' }} />
            )
          ) : (
            <Moon className="size-4 shrink-0 opacity-50" style={{ color: 'var(--sidebar-icon)' }} />
          )}
          <span className="text-sm font-medium">
            {mounted ? (isDark ? "Modo Escuro" : "Modo Claro") : "Tema"}
          </span>
        </Button>
      </div>
    </aside>
  )
}
