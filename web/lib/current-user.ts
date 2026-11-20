import type { SupabaseClient } from '@supabase/supabase-js'
import { allPermissions, emptyPermissions, mergeRolePermissions, type RolePermissions } from '@/lib/permissions'

/**
 * Usuário logado (perfil, empresa efetiva e permissões efetivas), montado do mesmo jeito no servidor
 * (layout) e no navegador (login). Uma ida ao banco: as consultas não dependem umas das outras.
 */

export type UserPreferences = {
  theme: 'light' | 'dark'
  language: 'pt' | 'en'
}

export type CurrentUser = {
  id: string
  name: string
  email: string
  role_id: number
  role_name: string
  role_type?: 'sistema' | 'etapa' | 'operacional'
  role_permissions: RolePermissions
  is_active: boolean
  preferences: UserPreferences
  created_at: string | null
  tenant_id?: number
  tenant_name?: string
  is_master?: boolean
  has_admin_group?: boolean
  max_description_length?: number
}

/** Quem está na sessão. Quem chama garante que o token foi validado (servidor) ou vem da sessão local (navegador). */
export type SessionIdentity = {
  id: string
  email: string
  isMaster: boolean
  /** Empresa do token: o Master troca de empresa por ela (o banco usa a mesma em get_user_tenant_id). */
  tokenTenantId: number | null
}

type ProfileRow = {
  id: string
  tenant_id: number
  name: string
  role_id: number
  is_active: boolean
  preferences: { theme?: string; language?: string } | null
  max_description_length: number | null
  created_at: string | null
  roles: { name: string; role_type: string; permissions: Partial<RolePermissions> } | null
  tenants: { name: string } | null
}

type GroupRole = { name?: string; permissions?: Partial<RolePermissions> | null }
type GroupRow = { roles: GroupRole | GroupRole[] | null }

export function identityFromMetadata(
  id: string,
  email: string | undefined,
  appMetadata: Record<string, unknown> | undefined
): SessionIdentity {
  const tokenTenant = Number(appMetadata?.tenant_id)
  return {
    id,
    email: email ?? '',
    isMaster: appMetadata?.is_master === true,
    tokenTenantId: Number.isInteger(tokenTenant) ? tokenTenant : null,
  }
}

export function buildCurrentUser(
  identity: SessionIdentity,
  profile: ProfileRow,
  groups: GroupRow[],
  grantKeys: string[],
  tokenTenantName: string | null
): CurrentUser {
  const groupRoles = groups.map((row) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles
    return { name: role?.name ?? '', permissions: role?.permissions ?? null }
  })
  const permissions: RolePermissions = identity.isMaster
    ? allPermissions()
    : groupRoles.length
      ? mergeRolePermissions(groupRoles, grantKeys)
      : { ...emptyPermissions(), ...(profile.roles?.permissions ?? {}) }
  const roleName = profile.roles?.name ?? ''
  const switched = identity.isMaster && identity.tokenTenantId !== null && identity.tokenTenantId !== profile.tenant_id

  return {
    id: profile.id,
    name: profile.name,
    email: identity.email,
    role_id: profile.role_id,
    role_name: roleName,
    role_type: (profile.roles?.role_type as CurrentUser['role_type']) ?? 'sistema',
    role_permissions: permissions,
    is_active: profile.is_active,
    preferences: {
      theme: profile.preferences?.theme === 'dark' ? 'dark' : 'light',
      language: profile.preferences?.language === 'en' ? 'en' : 'pt',
    },
    created_at: profile.created_at,
    tenant_id: switched ? identity.tokenTenantId! : profile.tenant_id,
    tenant_name: (switched ? tokenTenantName : null) ?? profile.tenants?.name ?? undefined,
    is_master: identity.isMaster,
    has_admin_group: groupRoles.some((group) => group.name.toUpperCase() === 'ADMIN') || roleName.toUpperCase() === 'ADMIN',
    max_description_length: profile.max_description_length ?? 40,
  }
}

/** null quando o perfil não existe ou não pôde ser lido. */
export async function loadCurrentUser(supabase: SupabaseClient, identity: SessionIdentity): Promise<CurrentUser | null> {
  const readsTokenTenant = identity.isMaster && identity.tokenTenantId !== null
  const [profile, groups, grants, tokenTenant] = await Promise.all([
    supabase
      .from('users')
      .select('id, tenant_id, name, role_id, is_active, preferences, max_description_length, created_at, roles!users_role_id_fkey(name, role_type, permissions), tenants(name)')
      .eq('id', identity.id)
      .single(),
    supabase.from('user_role_groups').select('roles(name, permissions)').eq('user_id', identity.id),
    supabase.from('user_permission_grants').select('permission_key').eq('user_id', identity.id),
    readsTokenTenant
      ? supabase.from('tenants').select('name').eq('id', identity.tokenTenantId!).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (profile.error || !profile.data) return null

  return buildCurrentUser(
    identity,
    profile.data as unknown as ProfileRow,
    (groups.data ?? []) as unknown as GroupRow[],
    (grants.data ?? []).map((row) => row.permission_key as string),
    (tokenTenant.data as { name?: string } | null)?.name ?? null
  )
}
