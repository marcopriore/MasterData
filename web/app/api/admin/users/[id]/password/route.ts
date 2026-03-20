import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { id } = await params
  if (user.id !== id) return NextResponse.json({ error: 'Só pode alterar sua própria senha' }, { status: 403 })

  const body = await request.json()
  const { current_password, new_password } = body
  if (!new_password || new_password.length < 6) {
    return NextResponse.json({ error: 'Nova senha deve ter pelo menos 6 caracteres' }, { status: 400 })
  }

  if (current_password) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: current_password,
    })
    if (signInError) return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 400 })
  }

  const { error } = await supabase.auth.updateUser({ password: new_password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
