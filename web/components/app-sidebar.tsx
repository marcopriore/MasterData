'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import {
  ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight,
  Home, FileText, ShieldCheck, Database, LayoutGrid, Headphones, BarChart3,
  Settings, GitBranch, Sun, Moon,
  UserCircle, Users, ShieldHalf, BookOpen, BookMarked, LogOut, ScrollText, Building2, Plug, FileCode2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useUser } from '@/contexts/user-context'
import { mergeRolePermissions } from '@/lib/permissions'
import { canSeeAdminHref, canSeeMainNav, canSeeSettingsHref } from '@/lib/nav-access'

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties }>
type NavItem = { href: string; label: string; icon: IconType }

const navLinks: NavItem[] = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/requests', label: 'Minhas Solicitações', icon: FileText },
  { href: '/governance', label: 'Governança', icon: ShieldCheck },
  { href: '/database', label: 'Base de Dados', icon: Database },
  { href: '/admin-pdm', label: 'Gestão PDM', icon: LayoutGrid },
  { href: '/reports', label: 'Relatórios', icon: BarChart3 },
  { href: '/support', label: 'Suporte', icon: Headphones },
]

// Items always visible inside Configurações
const CONFIG_BASE: NavItem[] = [
  { href: '/settings/profile', label: 'Meu Perfil', icon: UserCircle },
  { href: '/settings/workflow', label: 'Workflows', icon: GitBranch },
]

// Items visible only to ADMIN role
const CONFIG_ADMIN: NavItem[] = [
  { href: '/admin/users', label: 'Gestão de Usuários', icon: Users },
  { href: '/admin/roles', label: 'Grupos de perfil', icon: ShieldHalf },
  { href: '/admin/fields', label: 'Dicionário de Campos', icon: BookOpen },
  { href: '/admin/value-dictionary', label: 'Dicionário de Valores', icon: BookMarked },
  { href: '/admin/logs', label: 'Log do Sistema', icon: ScrollText },
  { href: '/admin/integrations', label: 'Monitor de integrações', icon: Plug },
  { href: '/admin/integration-docs', label: 'Documentação de integrações', icon: FileCode2 },
]

const hoverOn = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = 'var(--sidebar-hover-bg)' }
const hoverOff = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = 'transparent' }

