import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { passwordProblem } from '@/lib/password-policy'

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
  const { current_password, new_password } = body as { current_password?: unknown; new_password?: unknown }
  if (typeof new_password !== 'string') return NextResponse.json({ error: 'Informe a nova senha' }, { status: 400 })
  const problem = passwordProblem(new_password)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  // Sem a senha atual, quem pegou uma sessão aberta tomaria a conta. Quem esqueceu usa o e-mail de redefinição.
  if (typeof current_password !== 'string' || !current_password) {
    return NextResponse.json({ error: 'Informe a senha atual' }, { status: 400 })
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: current_password,
  })
  if (signInError) return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 400 })

  const { error } = await supabase.auth.updateUser({ password: new_password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
