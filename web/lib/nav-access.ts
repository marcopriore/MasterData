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
  if (href === '/request') return access.permissions.can_submit_request
  if (href === '/governance') return access.permissions.can_approve || access.permissions.can_reject
  if (href === '/database') return access.permissions.can_view_database
  if (href === '/admin-pdm') return access.permissions.can_view_pdm
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
  return false
}

/** Atalhos da tela inicial. Gestão de PDMs exige editar, não só visualizar. */
export function canSeeHomeShortcut(href: string, access: NavAccess): boolean {
  if (href === '/admin-pdm') return access.isMaster || access.permissions.can_edit_pdm
  if (href === '/governance') return access.isMaster || access.permissions.can_approve || access.permissions.can_reject
  if (href === '/settings/workflow') return access.isMaster || access.permissions.can_view_workflows
  if (href === '/request') return access.isMaster || access.permissions.can_submit_request
  return false
}
