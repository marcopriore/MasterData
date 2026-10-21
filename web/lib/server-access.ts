import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { mergeRolePermissions, type RolePermissions } from '@/lib/permissions'

export type CallerAccess = {
  userId: string
  isMaster: boolean
  tenantId: number
  permissions: RolePermissions
}

type PermissionsEmbed = { permissions?: Partial<RolePermissions> } | { permissions?: Partial<RolePermissions> }[] | null

function permissionsOf(value: PermissionsEmbed) {
  const row = Array.isArray(value) ? value[0] : value
  return { permissions: row?.permissions ?? null }
}

/** Usuário da sessão, tenant efetivo (Master usa o tenant para o qual trocou) e permissões efetivas. */
export async function getCallerAccess(): Promise<CallerAccess | { error: NextResponse }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, is_active, roles!users_role_id_fkey(permissions)')
    .eq('id', user.id)
    .single()
  if (!profile || profile.is_active === false) {
    return { error: NextResponse.json({ error: 'Usuário sem acesso.' }, { status: 403 }) }
  }

  const isMaster = user.app_metadata?.is_master === true
  const tenantId = Number(isMaster ? user.app_metadata?.tenant_id ?? profile.tenant_id : profile.tenant_id)
  if (!Number.isFinite(tenantId)) return { error: NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 }) }

  const { data: memberships } = await supabase.from('user_role_groups').select('roles(permissions)').eq('user_id', user.id)
  const groups = memberships?.length
    ? memberships.map((row) => permissionsOf(row.roles as PermissionsEmbed))
    : [permissionsOf(profile.roles as PermissionsEmbed)]
  const { data: grants } = await supabase.from('user_permission_grants').select('permission_key').eq('user_id', user.id)
  const permissions = mergeRolePermissions(groups, (grants ?? []).map((grant) => grant.permission_key as string))

  return { userId: user.id, isMaster, tenantId, permissions }
}
