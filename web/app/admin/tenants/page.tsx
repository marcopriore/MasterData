'use client'

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { apiGetWithAuth, apiPostWithAuth, apiPatchWithAuth } from '@/lib/api'
import { useUser } from '@/contexts/user-context'
import { toast, Toaster } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Building2,
  Plus,
  Loader2,
  X,
  Pencil,
  LogIn,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tenant = {
  id: number
  name: string
  slug: string
  is_active: boolean
  created_at: string | null
  users_count?: number
  materials_count?: number
}

type ModalMode = 'create' | 'edit'

type OnboardingResponse = {
  success: boolean
  tenant_id: number
  tenant_name: string
  admin_email: string
  email_sent: boolean
  message: string
}

const SLUG_REGEX = /^[a-z0-9-]+$/

// ─── Onboarding Modal ─────────────────────────────────────────────────────────

interface OnboardingModalProps {
  onClose: () => void
  onSuccess: () => void
}

function OnboardingModal({ onClose, onSuccess }: OnboardingModalProps) {
  const [tenantName, setTenantName] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [tempPassword, setTempPassword] = useState('')
  const [sendEmailChecked, setSendEmailChecked] = useState(true)
  const [loading, setLoading] = useState(false)
  const { accessToken } = useUser()

  const handleSlugChange = (v: string) => {
    const lower = v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    setTenantSlug(lower)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!tenantName.trim()) {
      toast.error('Nome da empresa é obrigatório.')
      return
    }
    if (!tenantSlug.trim()) {
      toast.error('Slug é obrigatório.')
      return
    }
    if (!SLUG_REGEX.test(tenantSlug)) {
      toast.error('Slug deve conter apenas letras minúsculas, números e hífens.')
      return
    }
    if (!adminName.trim()) {
      toast.error('Nome do administrador é obrigatório.')
      return
    }
    if (!adminEmail.trim()) {
      toast.error('Email do administrador é obrigatório.')
      return
    }
    if (!accessToken) {
      toast.error('Sessão expirada. Faça login novamente.')
      return
    }

    setLoading(true)
    try {
      const body = {
        tenant_name: tenantName.trim(),
        tenant_slug: tenantSlug.trim(),
        admin_name: adminName.trim(),
        admin_email: adminEmail.trim(),
        temp_password: tempPassword.trim() || undefined,
      }
      const res = await apiPostWithAuth<OnboardingResponse>(
        '/admin/tenants/onboarding',
        body,
        accessToken
      )
      if (res.email_sent) {
        toast.success(`Tenant criado! Email enviado para ${res.admin_email}`)
      } else {
        toast.success('Tenant criado! Falha no envio do email — verifique as configurações SMTP')
      }
      onSuccess()
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl p-0 overflow-hidden"
        style={{
          borderColor: 'var(--sidebar-border, #e2e8f0)',
          backgroundColor: 'var(--card, #ffffff)',
        }}
      >
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: 'var(--sidebar-border)' }}
        >
          <div className="flex items-center gap-2">
            <Building2 className="size-4" style={{ color: 'var(--sidebar-text)' }} />
            <h2 className="text-base font-semibold" style={{ color: 'var(--sidebar-text)' }}>
              Novo Tenant
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors opacity-70 hover:opacity-100"
            style={{ color: 'var(--sidebar-text)' }}
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          <div>
            <p className="text-xs font-medium opacity-70 mb-3" style={{ color: 'var(--sidebar-text)' }}>
              Dados da Empresa
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ob-tenant-name">Nome da empresa</Label>
                <Input
                  id="ob-tenant-name"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder="Ex: Empresa ABC"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-tenant-slug">Slug</Label>
                <Input
                  id="ob-tenant-slug"
                  value={tenantSlug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="empresa-abc"
                  className="h-10 font-mono"
                />
                <p className="text-xs opacity-70">Apenas letras minúsculas, números e hífens</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium opacity-70 mb-3" style={{ color: 'var(--sidebar-text)' }}>
              Administrador do Tenant
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ob-admin-name">Nome completo</Label>
                <Input
                  id="ob-admin-name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Ex: João Silva"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-admin-email">Email</Label>
                <Input
                  id="ob-admin-email"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@empresa.com"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-temp-password">Senha temporária (opcional)</Label>
                <Input
                  id="ob-temp-password"
                  type="password"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder="Gerada automaticamente"
                  className="h-10"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ob-send-email"
              checked={sendEmailChecked}
              onChange={(e) => setSendEmailChecked(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="ob-send-email" className="text-sm cursor-pointer">
              Enviar email de boas-vindas com as credenciais
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin mr-2" />}
              Criar Tenant
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface TenantModalProps {
  mode: ModalMode
  initial?: Tenant | null
  onClose: () => void
  onSaved: (t: Tenant) => void
}

function TenantModal({ mode, initial, onClose, onSaved }: TenantModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const { accessToken } = useUser()

  const handleSlugChange = (v: string) => {
    const lower = v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    setSlug(lower)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Nome é obrigatório.')
      return
    }
    if (!slug.trim()) {
      toast.error('Slug é obrigatório.')
      return
    }
    if (!SLUG_REGEX.test(slug)) {
      toast.error('Slug deve conter apenas letras minúsculas, números e hífens.')
      return
    }
    if (!accessToken) {
      toast.error('Sessão expirada. Faça login novamente.')
      return
    }

    setSaving(true)
    try {
      if (mode === 'create') {
        const saved = await apiPostWithAuth<Tenant>(
          '/admin/tenants',
          { name: name.trim(), slug: slug.trim() },
          accessToken
        )
        toast.success('Tenant criado com sucesso.')
        onSaved(saved)
      } else {
        const saved = await apiPatchWithAuth<Tenant>(
          `/admin/tenants/${initial!.id}`,
          { name: name.trim(), slug: slug.trim(), is_active: isActive },
          accessToken
        )
        toast.success('Tenant atualizado.')
        onSaved(saved)
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      style={{
        backgroundColor: 'rgba(0,0,0,0.4)',
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl p-0 overflow-hidden"
        style={{
          borderColor: 'var(--sidebar-border, #e2e8f0)',
          backgroundColor: 'var(--card, #ffffff)',
        }}
      >
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: 'var(--sidebar-border)' }}
        >
          <div className="flex items-center gap-2">
            <Building2 className="size-4" style={{ color: 'var(--sidebar-text)' }} />
            <h2 className="text-base font-semibold" style={{ color: 'var(--sidebar-text)' }}>
              {mode === 'create' ? 'Novo Tenant' : 'Editar Tenant'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors opacity-70 hover:opacity-100"
            style={{ color: 'var(--sidebar-text)' }}
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="t-name" className="text-sm font-medium">Nome</Label>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Empresa ABC"
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-slug" className="text-sm font-medium">Slug</Label>
            <Input
              id="t-slug"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="empresa-abc"
              className="h-10 font-mono"
            />
            <p className="text-xs opacity-70">Apenas letras minúsculas, números e hífens</p>
          </div>

          {mode === 'edit' && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="t-active" className="text-sm font-medium">Ativo</Label>
              <Switch id="t-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const { user, accessToken, switchTenant } = useUser()
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [editModal, setEditModal] = useState<Tenant | null>(null)

  const fetchTenants = useCallback(async () => {
    if (!accessToken) return
    try {
      const data = await apiGetWithAuth<Tenant[]>('/admin/tenants', accessToken)
      setTenants(data)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (user && !user.is_master) {
      router.replace('/')
      return
    }
    if (user?.is_master && accessToken) {
      fetchTenants()
    } else {
      setLoading(false)
    }
  }, [user, user?.is_master, accessToken, fetchTenants, router])

  const handleEnter = async (t: Tenant) => {
    try {
      await switchTenant(t.id)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (!user?.is_master) return null

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Toaster richColors position="top-right" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--sidebar-text)' }}>
          Gestão de Tenants
        </h1>
        <Button
          onClick={() => setOnboardingOpen(true)}
          className="gap-2"
        >
          <Plus className="size-4" />
          Novo Tenant
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin opacity-60" />
        </div>
      ) : (
        <div
          className="rounded-xl border overflow-hidden"
          style={{
            borderColor: 'var(--sidebar-border)',
            backgroundColor: 'var(--card)',
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--sidebar-hover-bg, rgba(0,0,0,0.05))',
                    borderBottom: '1px solid var(--sidebar-border)',
                  }}
                >
                  <th className="text-left px-4 py-3 font-medium">Nome</th>
                  <th className="text-left px-4 py-3 font-medium">Slug</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Usuários</th>
                  <th className="text-left px-4 py-3 font-medium">Materiais</th>
                  <th className="text-right px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b last:border-b-0"
                    style={{ borderColor: 'var(--sidebar-border)' }}
                  >
                    <td className="px-4 py-3" style={{ color: 'var(--sidebar-text)' }}>{t.name}</td>
                    <td className="px-4 py-3 font-mono text-xs opacity-80">{t.slug}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                        style={
                          t.is_active
                            ? (resolvedTheme === 'dark'
                                ? { background: 'rgba(22,101,52,0.3)', color: '#4ade80', border: '1px solid #166534' }
                                : { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' })
                            : (resolvedTheme === 'dark'
                                ? { background: 'rgba(153,27,27,0.3)', color: '#f87171', border: '1px solid #991b1b' }
                                : { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' })
                        }
                      >
                        {t.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 opacity-80">{t.users_count ?? 0}</td>
                    <td className="px-4 py-3 opacity-80">{t.materials_count ?? 0}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => handleEnter(t)}
                        >
                          <LogIn className="size-3.5" />
                          Entrar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => setEditModal(t)}
                        >
                          <Pencil className="size-3.5" />
                          Editar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {onboardingOpen && (
        <OnboardingModal
          onClose={() => setOnboardingOpen(false)}
          onSuccess={() => fetchTenants()}
        />
      )}

      {editModal && (
        <TenantModal
          mode="edit"
          initial={editModal}
          onClose={() => setEditModal(null)}
          onSaved={(saved) => {
            setTenants((prev) => prev.map((t) => (t.id === saved.id ? { ...t, ...saved } : t)))
            setEditModal(null)
          }}
        />
      )}
    </div>
  )
}
