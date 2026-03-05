'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import {
  ChevronDown, ChevronRight,
  Home, FileText, ShieldCheck, Database, LayoutGrid,
  Settings, GitBranch, Sun, Moon,
  UserCircle, Users, ShieldHalf, BookOpen, LogOut, ScrollText, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useUser } from '@/contexts/user-context'

const NAV_WIDTH = '14rem'

const navLinks = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/request', label: 'Solicitações', icon: FileText },
  { href: '/governance', label: 'Governança', icon: ShieldCheck },
  { href: '/database', label: 'Base de Dados', icon: Database },
  { href: '/admin-pdm', label: 'Gestão PDM', icon: LayoutGrid },
] as const

// Items always visible inside Configurações
const CONFIG_BASE = [
  { href: '/settings/profile',   label: 'Meu Perfil',  icon: UserCircle },
  { href: '/settings/workflow',  label: 'Workflows',   icon: GitBranch  },
] as const

// Items visible only to ADMIN role
const CONFIG_ADMIN = [
  { href: '/admin/users',  label: 'Gestão de Usuários',     icon: Users      },
  { href: '/admin/roles',  label: 'Perfis de Acesso',       icon: ShieldHalf },
  { href: '/admin/fields', label: 'Dicionário de Campos',   icon: BookOpen   },
  { href: '/admin/logs',   label: 'Log do Sistema',         icon: ScrollText },
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
  const { isAdmin, user, logout, can } = useUser()
  const [mounted, setMounted] = useState(false)

  const visibleNavLinks = navLinks.filter((item) => {
    if (item.href === '/') return true
    if (item.href === '/request') return can('can_submit_request')
    if (item.href === '/governance') return can('can_approve') || can('can_reject')
    if (item.href === '/database') return can('can_view_database')
    if (item.href === '/admin-pdm') return can('can_view_pdm')
    return true
  })

  // Auto-expand Configurações when any child route is active
  const isInsideConfig =
    pathname.startsWith('/settings/') ||
    pathname.startsWith('/admin/users') ||
    pathname.startsWith('/admin/roles') ||
    pathname.startsWith('/admin/fields') ||
    pathname.startsWith('/admin/logs') ||
    pathname.startsWith('/admin/tenants')
  const [configExpanded, setConfigExpanded] = useState(isInsideConfig)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isInsideConfig) setConfigExpanded(true)
  }, [isInsideConfig])

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
        {visibleNavLinks.map((item) => (
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

              {/* ── Meu Perfil (always) + Workflows (by permission) ── */}
              {CONFIG_BASE.filter((item) =>
                item.href === '/settings/profile' ||
                (item.href === '/settings/workflow' && can('can_view_workflows'))
              ).map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
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

              {/* ── ADMIN items (driven by granular permissions) ── */}
              {(() => {
                const adminItems = [
                  ...CONFIG_ADMIN.filter((item) => {
                    if (user?.is_master) return true
                    if (item.href === '/admin/users') return can('can_manage_users')
                    if (item.href === '/admin/roles') return can('can_manage_roles')
                    if (item.href === '/admin/fields') return can('can_manage_fields')
                    if (item.href === '/admin/logs') return can('can_view_logs')
                    return false
                  }),
                  ...(user?.is_master ? [{ href: '/admin/tenants', label: 'Tenants', icon: Building2 }] as const : []),
                ]
                if (adminItems.length === 0) return null
                return (
                <>
                  {/* Thin divider to visually separate admin items */}
                  <div
                    className="mx-3 my-1 h-px"
                    style={{ backgroundColor: 'var(--sidebar-border)' }}
                  />
                  <p
                    className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--sidebar-icon)', opacity: 0.6 }}
                  >
                    Administração
                  </p>
                  {adminItems.map((item: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href)
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
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
                        <Icon className="size-4 shrink-0" style={{ color: 'var(--sidebar-icon)' }} />
                        {item.label}
                      </Link>
                    )
                  })}
                </>
                )
              })()}

            </div>
          </CollapsibleContent>
        </Collapsible>
      </nav>

      {/* Bottom bar: user chip + theme toggle + logout */}
      <div className="shrink-0 border-t p-3 space-y-1" style={{ borderColor: 'var(--sidebar-border)' }}>
        {/* Logged-in user chip */}
        {user && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 mb-1"
            style={{ backgroundColor: 'var(--sidebar-hover-bg)' }}
          >
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{ backgroundColor: 'var(--sidebar-icon)', color: 'var(--sidebar-bg)' }}
            >
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold leading-none" style={{ color: 'var(--sidebar-text)' }}>
                {user.name}
              </p>
              <p className="truncate text-[10px] leading-none mt-0.5" style={{ color: 'var(--sidebar-text)', opacity: 0.55 }}>
                {user.role_name}
              </p>
            </div>
          </div>
        )}

        {/* Theme toggle */}
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

        {/* Logout */}
        {user && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 transition-colors"
            style={{ color: 'var(--sidebar-text)' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--sidebar-hover-bg)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={logout}
          >
            <LogOut className="size-4 shrink-0" style={{ color: 'var(--sidebar-icon)' }} />
            <span className="text-sm font-medium">Sair</span>
          </Button>
        )}
      </div>
    </aside>
  )
}
