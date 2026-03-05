'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useUser } from '@/contexts/user-context'
import { apiGetWithAuth, apiPatchWithAuth } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { toast, Toaster } from 'sonner'
import {
  Bell,
  ChevronLeft,
  UserCircle,
  Lock,
  SlidersHorizontal,
  Loader2,
  Check,
  Sun,
  Moon,
  Languages,
} from 'lucide-react'

// ─── Section card wrapper ─────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[#B4B9BE] bg-white px-6 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.04)]">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#0F1C38]/8">
          <Icon className="size-4 text-[#0F1C38]" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Separator className="mb-5" />
      {children}
    </div>
  )
}

// ─── Theme option button ──────────────────────────────────────────────────────

function ThemeOption({
  value,
  current,
  label,
  icon: Icon,
  onClick,
}: {
  value: 'light' | 'dark'
  current: 'light' | 'dark'
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
}) {
  const selected = current === value
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-1 flex-col items-center gap-2 rounded-xl border-2 px-4 py-4 text-sm font-medium transition-all"
      style={{
        borderColor: selected ? '#0F1C38' : '#e2e8f0',
        backgroundColor: selected ? '#0F1C38' : 'transparent',
        color: selected ? '#ffffff' : '#334155',
      }}
    >
      <Icon className="size-5" />
      {label}
      {selected && (
        <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-[#C69A46]">
          <Check className="size-2.5 text-white" strokeWidth={3} />
        </span>
      )}
    </button>
  )
}

// ─── Language option button ───────────────────────────────────────────────────

