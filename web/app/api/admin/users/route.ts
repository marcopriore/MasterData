import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { callerCanManageUsers, syncUserAccess } from '@/lib/user-access'
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
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const isMaster = (user.app_metadata?.is_master as boolean) ?? false
  const access = await callerCanManageUsers(supabase, user.id, isMaster)
  if (!access.allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const effectiveTenantId = isMaster
    ? ((user.app_metadata?.tenant_id as number) ?? access.tenantId)
    : access.tenantId
  let q = supabaseAdmin.from('users').select(`
    id,
    name,
    tenant_id,
    role_id,
    is_active,
    roles!users_role_id_fkey(id, name),
    tenants(id, name)
  `).order('created_at', { ascending: false })

  if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId)
  const { data: users, error: usersError } = await q
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 })

  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()
  const emailMap: Record<string, string> = {}
  for (const au of authUsers?.users ?? []) {
    if (au.email) emailMap[au.id] = au.email
  }

  const userIds = (users ?? []).map((u) => u.id)
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
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const isMaster = (user.app_metadata?.is_master as boolean) ?? false
  const access = await callerCanManageUsers(supabase, user.id, isMaster)
  if (!access.allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const effectiveTenantId = isMaster
    ? ((user.app_metadata?.tenant_id as number) ?? access.tenantId)
    : access.tenantId

  const body = await request.json()
  const { email, password, name, tenant_id, role_id } = body
  if (!email || !password || !name || !role_id) {
    return NextResponse.json({ error: 'Campos obrigatórios: email, password, name, role_id' }, { status: 400 })
  }

  const tenantId = tenant_id != null ? Number(tenant_id) : effectiveTenantId
  const roleId = Number(role_id)
  if (!tenantId) return NextResponse.json({ error: 'tenant_id é obrigatório' }, { status: 400 })
  if (!isMaster && access.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Sem permissão para criar usuário em outro tenant' }, { status: 403 })
  }

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
