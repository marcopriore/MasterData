import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { allPermissions, mergeRolePermissions, type PermissionKey, type RolePermissions } from '@/lib/permissions'

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

/**
 * Usuário da sessão, tenant efetivo (Master usa o tenant para o qual trocou) e permissões efetivas.
 * getClaims valida a assinatura e a validade do token com as chaves públicas do projeto, sem ida ao Auth:
 * o mesmo critério do banco (RLS) e do proxy.ts. Inativo é barrado pelo perfil, lido a cada chamada.
 */
export async function getCallerAccess(): Promise<CallerAccess | { error: NextResponse }> {
  const supabase = await createServerSupabaseClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  if (!claims?.sub) return { error: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  const userId = claims.sub
  const meta = (claims.app_metadata ?? {}) as { is_master?: boolean; tenant_id?: number | string }

  const [{ data: profile }, { data: memberships }, { data: grants }] = await Promise.all([
    supabase
      .from('users')
      .select('tenant_id, is_active, roles!users_role_id_fkey(permissions)')
      .eq('id', userId)
      .single(),
    supabase.from('user_role_groups').select('roles(permissions)').eq('user_id', userId),
    supabase.from('user_permission_grants').select('permission_key').eq('user_id', userId),
  ])
  if (!profile || profile.is_active === false) {
    return { error: NextResponse.json({ error: 'Usuário sem acesso.' }, { status: 403 }) }
  }

  const isMaster = meta.is_master === true
  const tenantId = Number(isMaster ? meta.tenant_id ?? profile.tenant_id : profile.tenant_id)
  if (!Number.isFinite(tenantId)) return { error: NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 }) }
  if (isMaster) return { userId, isMaster, tenantId, permissions: allPermissions() }

  const groups = memberships?.length
    ? memberships.map((row) => permissionsOf(row.roles as PermissionsEmbed))
    : [permissionsOf(profile.roles as PermissionsEmbed)]
  const permissions = mergeRolePermissions(groups, (grants ?? []).map((grant) => grant.permission_key as string))

  return { userId, isMaster, tenantId, permissions }
}

/** getCallerAccess + exige ao menos uma das permissões (Master sempre passa). */
export async function requirePermission(
  ...keys: PermissionKey[]
): Promise<CallerAccess | { error: NextResponse }> {
  const ctx = await getCallerAccess()
  if ('error' in ctx) return ctx
  if (keys.length && !keys.some((key) => ctx.permissions[key])) {
    return { error: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  }
  return ctx
}
