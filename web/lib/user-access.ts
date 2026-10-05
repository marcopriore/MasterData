import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  isPermissionKey,
  keysCoveredByGroups,
  mergeRolePermissions,
  type PermissionKey,
  type RolePermissions,
} from '@/lib/permissions'

type GroupRow = { id: number; name: string; permissions: Partial<RolePermissions> | null; tenant_id: number }

export async function callerCanManageUsers(
  supabase: { from: (table: string) => any },
  userId: string,
  isMaster: boolean
): Promise<{ allowed: boolean; tenantId: number | null }> {
  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, roles!users_role_id_fkey(name, permissions)')
    .eq('id', userId)
    .single()

  const tenantId = (profile?.tenant_id as number | null) ?? null
  if (isMaster) return { allowed: true, tenantId }

  const { data: memberships, error } = await supabase
    .from('user_role_groups')
    .select('roles(permissions)')
    .eq('user_id', userId)

  const groups = !error && memberships?.length
    ? memberships.map((row: { roles: { permissions?: Partial<RolePermissions> } | { permissions?: Partial<RolePermissions> }[] | null }) => {
        const role = Array.isArray(row.roles) ? row.roles[0] : row.roles
        return { permissions: role?.permissions ?? null }
      })
    : [{ permissions: (Array.isArray(profile?.roles) ? profile.roles[0] : profile?.roles)?.permissions ?? null }]

  const { data: grants } = await supabase
    .from('user_permission_grants')
    .select('permission_key')
    .eq('user_id', userId)

  const perms = mergeRolePermissions(
    groups,
    (grants ?? []).map((g: { permission_key: string }) => g.permission_key)
  )
  return { allowed: perms.can_manage_users, tenantId }
}

/** Decide o que gravar: grupos válidos e só os extras que nenhum grupo já cobre. */
export function planUserAccess(params: {
  tenantId: number
  groupIds: number[]
  stageRoleId: number
  grantKeys: string[]
  roles: GroupRow[]
}): { error?: string; groupIds: number[]; extras: PermissionKey[] } {
  const uniqueIds = [...new Set(params.groupIds.map(Number))].filter((id) => Number.isFinite(id))
  if (uniqueIds.length === 0) {
    return { error: 'Selecione ao menos um grupo de perfil.', groupIds: [], extras: [] }
  }
  if (!uniqueIds.includes(params.stageRoleId)) {
    return { error: 'O papel de etapa precisa ser um dos grupos marcados.', groupIds: [], extras: [] }
  }
  if (params.roles.length !== uniqueIds.length) {
    return { error: 'Grupo de perfil inválido.', groupIds: [], extras: [] }
  }
  if (params.roles.some((role) => role.tenant_id !== params.tenantId)) {
    return { error: 'Grupo pertence a outro tenant.', groupIds: [], extras: [] }
  }

  const covered = keysCoveredByGroups(params.roles)
  const extras = [...new Set(params.grantKeys)]
    .filter(isPermissionKey)
    .filter((key) => !covered.has(key))
  return { groupIds: uniqueIds, extras }
}

export async function syncUserAccess(params: {
  userId: string
  tenantId: number
  groupIds: number[]
  stageRoleId: number
  grantKeys: string[]
}): Promise<{ error?: string }> {
  const uniqueIds = [...new Set(params.groupIds.map(Number))].filter((id) => Number.isFinite(id))
  if (uniqueIds.length === 0) return { error: 'Selecione ao menos um grupo de perfil.' }

  const { data: roles, error: rolesError } = await supabaseAdmin
    .from('roles')
    .select('id, name, permissions, tenant_id')
    .in('id', uniqueIds)

  if (rolesError) return { error: rolesError.message }
  const plan = planUserAccess({
    tenantId: params.tenantId,
    groupIds: uniqueIds,
    stageRoleId: params.stageRoleId,
    grantKeys: params.grantKeys,
    roles: (roles ?? []) as GroupRow[],
  })
  if (plan.error) return { error: plan.error }
  const extras = plan.extras

  const { error: clearGroups } = await supabaseAdmin
    .from('user_role_groups')
    .delete()
    .eq('user_id', params.userId)
  if (clearGroups) return { error: clearGroups.message }

  const { error: insertGroups } = await supabaseAdmin
    .from('user_role_groups')
    .insert(plan.groupIds.map((role_id) => ({ user_id: params.userId, role_id })))
  if (insertGroups) return { error: insertGroups.message }

  const { error: clearGrants } = await supabaseAdmin
    .from('user_permission_grants')
    .delete()
    .eq('user_id', params.userId)
  if (clearGrants) return { error: clearGrants.message }

  if (extras.length > 0) {
    const { error: insertGrants } = await supabaseAdmin
      .from('user_permission_grants')
      .insert(extras.map((permission_key: PermissionKey) => ({ user_id: params.userId, permission_key })))
    if (insertGrants) return { error: insertGrants.message }
  }

  return {}
}
