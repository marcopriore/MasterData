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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const isMaster = (user.app_metadata?.is_master as boolean) ?? false
  const access = await callerCanManageUsers(supabase, user.id, isMaster)
  if (!access.allowed) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params
  const body = await request.json()

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.role_id !== undefined) updates.role_id = Number(body.role_id)
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active)

  if (!isMaster && access.tenantId) {
    const { data: target } = await supabaseAdmin.from('users').select('tenant_id').eq('id', id).single()
    if (target?.tenant_id !== access.tenantId) {
      return NextResponse.json({ error: 'Sem permissão para editar usuário de outro tenant' }, { status: 403 })
    }
  }

  const groupIds = Array.isArray(body.group_ids) ? body.group_ids.map(Number) : null
  if (groupIds) {
    const stageRoleId = Number(body.role_id)
    const { data: target } = await supabaseAdmin.from('users').select('tenant_id').eq('id', id).single()
    const tenantId = target?.tenant_id as number | undefined
    if (!tenantId) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    const synced = await syncUserAccess({
      userId: id,
      tenantId,
      groupIds,
      stageRoleId,
      grantKeys: Array.isArray(body.permission_grants) ? body.permission_grants.map(String) : [],
    })
    if (synced.error) return NextResponse.json({ error: synced.error }, { status: 400 })
    updates.role_id = stageRoleId
  }

  if (Object.keys(updates).length === 0) {
    const { data } = await supabaseAdmin.from('users').select('*, roles!users_role_id_fkey(id, name), tenants(id, name)').eq('id', id).single()
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(id)
    return NextResponse.json({ ...data, email: authUser?.user?.email ?? '' })
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('*, roles!users_role_id_fkey(id, name), tenants(id, name)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const logTenantId =
    (data as { tenant_id?: number }).tenant_id ?? access.tenantId
  if (logTenantId != null) {
    const safeBody = { ...(body as Record<string, unknown>) }
    delete safeBody.password
    await insertLog({
      tenant_id: logTenantId,
      user_id: user.id,
      category: 'users',
      action: 'user_updated',
      description: 'Usuário atualizado',
      event_data: { updated_fields: safeBody },
    })
  }

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(id)
  return NextResponse.json({ ...data, email: authUser?.user?.email ?? '' })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return PUT(request, { params })
}
