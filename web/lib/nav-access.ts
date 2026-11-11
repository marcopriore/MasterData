import type { RolePermissions } from '@/lib/permissions'

/** Quem está logado, já com as flags efetivas (união dos grupos + extras). */
export type NavAccess = {
  isMaster: boolean
  permissions: RolePermissions
}

/** Itens do menu principal. */
export function canSeeMainNav(href: string, access: NavAccess): boolean {
  if (access.isMaster) return true
  if (href === '/') return true
  if (href === '/support') return true
  if (href === '/requests') return access.permissions.can_submit_request || access.permissions.can_attend
  if (href === '/governance') return access.permissions.can_approve || access.permissions.can_reject || access.permissions.can_attend
  if (href === '/database') return access.permissions.can_view_database
  if (href === '/admin-pdm') return access.permissions.can_view_pdm
  if (href === '/reports') return access.permissions.can_view_reports
  return true
}

/** Itens de Configurações que não são administração. */
export function canSeeSettingsHref(href: string, access: NavAccess): boolean {
  if (href === '/settings/profile') return true
  if (href === '/settings/workflow') return access.isMaster || access.permissions.can_view_workflows
  return false
}

/** Itens de Administração. Tenants só para Master. */
export function canSeeAdminHref(href: string, access: NavAccess): boolean {
  if (href === '/admin/tenants') return access.isMaster
  if (access.isMaster) return true
  if (href === '/admin/users') return access.permissions.can_manage_users
  if (href === '/admin/roles') return access.permissions.can_manage_roles
  if (href === '/admin/fields') return access.permissions.can_manage_fields
  if (href === '/admin/value-dictionary') return access.permissions.can_manage_value_dictionary
  if (href === '/admin/logs') return access.permissions.can_view_logs
  if (href === '/admin/integrations') return access.permissions.can_view_logs
  if (href === '/admin/integration-docs') return access.permissions.can_view_logs
  return false
}

/**
 * Quem pode abrir a tela pelo endereço (link colado, favorito). Mesma regra do menu: tela que não
 * aparece no menu também não abre. As ações dentro da tela pedem a permissão de editar, e o banco
 * e o servidor recusam de novo.
 */
export function canOpenPath(pathname: string, access: NavAccess): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  const under = (base: string) => p === base || p.startsWith(`${base}/`)
  // Restos de desenvolvimento e administração de tenants: só Master.
  if (under('/products') || under('/teste') || under('/admin/tenants')) return access.isMaster
  if (access.isMaster) return true
  const perms = access.permissions
  if (p === '/' || under('/support') || under('/settings/profile') || under('/login') || under('/reset-password')) return true
  if (under('/requests/new') || under('/requests/alteracao') || (under('/request') && !under('/requests'))) return perms.can_submit_request
  if (under('/requests')) return perms.can_submit_request || perms.can_attend
  if (under('/governance')) return perms.can_approve || perms.can_reject || perms.can_attend
  if (under('/database')) return perms.can_view_database
  if (under('/admin-pdm/novo')) return perms.can_edit_pdm
  if (under('/admin-pdm')) return perms.can_view_pdm || perms.can_edit_pdm
  if (under('/reports')) return perms.can_view_reports
  if (under('/settings/workflow')) return perms.can_view_workflows || perms.can_edit_workflows
  if (under('/activity')) return perms.can_view_logs
  if (under('/admin')) return canSeeAdminHref(['/admin/users', '/admin/roles', '/admin/fields', '/admin/value-dictionary', '/admin/logs', '/admin/integrations', '/admin/integration-docs'].find((h) => under(h)) ?? p, access)
  // Tela nova sem regra aqui fica fechada até alguém decidir quem abre.
  return false
}

/** Atalhos da tela inicial. Gestão de PDMs exige editar, não só visualizar. */
export function canSeeHomeShortcut(href: string, access: NavAccess): boolean {
  if (href === '/admin-pdm') return access.isMaster || access.permissions.can_edit_pdm
  if (href === '/governance') return access.isMaster || access.permissions.can_approve || access.permissions.can_reject
  if (href === '/settings/workflow') return access.isMaster || access.permissions.can_view_workflows
  if (href === '/requests/new') return access.isMaster || access.permissions.can_submit_request
  return false
}
