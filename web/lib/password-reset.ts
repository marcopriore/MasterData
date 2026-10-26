import { createClient } from '@/lib/supabase/client'
import { translateResetError } from '@/lib/password-reset-messages'

/**
 * Pede ao Supabase Auth o e-mail de redefinição. O link volta para /reset-password deste mesmo endereço.
 * O Auth responde igual para e-mail cadastrado ou não, então a tela não revela quem tem conta.
 */
export async function requestPasswordReset(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = email.trim().toLowerCase()
  if (!target || !target.includes('@')) return { ok: false, error: 'Informe um e-mail válido.' }
  const supabase = createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(target, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) return { ok: false, error: translateResetError(error.message) }
  return { ok: true }
}
