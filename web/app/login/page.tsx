'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@/contexts/user-context'
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, clearUser } = useUser()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // On mount: wipe any stale localStorage session whose cookie has already
  // expired. Without this, a returning user with stale storage but no cookie
  // would be stuck — the middleware blocks every page, but the old user object
  // in localStorage would make the app think they're logged in.
  useEffect(() => {
    const hasCookie = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith('mdm_session='))

    if (!hasCookie) {
      clearUser()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('Preencha o e-mail e a senha.')
      return
    }

    setLoading(true)
    const result = await login(email.trim(), password)
    setLoading(false)

    if (!result.ok) {
      console.error('[login] failed:', result.error)
      setError(result.error)
      return
    }

    // Login succeeded — cookie is now set, navigate to the intended destination
    const from = searchParams.get('from') ?? '/'
    router.replace(from)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100 p-4">
      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(100,116,139,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,.15) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Card branco */}
        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xl overflow-hidden">
          {/* Gold top accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-[#C69A46] via-[#e8c06a] to-[#C69A46]" />

          <div className="px-8 py-10 space-y-8">
            {/* Logo / Brand */}
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C69A46]/15 ring-1 ring-[#C69A46]/40">
                <ShieldCheck className="size-7 text-[#C69A46]" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                  PRO-MAT
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Master Data Management
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* E-mail */}
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className={cn(
                      'h-11 w-full rounded-xl border bg-slate-50/80 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400',
                      'outline-none transition-all',
                      'focus:border-[#C69A46]/60 focus:bg-white focus:ring-2 focus:ring-[#C69A46]/20',
                      error ? 'border-red-400' : 'border-slate-200'
                    )}
                  />
                </div>
              </div>

              {/* Senha */}
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
                >
                  Senha
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={cn(
                      'h-11 w-full rounded-xl border bg-slate-50/80 pl-10 pr-11 text-sm text-slate-800 placeholder:text-slate-400',
                      'outline-none transition-all',
                      'focus:border-[#C69A46]/60 focus:bg-white focus:ring-2 focus:ring-[#C69A46]/20',
                      error ? 'border-red-400' : 'border-slate-200'
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'relative mt-2 h-11 w-full rounded-xl text-sm font-semibold transition-all',
                  'bg-[#C69A46] text-[#0F1C38] shadow-lg shadow-[#C69A46]/20',
                  'hover:bg-[#d4a84e] hover:shadow-[#C69A46]/30',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C69A46]/60'
                )}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Entrando…
                  </span>
                ) : (
                  'Entrar'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-500">
          PRO-MAT · Acesso restrito a usuários autorizados
        </p>
      </div>
    </div>
  )
}
