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

  const { id } = await params
  if (user.id !== id) return NextResponse.json({ error: 'Só pode alterar suas próprias preferências' }, { status: 403 })

  const body = await request.json()
  const { theme, language } = body

  const updates: Record<string, unknown> = {}
  if (theme !== undefined) updates.theme = theme
  if (language !== undefined) updates.language = language

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nenhuma alteração' }, { status: 400 })

  const { data: profile } = await supabase.from('users').select('preferences').eq('id', id).single()
  const current = (profile?.preferences as Record<string, unknown>) ?? {}
  const merged = { ...current, ...updates }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ preferences: merged })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(merged)
}
