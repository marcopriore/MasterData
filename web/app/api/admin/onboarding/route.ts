import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const isMaster = (user.app_metadata?.is_master as boolean) ?? false
  if (!isMaster) return NextResponse.json({ error: 'Apenas master pode criar tenant' }, { status: 403 })

  const body = await request.json()
  const { tenant_name, admin_email, admin_password, admin_name } = body
  if (!tenant_name || !admin_email || !admin_password || !admin_name) {
    return NextResponse.json({
      error: 'Campos obrigatórios: tenant_name, admin_email, admin_password, admin_name',
    }, { status: 400 })
  }

  const slug = slugify(tenant_name)
  if (!slug) return NextResponse.json({ error: 'Nome do tenant inválido' }, { status: 400 })

  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('create_tenant_onboarding', {
    p_tenant_name: String(tenant_name).trim(),
    p_slug: slug,
    p_admin_name: String(admin_name).trim(),
    p_admin_email: String(admin_email).trim().toLowerCase(),
    p_admin_password: String(admin_password),
  })
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 })

  const tenantId = (rpcResult as { tenant_id?: number })?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Falha ao criar tenant' }, { status: 500 })

  const { data: adminRole } = await supabaseAdmin
    .from('roles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('name', 'ADMIN')
    .single()
  if (!adminRole) return NextResponse.json({ error: 'Perfil ADMIN não encontrado' }, { status: 500 })

  const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: String(admin_email).trim().toLowerCase(),
    password: String(admin_password),
    email_confirm: true,
    app_metadata: { tenant_id: tenantId },
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  const { error: profileError } = await supabaseAdmin.from('users').insert({
    id: authUser.user.id,
    tenant_id: tenantId,
    name: String(admin_name).trim(),
    role_id: adminRole.id,
  })
  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({
    tenant_id: tenantId,
    admin_user_id: authUser.user.id,
    success: true,
  })
}
