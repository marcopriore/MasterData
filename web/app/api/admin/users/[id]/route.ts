import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, roles(name)').eq('id', user.id).single()
  const roleName = (profile?.roles as { name?: string })?.name?.toUpperCase() ?? ''
  const isMaster = (user.app_metadata?.is_master as boolean) ?? false
  const canManage = roleName === 'ADMIN' || roleName === 'MASTER' || isMaster
  if (!canManage) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params
  const body = await request.json()

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.role_id !== undefined) updates.role_id = Number(body.role_id)
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active)

  if (Object.keys(updates).length === 0) {
    const { data } = await supabaseAdmin.from('users').select('*, roles(id, name), tenants(id, name)').eq('id', id).single()
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(id)
    return NextResponse.json({ ...data, email: authUser?.user?.email ?? '' })
  }

  if (!isMaster && profile?.tenant_id) {
    const { data: target } = await supabaseAdmin.from('users').select('tenant_id').eq('id', id).single()
    if (target?.tenant_id !== profile.tenant_id) {
      return NextResponse.json({ error: 'Sem permissão para editar usuário de outro tenant' }, { status: 403 })
    }
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('*, roles(id, name), tenants(id, name)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(id)
  return NextResponse.json({ ...data, email: authUser?.user?.email ?? '' })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return PUT(request, { params })
}
