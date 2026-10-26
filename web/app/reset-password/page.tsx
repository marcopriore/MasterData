'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, KeyRound, Loader2, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { MIN_PASSWORD_LENGTH, newPasswordProblem, translateResetError } from '@/lib/password-reset-messages'

type Stage = 'checking' | 'ready' | 'invalid' | 'saving'

const inputClass = (hasError: boolean) =>
  cn(
    'h-11 w-full rounded-xl border bg-slate-50/80 pl-10 pr-11 text-sm text-slate-800 placeholder:text-slate-400',
    'outline-none transition-all focus:border-[#C69A46]/60 focus:bg-white focus:ring-2 focus:ring-[#C69A46]/20',
    hasError ? 'border-red-400' : 'border-slate-200'
  )

/**
 * Destino do link de redefinição. Aceita o link com token_hash (modelo de e-mail recomendado,
 * funciona em qualquer navegador) e o link padrão com code (só no navegador que pediu).
 */
export default function ResetPasswordPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('checking')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const query = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))

    const finish = (ok: boolean, message?: string) => {
      if (cancelled) return
      window.history.replaceState(null, '', '/reset-password')
      if (ok) setStage('ready')
      else {
        setLinkError(message ?? 'O link expirou ou já foi usado. Peça um novo link na tela de login.')
        setStage('invalid')
      }
    }

    const run = async () => {
      const linkFailure = query.get('error_description') ?? hash.get('error_description')
      if (linkFailure) return finish(false, translateResetError(linkFailure))

      const tokenHash = query.get('token_hash')
      const code = query.get('code')
      if (tokenHash && (query.get('type') ?? 'recovery') === 'recovery') {
        const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        return finish(!otpError, otpError ? translateResetError(otpError.message) : undefined)
      }
      if (code) {
        const { error: codeError } = await supabase.auth.exchangeCodeForSession(code)
        if (!codeError) return finish(true)
      }
      // O cliente pode já ter trocado o code sozinho (detectSessionInUrl); a sessão de recuperação basta.
      const { data } = await supabase.auth.getSession()
      finish(Boolean(data.session))
    }
    void run()
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const problem = newPasswordProblem(password, confirmation)
    if (problem) {
      setError(problem)
      return
    }
    setStage('saving')
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(translateResetError(updateError.message))
      setStage('ready')
      return
    }
    await supabase.auth.signOut()
    router.replace('/login?reset=ok')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100 p-4">
      <div className="relative w-full max-w-sm">
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xl overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-[#C69A46] via-[#e8c06a] to-[#C69A46]" />
          <div className="px-8 py-10 space-y-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C69A46]/15 ring-1 ring-[#C69A46]/40">
                <KeyRound className="size-7 text-[#C69A46]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-800">Nova senha</h1>
                <p className="mt-1 text-sm text-slate-500">PRO-MAT</p>
              </div>
            </div>

            {stage === 'checking' && (
              <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" />
                Validando o link…
              </p>
            )}

            {stage === 'invalid' && (
              <div className="space-y-4">
                <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{linkError}</p>
                <Link
                  href="/login?forgot=1"
                  className="block h-11 w-full rounded-xl bg-[#C69A46] text-center text-sm font-semibold leading-[2.75rem] text-[#0F1C38] hover:bg-[#d4a84e]"
                >
                  Pedir novo link
                </Link>
              </div>
            )}

            {(stage === 'ready' || stage === 'saving') && (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <p className="text-sm text-slate-600">Crie a nova senha, com pelo menos {MIN_PASSWORD_LENGTH} caracteres, letras e números.</p>
                <div className="space-y-1.5">
                  <label htmlFor="new-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Nova senha
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClass(Boolean(error))}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="confirm-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Confirmar senha
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      className={inputClass(Boolean(error))}
                    />
                  </div>
                </div>
                {error && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
                <button
                  type="submit"
                  disabled={stage === 'saving'}
                  className="h-11 w-full rounded-xl bg-[#C69A46] text-sm font-semibold text-[#0F1C38] shadow-lg shadow-[#C69A46]/20 hover:bg-[#d4a84e] disabled:opacity-60"
                >
                  {stage === 'saving' ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Salvando…
                    </span>
                  ) : (
                    'Salvar nova senha'
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/login" className="hover:text-slate-700">Voltar para o login</Link>
        </p>
      </div>
    </div>
  )
}
