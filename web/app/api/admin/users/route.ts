import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, role_id, roles(name)').eq('id', user.id).single()
  const roleName = (profile?.roles as { name?: string })?.name?.toUpperCase() ?? ''
  const isMaster = (user.app_metadata?.is_master as boolean) ?? false
  const canManage = roleName === 'ADMIN' || roleName === 'MASTER' || isMaster
  if (!canManage) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const effectiveTenantId = isMaster
    ? ((user.app_metadata?.tenant_id as number) ?? profile?.tenant_id)
    : profile?.tenant_id
  let q = supabaseAdmin.from('users').select(`
    id,
    name,
    tenant_id,
    role_id,
    is_active,
    roles(id, name),
    tenants(id, name)
  `).order('created_at', { ascending: false })

  if (!isMaster && effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId)
  const { data: users, error: usersError } = await q
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 })

  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()
  const emailMap: Record<string, string> = {}
  for (const au of authUsers?.users ?? []) {
    if (au.email) emailMap[au.id] = au.email
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
  }))
  return NextResponse.json(result)
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, roles(name)').eq('id', user.id).single()
  const roleName = (profile?.roles as { name?: string })?.name?.toUpperCase() ?? ''
  const isMaster = (user.app_metadata?.is_master as boolean) ?? false
  const canManage = roleName === 'ADMIN' || roleName === 'MASTER' || isMaster
  if (!canManage) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const effectiveTenantId = isMaster
    ? ((user.app_metadata?.tenant_id as number) ?? profile?.tenant_id)
    : profile?.tenant_id

  const body = await request.json()
  const { email, password, name, tenant_id, role_id } = body
  if (!email || !password || !name || !role_id) {
    return NextResponse.json({ error: 'Campos obrigatórios: email, password, name, role_id' }, { status: 400 })
  }

  const tenantId = tenant_id != null ? Number(tenant_id) : effectiveTenantId
  const roleId = Number(role_id)
  if (!tenantId) return NextResponse.json({ error: 'tenant_id é obrigatório' }, { status: 400 })
  if (!isMaster && profile?.tenant_id !== tenantId) {
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
    .select('*, roles(id, name), tenants(id, name)')
    .single()
  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({
    id: profileRow.id,
    name: profileRow.name,
    email: authUser.user.email,
    tenant_id: profileRow.tenant_id,
    role_id: profileRow.role_id,
    is_active: profileRow.is_active,
    roles: profileRow.roles,
    tenants: profileRow.tenants,
  })
}
