'use client'

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { apiGet, apiPost, apiPatch } from '@/lib/api'
import { useUser } from '@/contexts/user-context'
import { toast, Toaster } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  ShieldHalf,
  Plus,
  Loader2,
  X,
  Check,
  Pencil,
  Users,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Permissions = {
  can_approve: boolean
  can_reject: boolean
  can_edit_pdm: boolean
  can_manage_users: boolean
  can_manage_workflows: boolean
  can_submit_request: boolean
}

type Role = {
  id: number
  name: string
  role_type?: 'sistema' | 'etapa'
  permissions: Permissions
  user_count: number
}

const PERMISSION_LABELS: { key: keyof Permissions; label: string; description: string }[] = [
  { key: 'can_approve',          label: 'Aprovar',          description: 'Aprovar solicitações de cadastro' },
  { key: 'can_reject',           label: 'Rejeitar',         description: 'Rejeitar solicitações de cadastro' },
  { key: 'can_edit_pdm',         label: 'Editar PDM',       description: 'Criar e editar modelos de PDM' },
  { key: 'can_manage_users',     label: 'Gerir Usuários',   description: 'Criar, editar e desativar usuários' },
  { key: 'can_manage_workflows', label: 'Gerir Workflows',  description: 'Configurar fluxos de aprovação' },
  { key: 'can_submit_request',   label: 'Solicitar',        description: 'Abrir novas solicitações de cadastro' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleAccentColor(name: string) {
  switch (name) {
    case 'ADMIN':       return { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A', dot: '#D97706' }
    case 'SOLICITANTE': return { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0', dot: '#16A34A' }
    case 'TRIAGEM':     return { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE', dot: '#3B82F6' }
    case 'FISCAL':      return { bg: '#F5F3FF', text: '#5B21B6', border: '#DDD6FE', dot: '#7C3AED' }
    case 'MASTER':      return { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A', dot: '#F59E0B' }
    case 'MRP':         return { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0', dot: '#10B981' }
    default:            return { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0', dot: '#94A3B8' }
  }
}

function emptyPermissions(): Permissions {
  return {
    can_approve: false,
    can_reject: false,
    can_edit_pdm: false,
    can_manage_users: false,
    can_manage_workflows: false,
    can_submit_request: false,
  }
}

// ─── Permission toggle ────────────────────────────────────────────────────────

function PermToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ backgroundColor: checked ? '#0F1C38' : '#CBD5E1' }}
    >
      <span
        className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface RoleModalProps {
  mode: 'create' | 'edit'
  initial?: Role | null
  onClose: () => void
  onSaved: (r: Role) => void
}

function RoleModal({ mode, initial, onClose, onSaved }: RoleModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [perms, setPerms] = useState<Permissions>(
    initial?.permissions ?? emptyPermissions()
  )
  const [saving, setSaving] = useState(false)

  function togglePerm(key: keyof Permissions) {
    setPerms((p) => ({ ...p, [key]: !p[key] }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('Informe o nome do perfil.'); return }

    setSaving(true)
    try {
      let saved: Role
      if (mode === 'create') {
        saved = await apiPost<Role>('/admin/roles', { name: name.trim(), role_type: 'sistema', permissions: perms })
        toast.success('Perfil criado com sucesso.')
      } else {
        saved = await apiPatch<Role>(`/admin/roles/${initial!.id}`, {
          name: name.trim(),
          role_type: initial?.role_type ?? 'sistema',
          permissions: perms,
        })
        toast.success('Perfil atualizado.')
      }
      onSaved(saved)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#B4B9BE] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#B4B9BE] px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldHalf className="size-4 text-[#0F1C38]" />
            <h2 className="text-base font-semibold text-[#0F1C38]">
              {mode === 'create' ? 'Novo Perfil' : 'Editar Perfil'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="r-name" className="text-sm font-medium">Nome do perfil</Label>
            <Input
              id="r-name"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="Ex: REVISOR"
              className="h-10 uppercase font-mono"
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Permissões</p>
            {PERMISSION_LABELS.map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <PermToggle
                  checked={perms[key]}
                  onChange={() => togglePerm(key)}
                />
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#0F1C38] hover:bg-[#162444] text-white"
            >
              {saving ? (
                <><Loader2 className="size-4 animate-spin mr-2" />Salvando…</>
              ) : (
                <><Check className="size-4 mr-2" />{mode === 'create' ? 'Criar perfil' : 'Salvar'}</>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const { isAdmin } = useUser()

  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editTarget, setEditTarget] = useState<Role | null>(null)

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    try {
      setRoles(await apiGet<Role[]>('/admin/roles'))
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRoles() }, [fetchRoles])

  function openCreate() {
    setEditTarget(null)
    setModalMode('create')
    setModalOpen(true)
  }

  function openEdit(r: Role) {
    setEditTarget(r)
    setModalMode('edit')
    setModalOpen(true)
  }

  function handleSaved(saved: Role) {
    setRoles((prev) => {
      const idx = prev.findIndex((r) => r.id === saved.id)
      return idx >= 0
        ? prev.map((r) => (r.id === saved.id ? saved : r))
        : [...prev, saved]
    })
    setModalOpen(false)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Toaster richColors position="top-right" />

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#0F1C38]/8">
            <ShieldHalf className="size-5 text-[#0F1C38]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Perfis de Acesso</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie os perfis e suas permissões no sistema
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button
            onClick={openCreate}
            className="bg-[#0F1C38] hover:bg-[#162444] text-white shrink-0"
          >
            <Plus className="size-4 mr-2" />
            Novo Perfil
          </Button>
        )}
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-5 animate-spin mr-2" />
          Carregando perfis…
        </div>
      ) : roles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <ShieldHalf className="size-8 opacity-30" />
          <p className="text-sm">Nenhum perfil cadastrado.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => {
            const accent = roleAccentColor(role.name)
            const activePerms = PERMISSION_LABELS.filter(({ key }) => role.permissions?.[key])
            const inactivePerms = PERMISSION_LABELS.filter(({ key }) => !role.permissions?.[key])

            return (
              <div
                key={role.id}
                className="flex flex-col rounded-2xl border bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.04)] overflow-hidden"
                style={{ borderColor: accent.border }}
              >
                {/* Card header */}
                <div
                  className="flex items-center justify-between px-5 py-4"
                  style={{ backgroundColor: accent.bg }}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: accent.dot }}
                    />
                    <span
                      className="font-bold tracking-wide text-sm font-mono"
                      style={{ color: accent.text }}
                    >
                      {role.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="flex items-center gap-1 text-xs font-medium"
                      style={{ color: accent.text, opacity: 0.8 }}
                    >
                      <Users className="size-3" />
                      {role.user_count}
                    </span>
                    {isAdmin && (
                      <button
                        onClick={() => openEdit(role)}
                        className="rounded-lg p-1 transition-colors hover:bg-black/10"
                        style={{ color: accent.text }}
                        title="Editar perfil"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Permissions list */}
                <div className="flex-1 px-5 py-4 space-y-1">
                  {PERMISSION_LABELS.map(({ key, label }) => {
                    const on = role.permissions?.[key] ?? false
                    return (
                      <div key={key} className="flex items-center gap-2.5 py-0.5">
                        <span
                          className="flex size-4 shrink-0 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: on ? '#0F1C38' : '#F1F5F9',
                          }}
                        >
                          {on ? (
                            <Check className="size-2.5 text-white" strokeWidth={3} />
                          ) : (
                            <X className="size-2.5 text-slate-400" strokeWidth={2.5} />
                          )}
                        </span>
                        <span
                          className="text-xs"
                          style={{
                            color: on ? '#0F1C38' : '#94A3B8',
                            fontWeight: on ? 500 : 400,
                          }}
                        >
                          {label}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Footer summary */}
                <div className="border-t px-5 py-3 text-xs text-muted-foreground" style={{ borderColor: accent.border }}>
                  {activePerms.length} de {PERMISSION_LABELS.length} permissões ativas
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <RoleModal
          mode={modalMode}
          initial={editTarget}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