function LangOption({
  value,
  current,
  label,
  flag,
  onClick,
}: {
  value: 'pt' | 'en'
  current: 'pt' | 'en'
  label: string
  flag: string
  onClick: () => void
}) {
  const selected = current === value
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all"
      style={{
        borderColor: selected ? '#0F1C38' : '#e2e8f0',
        backgroundColor: selected ? '#0F1C38' : 'transparent',
        color: selected ? '#ffffff' : '#334155',
      }}
    >
      <span className="text-lg leading-none">{flag}</span>
      {label}
      {selected && (
        <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-[#C69A46]">
          <Check className="size-2.5 text-white" strokeWidth={3} />
        </span>
      )}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export type NotificationPrefs = {
  notify_request_created: boolean
  notify_request_assigned: boolean
  notify_request_approved: boolean
  notify_request_rejected: boolean
  notify_request_completed: boolean
  email_request_created: boolean
  email_request_assigned: boolean
  email_request_approved: boolean
  email_request_rejected: boolean
  email_request_completed: boolean
}

const NOTIFICATION_PREF_ROWS: {
  notifyKey: keyof NotificationPrefs
  emailKey: keyof NotificationPrefs
  label: string
}[] = [
  { notifyKey: 'notify_request_created', emailKey: 'email_request_created', label: 'Solicitação criada' },
  { notifyKey: 'notify_request_assigned', emailKey: 'email_request_assigned', label: 'Atendimento iniciado' },
  { notifyKey: 'notify_request_approved', emailKey: 'email_request_approved', label: 'Aprovação de etapa' },
  { notifyKey: 'notify_request_rejected', emailKey: 'email_request_rejected', label: 'Rejeição (com motivo)' },
  { notifyKey: 'notify_request_completed', emailKey: 'email_request_completed', label: 'Solicitação concluída' },
]

export default function ProfilePage() {
  const { user, setUser, ready, accessToken } = useUser()
  const { setTheme } = useTheme()

  // ── Meus Dados ──────────────────────────────────────────────────────────────
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // ── Segurança ───────────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  // ── Preferências ────────────────────────────────────────────────────────────
  const [theme, setThemeLocal] = useState<'light' | 'dark'>('light')
  const [language, setLanguage] = useState<'pt' | 'en'>('pt')
  const [savingPrefs, setSavingPrefs] = useState(false)

  // ── Preferências de Notificação ─────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null)
  const [notifPrefsLoading, setNotifPrefsLoading] = useState(true)
  const saveNotifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch notification prefs on load
  useEffect(() => {
    if (!accessToken || !user) {
      setNotifPrefsLoading(false)
      return
    }
    setNotifPrefsLoading(true)
    apiGetWithAuth<NotificationPrefs>('/api/notifications/prefs', accessToken)
      .then(setNotifPrefs)
      .catch(() => setNotifPrefs(null))
      .finally(() => setNotifPrefsLoading(false))
  }, [accessToken, user])

  const saveNotifPrefs = useCallback(
    async (updates: Partial<NotificationPrefs>) => {
      if (!accessToken) return
      try {
        await apiPatchWithAuth('/api/notifications/prefs', updates, accessToken)
        toast.success('Preferências salvas')
      } catch {
        toast.error('Falha ao salvar preferências de notificação')
      }
    },
    [accessToken]
  )

  const handleNotifPrefChange = useCallback(
    (key: keyof NotificationPrefs, value: boolean) => {
      if (!notifPrefs) return
      const next = { ...notifPrefs, [key]: value }
      setNotifPrefs(next)

      if (saveNotifTimeoutRef.current) clearTimeout(saveNotifTimeoutRef.current)
      saveNotifTimeoutRef.current = setTimeout(() => {
        saveNotifPrefs({ [key]: value })
        saveNotifTimeoutRef.current = null
      }, 500)
    },
    [notifPrefs, saveNotifPrefs]
  )

  useEffect(() => {
    return () => {
      if (saveNotifTimeoutRef.current) clearTimeout(saveNotifTimeoutRef.current)
    }
  }, [])

  // Populate fields once the user session is ready
  useEffect(() => {
    if (!ready) return
    if (user) {
      setName(user.name)
      setEmail(user.email)
      setThemeLocal(user.preferences?.theme ?? 'light')
      setLanguage(user.preferences?.language ?? 'pt')
    }
  }, [ready, user])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    if (!user || !accessToken) return
    if (!name.trim()) { toast.error('O nome não pode estar vazio.'); return }
    setSavingProfile(true)
    try {
      const updated = await apiPatchWithAuth<{ id: number; name: string; email: string }>(
        `/admin/users/${user.id}`,
        { name: name.trim() },
        accessToken
      )
      setUser({ ...user, name: updated.name })
      toast.success('Dados atualizados com sucesso!')
    } catch (err: unknown) {
      toast.error('Falha ao salvar dados', {
        description: err instanceof Error ? err.message : 'Erro desconhecido',
      })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSavePassword = async () => {
    if (!user || !accessToken) return
    if (!currentPassword) { toast.error('Informe a senha atual.'); return }
    if (newPassword.length < 6) { toast.error('A nova senha deve ter pelo menos 6 caracteres.'); return }
    if (newPassword !== confirmPassword) { toast.error('As senhas não coincidem.'); return }
    setSavingPassword(true)
    try {
      await apiPatchWithAuth(`/admin/users/${user.id}/password`, {
        current_password: currentPassword,
        new_password: newPassword,
      }, accessToken)
      toast.success('Senha alterada com sucesso!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      toast.error('Falha ao alterar senha', {
        description: err instanceof Error ? err.message : 'Erro desconhecido',
      })
    } finally {
      setSavingPassword(false)
    }
  }

  const handleSavePreferences = async (
    nextTheme: 'light' | 'dark',
    nextLang: 'pt' | 'en'
  ) => {
    if (!user || !accessToken) return
    setSavingPrefs(true)
    try {
      await apiPatchWithAuth(`/admin/users/${user.id}/preferences`, {
        theme: nextTheme,
        language: nextLang,
      }, accessToken)
      // Update context + localStorage
      setUser({ ...user, preferences: { theme: nextTheme, language: nextLang } })
      // Apply theme immediately via next-themes
      setTheme(nextTheme)
      toast.success('Preferências salvas!')
    } catch (err: unknown) {
      toast.error('Falha ao salvar preferências', {
        description: err instanceof Error ? err.message : 'Erro desconhecido',
      })
    } finally {
      setSavingPrefs(false)
    }
  }

  const handleThemeChange = (t: 'light' | 'dark') => {
    setThemeLocal(t)
    handleSavePreferences(t, language)
  }

  const handleLanguageChange = (l: 'pt' | 'en') => {
    setLanguage(l)
    handleSavePreferences(theme, l)
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <main className="flex min-h-screen flex-col p-6 md:p-8">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-2xl border border-[#B4B9BE] bg-slate-100"
            />
          ))}
        </div>
      </main>
    )
  }

  // ── Guest state (no user in localStorage) ────────────────────────────────────
  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <div className="rounded-2xl border border-[#B4B9BE] bg-white px-8 py-10 text-center shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <UserCircle className="mx-auto mb-3 size-12 text-slate-300" />
          <h2 className="text-lg font-semibold text-foreground">Sessão não iniciada</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Faça login para acessar seu perfil.
          </p>
        </div>
      </main>
    )
  }

  // ── Initials avatar ──────────────────────────────────────────────────────────
  const initials = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

  return (
    <main className="flex min-h-screen flex-col p-6 md:p-8">
      <div className="mx-auto w-full max-w-2xl">

        {/* ── Page header ───────────────────────────────────────────────────── */}
        <div className="mb-6 flex items-center gap-3">
          <Link href="/">
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5 text-slate-500 hover:bg-transparent hover:text-[#0F1C38]"
            >
              <ChevronLeft className="size-4" />
              Início
            </Button>
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <UserCircle className="size-6 text-[#0F1C38]" />
              Meu Perfil
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Gerencie seus dados, senha e preferências de interface
            </p>
          </div>
        </div>

        {/* ── Avatar + role badge ───────────────────────────────────────────── */}
        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-[#B4B9BE] bg-white px-6 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.04)]">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[#0F1C38] text-xl font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-[#C69A46]/40 bg-[#C69A46]/10 px-3 py-1 text-xs font-semibold text-[#8B6914]">
            {user.role_name}
          </span>
        </div>

        <div className="space-y-5">

          {/* ── Meus Dados ──────────────────────────────────────────────────── */}
          <Section
            icon={UserCircle}
            title="Meus Dados"
            description="Atualize seu nome de exibição"
          >
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  value={email}
                  disabled
                  readOnly
                  className="h-10 cursor-not-allowed bg-slate-50 text-muted-foreground"
                />
                <p className="text-[11px] text-muted-foreground">
                  O e-mail não pode ser alterado por aqui. Contate um administrador.
                </p>
              </div>
              <div className="flex justify-end pt-1">
                <Button
                  onClick={handleSaveProfile}
                  disabled={savingProfile || name.trim() === user.name}
                  className="gap-2 bg-[#0F1C38] hover:bg-[#0F1C38]/90"
                >
                  {savingProfile ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  {savingProfile ? 'Salvando…' : 'Salvar Nome'}
                </Button>
              </div>
            </div>
          </Section>

          {/* ── Segurança ───────────────────────────────────────────────────── */}
          <Section
            icon={Lock}
            title="Segurança"
            description="Altere sua senha de acesso"
          >
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Senha Atual</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10"
                  autoComplete="current-password"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">Nova Senha</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirmar Senha</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`h-10 ${
                      confirmPassword && confirmPassword !== newPassword
                        ? 'border-red-400 focus-visible:ring-red-300'
                        : ''
                    }`}
                    autoComplete="new-password"
                  />
                  {confirmPassword && confirmPassword !== newPassword && (
                    <p className="text-[11px] text-red-500">As senhas não coincidem</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button
                  onClick={handleSavePassword}
                  disabled={
                    savingPassword ||
                    !currentPassword ||
                    !newPassword ||
                    newPassword !== confirmPassword
                  }
                  className="gap-2 bg-[#0F1C38] hover:bg-[#0F1C38]/90"
                >
                  {savingPassword ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Lock className="size-4" />
                  )}
                  {savingPassword ? 'Alterando…' : 'Alterar Senha'}
                </Button>
              </div>
            </div>
          </Section>

          {/* ── Preferências ────────────────────────────────────────────────── */}
          <Section
            icon={SlidersHorizontal}
            title="Preferências"
            description="Personalize a aparência e o idioma da plataforma"
          >
            <div className="space-y-6">

              {/* Theme */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sun className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Tema</span>
                  {savingPrefs && (
                    <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="flex gap-3">
                  <ThemeOption
                    value="light"
                    current={theme}
                    label="Claro"
                    icon={Sun}
                    onClick={() => handleThemeChange('light')}
                  />
                  <ThemeOption
                    value="dark"
                    current={theme}
                    label="Escuro"
                    icon={Moon}
                    onClick={() => handleThemeChange('dark')}
                  />
                </div>
              </div>

              <Separator />

              {/* Language */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Languages className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Idioma</span>
                </div>
                <div className="flex gap-3">
                  <LangOption
                    value="pt"
                    current={language}
                    label="Português (BR)"
                    flag="🇧🇷"
                    onClick={() => handleLanguageChange('pt')}
                  />
                  <LangOption
                    value="en"
                    current={language}
                    label="English"
                    flag="🇺🇸"
                    onClick={() => handleLanguageChange('en')}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  A tradução completa da interface estará disponível em versões futuras.
                </p>
              </div>

            </div>
          </Section>

          {/* ── Preferências de Notificação ───────────────────────────────────── */}
          <Section
            icon={Bell}
            title="Preferências de Notificação"
            description="Configure quais notificações deseja receber"
          >
            {notifPrefsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                <span>Carregando...</span>
              </div>
            ) : notifPrefs ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-3 pr-4 text-left font-medium text-foreground">Evento</th>
                      <th className="pb-3 px-2 text-center font-medium text-foreground">In-app</th>
                      <th className="pb-3 pl-2 text-center font-medium text-foreground">E-mail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {NOTIFICATION_PREF_ROWS.map(({ notifyKey, emailKey, label }) => (
                      <tr key={notifyKey} className="border-b last:border-0">
                        <td className="py-3 pr-4 text-foreground">{label}</td>
                        <td className="px-2 py-3 text-center">
                          <Switch
                            checked={notifPrefs[notifyKey]}
                            onCheckedChange={(v) => handleNotifPrefChange(notifyKey, !!v)}
                          />
                        </td>
                        <td className="pl-2 py-3 text-center">
                          <Switch
                            checked={notifPrefs[emailKey]}
                            onCheckedChange={(v) => handleNotifPrefChange(emailKey, !!v)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">
                Não foi possível carregar as preferências.
              </p>
            )}
          </Section>

        </div>
      </div>

      <Toaster position="top-right" richColors duration={3000} />
    </main>
  )
}
