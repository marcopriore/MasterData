import { supabaseAdmin } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/server-access'
import { authEmailsById } from '@/lib/auth-emails'
import { passwordProblem } from '@/lib/password-policy'
import { syncUserAccess } from '@/lib/user-access'
import { NextResponse } from 'next/server'

async function insertLog(params: {
  tenant_id: number
  user_id: string
  category: string
  action: string
  description: string
  event_data?: Record<string, unknown>
}) {
  try {
    const { error } = await supabaseAdmin.from('system_logs').insert({
      tenant_id: params.tenant_id,
      user_id: params.user_id,
      category: params.category,
      action: params.action,
      description: params.description.slice(0, 500),
      event_data: params.event_data ?? null,
    })
    if (error) console.error('[insertLog]', error.message, params)
  } catch (e) {
    console.error('[insertLog]', e, params)
  }
}

export async function GET() {
  const ctx = await requirePermission('can_manage_users')
  if ('error' in ctx) return ctx.error

  const { data: users, error: usersError } = await supabaseAdmin.from('users').select(`
    id,
    name,
    tenant_id,
    role_id,
    is_active,
    roles!users_role_id_fkey(id, name),
    tenants(id, name)
  `).eq('tenant_id', ctx.tenantId).order('created_at', { ascending: false })
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 })

  const userIds = (users ?? []).map((u) => u.id)
  const emailMap = await authEmailsById(userIds)
  const groupMap: Record<string, { id: number; name: string }[]> = {}
  const grantMap: Record<string, string[]> = {}
  if (userIds.length > 0) {
    const { data: links } = await supabaseAdmin
      .from('user_role_groups')
      .select('user_id, role_id, roles(id, name)')
      .in('user_id', userIds)
    for (const link of links ?? []) {
      const role = Array.isArray(link.roles) ? link.roles[0] : link.roles
      const name = (role as { name?: string } | null)?.name
      const id = (role as { id?: number } | null)?.id ?? link.role_id
      if (!name || id == null) continue
      groupMap[link.user_id] = [...(groupMap[link.user_id] ?? []), { id, name }]
    }
    const { data: grants } = await supabaseAdmin
      .from('user_permission_grants')
      .select('user_id, permission_key')
      .in('user_id', userIds)
    for (const grant of grants ?? []) {
      grantMap[grant.user_id] = [...(grantMap[grant.user_id] ?? []), grant.permission_key]
    }
  }

  const result = (users ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    email: emailMap[u.id] ?? '',
    tenant_id: u.tenant_id,
    role_id: u.role_id,
    is_active: u.is_active,
    roles: u.roles,
    tenants: u.tenants,
    group_ids: (groupMap[u.id] ?? []).map((g) => g.id),
    group_names: (groupMap[u.id] ?? []).map((g) => g.name),
    permission_grants: grantMap[u.id] ?? [],
  }))
  return NextResponse.json(result)
}

export async function POST(request: Request) {
  const ctx = await requirePermission('can_manage_users')
  if ('error' in ctx) return ctx.error
  const user = { id: ctx.userId }

  const body = await request.json()
  const { email, password, name, role_id } = body
  if (!email || !password || !name || !role_id) {
    return NextResponse.json({ error: 'Campos obrigatórios: email, password, name, role_id' }, { status: 400 })
  }
  const weak = passwordProblem(String(password))
  if (weak) return NextResponse.json({ error: weak }, { status: 400 })

  // Sempre no tenant em uso; o Master troca de tenant para cadastrar em outro.
  const tenantId = ctx.tenantId
  const roleId = Number(role_id)
  const { data: role } = await supabaseAdmin.from('roles').select('id').eq('id', roleId).eq('tenant_id', tenantId).maybeSingle()
  if (!role) return NextResponse.json({ error: 'Perfil não pertence a esta empresa' }, { status: 400 })

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: String(email).trim().toLowerCase(),
    password: String(password),
    email_confirm: true,
    app_metadata: { tenant_id: tenantId },
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  const { data: profileRow, error: profileError } = await supabaseAdmin
    .from('users')
    .insert({
      id: authUser.user.id,
      tenant_id: tenantId,
      name: String(name).trim(),
      role_id: roleId,
    })
    .select('*, roles!users_role_id_fkey(id, name), tenants(id, name)')
    .single()
  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  const groupIds = Array.isArray(body.group_ids) && body.group_ids.length
    ? body.group_ids.map(Number)
    : [roleId]
  const stageRoleId = groupIds.includes(roleId) ? roleId : groupIds[0]
  if (stageRoleId !== roleId) {
    await supabaseAdmin.from('users').update({ role_id: stageRoleId }).eq('id', authUser.user.id)
  }
  const synced = await syncUserAccess({
    userId: authUser.user.id,
    tenantId,
    groupIds,
    stageRoleId,
    grantKeys: Array.isArray(body.permission_grants) ? body.permission_grants.map(String) : [],
  })
  if (synced.error) {
    await supabaseAdmin.from('users').delete().eq('id', authUser.user.id)
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: synced.error }, { status: 400 })
  }

  await insertLog({
    tenant_id: tenantId,
    user_id: user.id,
    category: 'users',
    action: 'user_created',
    description: `Usuário "${name}" criado (${email})`,
    event_data: { email, role_id: roleId, tenant_id: tenantId },
  })

  return NextResponse.json({
    id: profileRow.id,
    name: profileRow.name,
    email: authUser.user.email,
    tenant_id: profileRow.tenant_id,
    role_id: stageRoleId,
    is_active: profileRow.is_active,
    roles: profileRow.roles,
    tenants: profileRow.tenants,
    group_ids: groupIds,
    permission_grants: Array.isArray(body.permission_grants) ? body.permission_grants : [],
  })
}
