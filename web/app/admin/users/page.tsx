'use client'

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api'
import { useUser } from '@/contexts/user-context'
import { toast, Toaster } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Users,
  UserPlus,
  Search,
  Loader2,
  X,
  Check,
  ShieldCheck,
  Eye,
  EyeOff,
  Pencil,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = { id: number; name: string }

type User = {
  id: number
  name: string
  email: string
  role_id: number
  role_name: string | null
  is_active: boolean
  created_at: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function roleBadgeStyle(name: string | null) {
  switch (name) {
    case 'ADMIN':
      return { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' }
    case 'GOVERNANCA':
      return { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' }
    case 'SOLICITANTE':
      return { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' }
    default:
      return { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' }
  }
}

// ─── Section card ─────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#B4B9BE] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_6px_-1px_rgba(0,0,0,0.04)]">
      {children}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

type ModalMode = 'create' | 'edit'

interface UserModalProps {
  mode: ModalMode
  initial?: User | null
  roles: Role[]
  onClose: () => void
  onSaved: (u: User) => void
}

function UserModal({ mode, initial, roles, onClose, onSaved }: UserModalProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState<number>(initial?.role_id ?? roles[0]?.id ?? 0)
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) {
      toast.error('Nome e e-mail são obrigatórios.')
      return
    }
    if (mode === 'create' && !password) {
      toast.error('Informe uma senha para o novo usuário.')
      return
    }
    if (!roleId) {
      toast.error('Selecione um perfil.')
      return
    }

    setSaving(true)
    try {
      let saved: User
      if (mode === 'create') {
        saved = await apiPost<User>('/admin/users', {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role_id: roleId,
        })
        toast.success('Usuário criado com sucesso.')
      } else {
        const body: Record<string, unknown> = { name: name.trim(), role_id: roleId }
        if (password) body.password = password
        saved = await apiPatch<User>(`/admin/users/${initial!.id}`, body)
        toast.success('Usuário atualizado.')
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
            <UserPlus className="size-4 text-[#0F1C38]" />
            <h2 className="text-base font-semibold text-[#0F1C38]">
              {mode === 'create' ? 'Novo Usuário' : 'Editar Usuário'}
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
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="u-name" className="text-sm font-medium">Nome completo</Label>
            <Input
              id="u-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: João Silva"
              className="h-10"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="u-email" className="text-sm font-medium">E-mail</Label>
            <Input
              id="u-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="joao@empresa.com"
              disabled={mode === 'edit'}
              className="h-10 disabled:opacity-60"
            />
            {mode === 'edit' && (
              <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado.</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="u-pw" className="text-sm font-medium">
              {mode === 'create' ? 'Senha' : 'Nova senha (deixe em branco para manter)'}
            </Label>
            <div className="relative">
              <Input
                id="u-pw"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'create' ? 'Mínimo 6 caracteres' : '••••••••'}
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label htmlFor="u-role" className="text-sm font-medium">Perfil de acesso</Label>
            <select
              id="u-role"
              value={roleId}
              onChange={(e) => setRoleId(Number(e.target.value))}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <Separator />

          {/* Actions */}
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
                <><Check className="size-4 mr-2" />{mode === 'create' ? 'Criar usuário' : 'Salvar'}</>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { isAdmin } = useUser()

  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editTarget, setEditTarget] = useState<User | null>(null)

  const [togglingId, setTogglingId] = useState<number | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const [u, r] = await Promise.all([
        apiGet<User[]>('/admin/users'),
        apiGet<Role[]>('/admin/roles'),
      ])
      setUsers(u)
      setRoles(r)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  function openCreate() {
    setEditTarget(null)
    setModalMode('create')
    setModalOpen(true)
  }

  function openEdit(u: User) {
    setEditTarget(u)
    setModalMode('edit')
    setModalOpen(true)
  }

  function handleSaved(saved: User) {
    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === saved.id)
      return idx >= 0
        ? prev.map((u) => (u.id === saved.id ? saved : u))
        : [saved, ...prev]
    })
    setModalOpen(false)
  }

  async function toggleActive(u: User) {
    setTogglingId(u.id)
    try {
      const updated = await apiPatch<User>(`/admin/users/${u.id}`, {
        is_active: !u.is_active,
      })
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      toast.success(updated.is_active ? 'Usuário ativado.' : 'Usuário desativado.')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setTogglingId(null)
    }
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    return (
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.role_name ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Toaster richColors position="top-right" />

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#0F1C38]/8">
            <Users className="size-5 text-[#0F1C38]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Gestão de Usuários</h1>
            <p className="text-sm text-muted-foreground">
              Cadastre e gerencie os acessos ao sistema
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button
            onClick={openCreate}
            className="bg-[#0F1C38] hover:bg-[#162444] text-white shrink-0"
          >
            <UserPlus className="size-4 mr-2" />
            Novo Usuário
          </Button>
        )}
      </div>

      {/* Search + table card */}
      <Card>
        {/* Search bar */}
        <div className="flex items-center gap-3 border-b border-[#B4B9BE] px-5 py-4">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou perfil…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" />
            Carregando usuários…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Users className="size-8 opacity-30" />
            <p className="text-sm">{search ? 'Nenhum resultado encontrado.' : 'Nenhum usuário cadastrado.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#B4B9BE] text-left">
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Usuário</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">E-mail</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Perfil</th>
                  <th className="px-5 py-3 font-semibold text-muted-foreground">Status</th>
                  {isAdmin && (
                    <th className="px-5 py-3 font-semibold text-muted-foreground text-right">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => {
                  const badge = roleBadgeStyle(u.role_name)
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-[#B4B9BE]/50 last:border-0 hover:bg-slate-50/60 transition-colors"
                    >
                      {/* Avatar + name */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{
                              backgroundColor: [
                                '#0F1C38', '#1E40AF', '#166534', '#92400E', '#6D28D9',
                              ][i % 5],
                            }}
                          >
                            {initials(u.name)}
                          </div>
                          <span className="font-medium text-foreground">{u.name}</span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">
                        {u.email}
                      </td>

                      {/* Role badge */}
                      <td className="px-5 py-3.5">
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                          style={{
                            backgroundColor: badge.bg,
                            color: badge.text,
                            borderColor: badge.border,
                          }}
                        >
                          <ShieldCheck className="size-3" />
                          {u.role_name ?? '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          style={{
                            backgroundColor: u.is_active ? '#F0FDF4' : '#FEF2F2',
                            color: u.is_active ? '#166534' : '#991B1B',
                          }}
                        >
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: u.is_active ? '#16A34A' : '#DC2626' }}
                          />
                          {u.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>

                      {/* Actions */}
                      {isAdmin && (
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(u)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#0F1C38] transition-colors"
                              title="Editar"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              onClick={() => toggleActive(u)}
                              disabled={togglingId === u.id}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#0F1C38] transition-colors disabled:opacity-50"
                              title={u.is_active ? 'Desativar' : 'Ativar'}
                            >
                              {togglingId === u.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : u.is_active ? (
                                <ToggleRight className="size-3.5" />
                              ) : (
                                <ToggleLeft className="size-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer count */}
        {!loading && filtered.length > 0 && (
          <div className="border-t border-[#B4B9BE]/50 px-5 py-3 text-xs text-muted-foreground">
            {filtered.length} usuário{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
            {search && ` para "${search}"`}
          </div>
        )}
      </Card>

      {/* Modal */}
      {modalOpen && (
        <UserModal
          mode={modalMode}
          initial={editTarget}
          roles={roles}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