function NavLink({ href, label, icon: Icon, collapsed }: NavItem & { collapsed: boolean }) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== '/' && pathname.startsWith(href))
  const link = (
    <Link
      href={href}
      prefetch={false}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'flex items-center rounded-lg text-sm leading-tight transition-colors',
        collapsed ? 'mx-auto size-10 justify-center' : 'gap-3 px-3 py-2'
      )}
      style={{
        color: 'var(--sidebar-text)',
        fontWeight: isActive ? 600 : 500,
        backgroundColor: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
      }}
      onMouseEnter={(e) => { if (!isActive) hoverOn(e) }}
      onMouseLeave={(e) => { if (!isActive) hoverOff(e) }}
    >
      <Icon className="size-4 shrink-0" style={{ color: 'var(--sidebar-icon)' }} />
      {!collapsed && <span className="min-w-0 break-words">{label}</span>}
    </Link>
  )
  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function SidebarAction({
  collapsed,
  label,
  icon,
  onClick,
}: {
  collapsed: boolean
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex w-full items-center rounded-lg text-sm font-medium transition-colors',
        collapsed ? 'mx-auto size-10 justify-center' : 'gap-3 px-3 py-2'
      )}
      style={{ color: 'var(--sidebar-text)' }}
      onMouseEnter={hoverOn}
      onMouseLeave={hoverOff}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </button>
  )
  if (!collapsed) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function AppSidebar({ collapsed, onToggleCollapsed }: { collapsed: boolean; onToggleCollapsed: () => void }) {
  const pathname = usePathname()
  const { setTheme, resolvedTheme } = useTheme()
  const { user, logout } = useUser()
  const [mounted, setMounted] = useState(false)

  const access = {
    isMaster: user?.is_master === true,
    permissions: user?.role_permissions ?? mergeRolePermissions([], []),
  }

  const visibleNavLinks = navLinks.filter((item) => canSeeMainNav(item.href, access))
  const configItems = CONFIG_BASE.filter((item) => canSeeSettingsHref(item.href, access))
  const adminItems: NavItem[] = [
    ...CONFIG_ADMIN.filter((item) => canSeeAdminHref(item.href, access)),
    ...(user?.is_master ? [{ href: '/admin/tenants', label: 'Tenants', icon: Building2 }] : []),
  ]

  // Auto-expand Configurações when any child route is active
  const isInsideConfig =
    pathname.startsWith('/settings/') ||
    [...CONFIG_ADMIN, { href: '/admin/tenants' }].some((item) => pathname.startsWith(item.href))
  const [configExpanded, setConfigExpanded] = useState(isInsideConfig)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isInsideConfig) setConfigExpanded(true)
  }, [isInsideConfig])

  const isDark = mounted && resolvedTheme === 'dark'
  const iconStyle = { color: 'var(--sidebar-icon)' }

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className="fixed left-0 top-0 z-40 hidden h-screen w-[var(--nav-width)] flex-col overflow-hidden border-r transition-[width] duration-200 md:flex"
        style={{ backgroundColor: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}
      >
        {/* Logo */}
        <div
          className={cn('flex h-14 shrink-0 items-center gap-2 border-b', collapsed ? 'justify-center px-2' : 'px-4')}
          style={{ borderColor: 'var(--sidebar-border)' }}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0F1C38] text-white">
            <Database className="size-4" />
          </div>
          {!collapsed && (
            <span className="text-sm font-bold" style={{ color: 'var(--sidebar-text)' }}>
              PRO-MAT
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className={cn('flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden', collapsed ? 'px-2 py-3' : 'p-3')}>
          {visibleNavLinks.map((item) => (
            <NavLink key={item.href} {...item} collapsed={collapsed} />
          ))}

          {collapsed ? (
            <>
              <div className="mx-2 my-2 h-px" style={{ backgroundColor: 'var(--sidebar-border)' }} />
              {[...configItems, ...adminItems].map((item) => (
                <NavLink key={item.href} {...item} collapsed />
              ))}
            </>
          ) : (
            <Collapsible open={configExpanded} onOpenChange={setConfigExpanded} className="mt-2">
              <CollapsibleTrigger
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                style={{ color: 'var(--sidebar-text)' }}
                onMouseEnter={hoverOn}
                onMouseLeave={hoverOff}
              >
                <div className="flex items-center gap-3">
                  <Settings className="size-4 shrink-0" style={iconStyle} />
                  Configurações
                </div>
                {configExpanded ? (
                  <ChevronDown className="size-4 shrink-0" style={iconStyle} />
                ) : (
                  <ChevronRight className="size-4 shrink-0" style={iconStyle} />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 flex flex-col gap-0.5 pl-3">
                  {configItems.map((item) => (
                    <NavLink key={item.href} {...item} collapsed={false} />
                  ))}
                  {adminItems.length > 0 && (
                    <>
                      <div className="mx-3 my-1 h-px" style={{ backgroundColor: 'var(--sidebar-border)' }} />
                      <p
                        className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--sidebar-icon)', opacity: 0.6 }}
                      >
                        Administração
                      </p>
                      {adminItems.map((item) => (
                        <NavLink key={item.href} {...item} collapsed={false} />
                      ))}
                    </>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </nav>

        {/* Bottom bar: user chip + theme toggle + logout + recolher */}
        <div className={cn('shrink-0 space-y-1 border-t', collapsed ? 'px-2 py-3' : 'p-3')} style={{ borderColor: 'var(--sidebar-border)' }}>
          {user && (
            collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="mx-auto mb-1 flex size-8 items-center justify-center rounded-full text-xs font-bold"
                    style={{ backgroundColor: 'var(--sidebar-icon)', color: 'var(--sidebar-bg)' }}
                  >
                    {user.name.slice(0, 2).toUpperCase()}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {user.name}
                  {user.role_name ? ` · ${user.role_name}` : ''}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="mb-1 flex items-center gap-2 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--sidebar-hover-bg)' }}>
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
                  <p className="mt-0.5 truncate text-[10px] leading-none" style={{ color: 'var(--sidebar-text)', opacity: 0.55 }}>
                    {user.role_name}
                  </p>
                </div>
              </div>
            )
          )}

          <SidebarAction
            collapsed={collapsed}
            label={mounted ? (isDark ? 'Modo Escuro' : 'Modo Claro') : 'Tema'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            icon={
              mounted && isDark ? (
                <Sun className="size-4 shrink-0" style={iconStyle} />
              ) : (
                <Moon className={cn('size-4 shrink-0', !mounted && 'opacity-50')} style={iconStyle} />
              )
            }
          />

          {user && (
            <SidebarAction
              collapsed={collapsed}
              label="Sair"
              onClick={() => { void logout() }}
              icon={<LogOut className="size-4 shrink-0" style={iconStyle} />}
            />
          )}

          <SidebarAction
            collapsed={collapsed}
            label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            onClick={onToggleCollapsed}
            icon={
              collapsed ? (
                <ChevronsRight className="size-4 shrink-0" style={iconStyle} />
              ) : (
                <ChevronsLeft className="size-4 shrink-0" style={iconStyle} />
              )
            }
          />
        </div>
      </aside>
    </TooltipProvider>
  )
}
