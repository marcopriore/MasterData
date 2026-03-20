import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const isMaster = (user.app_metadata?.is_master as boolean) ?? false
  if (!isMaster) return NextResponse.json({ error: 'Apenas master pode trocar de tenant' }, { status: 403 })

  const body = await request.json()
  const tenantId = body?.tenant_id
  if (tenantId == null) return NextResponse.json({ error: 'tenant_id é obrigatório' }, { status: 400 })

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata as Record<string, unknown> ?? {}), tenant_id: Number(tenantId) },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
