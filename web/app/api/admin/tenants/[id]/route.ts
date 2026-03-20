import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const isMaster = (user.app_metadata?.is_master as boolean) ?? false
  if (!isMaster) return NextResponse.json({ error: 'Apenas master pode editar tenant' }, { status: 403 })

  const { id } = await params
  const body = await request.json()

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = String(body.name).trim()
  if (body.slug !== undefined) updates.slug = String(body.slug).trim().toLowerCase()
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active)
  if (body.max_description_length !== undefined) {
    updates.max_description_length = Math.max(10, Math.min(200, Number(body.max_description_length)))
  }

  if (Object.keys(updates).length === 0) {
    const { data } = await supabaseAdmin.from('tenants').select('*').eq('id', id).single()
    return NextResponse.json(data)
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json(data)
}
