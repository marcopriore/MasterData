import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const isMaster = (user.app_metadata?.is_master as boolean) ?? false
  if (!isMaster) return NextResponse.json({ error: 'Apenas master pode voltar ao tenant' }, { status: 403 })

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('tenant_id, tenants(id, name)')
    .eq('id', user.id)
    .single()
  if (!profile?.tenant_id) return NextResponse.json({ error: 'Perfil sem tenant' }, { status: 400 })

  const tenant = Array.isArray(profile.tenants) ? profile.tenants[0] : profile.tenants
  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata as Record<string, unknown> ?? {}), tenant_id: profile.tenant_id },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    success: true,
    tenant_id: profile.tenant_id,
    tenant_name: tenant?.name ?? '',
  })
}
