'use client'

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { apiGetWithAuth, apiPostWithAuth, apiPatchWithAuth, apiDownloadWithAuth, apiUploadWithAuth } from '@/lib/api'
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
  FileDown,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
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
    case 'ADMIN':       return { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' }
    case 'SOLICITANTE': return { bg: '#F0FDF4', text: '#166534', border: '#BBF7D0' }
    case 'TRIAGEM':     return { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' }
    case 'FISCAL':      return { bg: '#F5F3FF', text: '#5B21B6', border: '#DDD6FE' }
    case 'MASTER':      return { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' }
    case 'MRP':         return { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' }
    default:            return { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' }
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
  accessToken: string | null
  onClose: () => void
  onSaved: (u: User) => void
}

function UserModal({ mode, initial, roles, onClose, onSaved, accessToken }: UserModalProps) {
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

    if (!accessToken) {
      toast.error('Sessão expirada. Faça login novamente.')
      return
    }
    setSaving(true)
    try {
      let saved: User
      if (mode === 'create') {
        saved = await apiPostWithAuth<User>('/admin/users', {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role_id: roleId,
        }, accessToken)
        toast.success('Usuário criado com sucesso.')
      } else {
        const body: Record<string, unknown> = { name: name.trim(), role_id: roleId }
        if (password) body.password = password
        saved = await apiPatchWithAuth<User>(`/admin/users/${initial!.id}`, body, accessToken)
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

type UserImportRow = {
  row_number: number
  operacao: string
  email: string | null
  nome: string | null
  perfil: string | null
  ativo: string | null
  status: string
  errors: string[]
  warnings: string[]
}

export default function UsersPage() {
  const { can, accessToken, user } = useUser()
  const canManageUsers = user?.is_master || can('can_manage_users')

  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('create')
  const [editTarget, setEditTarget] = useState<User | null>(null)

  const [togglingId, setTogglingId] = useState<number | null>(null)

  const [showUserImportModal, setShowUserImportModal] = useState(false)
  const [userImportStep, setUserImportStep] = useState(1)
  const [userImportFile, setUserImportFile] = useState<File | null>(null)
  const [userImportResult, setUserImportResult] = useState<{
    users: { total_rows: number; valid_rows: number; error_rows: number; warning_rows: number; rows: UserImportRow[] }
  } | null>(null)
  const [userImportDownloading, setUserImportDownloading] = useState(false)
  const [userExporting, setUserExporting] = useState(false)
  const [userImportValidating, setUserImportValidating] = useState(false)
  const [userImportConfirming, setUserImportConfirming] = useState(false)
  const [userImportError, setUserImportError] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const [u, r] = await Promise.all([
        apiGetWithAuth<User[]>('/admin/users', accessToken),
        apiGetWithAuth<Role[]>('/admin/roles', accessToken),
      ])
      setUsers(u)
      setRoles(r)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (accessToken) fetchUsers()
  }, [accessToken, fetchUsers])

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
    if (!accessToken) return
    setTogglingId(u.id)
    try {
      const updated = await apiPatchWithAuth<User>(`/admin/users/${u.id}`, {
        is_active: !u.is_active,
      }, accessToken)
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      toast.success(updated.is_active ? 'Usuário ativado.' : 'Usuário desativado.')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setTogglingId(null)
    }
  }

  const closeUserImportModal = () => {
    setShowUserImportModal(false)
    setUserImportStep(1)
    setUserImportFile(null)
    setUserImportResult(null)
    setUserImportError(null)
  }

  const handleUserDownloadTemplate = async () => {
    if (!accessToken) return
    setUserImportDownloading(true)
    try {
      await apiDownloadWithAuth('/admin/users/import-template', accessToken, 'template_importacao_usuarios.xlsx')
      toast.success('Template baixado com sucesso!')
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Falha ao baixar template')
    } finally {
      setUserImportDownloading(false)
    }
  }

  const handleUserExport = async () => {
    if (!accessToken) return
    setUserExporting(true)
    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      await apiDownloadWithAuth('/admin/users/export', accessToken, `usuarios_export_${today}.xlsx`)
      toast.success('Exportação concluída!')
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Falha ao exportar')
    } finally {
      setUserExporting(false)
    }
  }

  const handleUserValidateFile = async () => {
    if (!accessToken || !userImportFile) return
    setUserImportValidating(true)
    setUserImportError(null)
    try {
      const res = await apiUploadWithAuth<{
        dry_run: boolean
        users: { total_rows: number; valid_rows: number; error_rows: number; warning_rows: number; rows: UserImportRow[] }
      }>('/admin/users/import?dry_run=true', userImportFile, accessToken)
      setUserImportResult(res)
      setUserImportStep(3)
    } catch (err) {
      setUserImportError((err as Error)?.message ?? 'Falha ao validar planilha')
    } finally {
      setUserImportValidating(false)
    }
  }

  const handleUserConfirmImport = async () => {
    if (!accessToken || !userImportFile) return
    setUserImportConfirming(true)
    setUserImportError(null)
    try {
      const res = await apiUploadWithAuth<{ dry_run: boolean; created: number; updated: number }>(
        '/admin/users/import?dry_run=false',
        userImportFile,
        accessToken
      )
      toast.success(`Importação concluída: ${res.created} criados, ${res.updated} atualizados`)
      fetchUsers()
      closeUserImportModal()
    } catch (err) {
      setUserImportError((err as Error)?.message ?? 'Falha ao importar')
    } finally {
      setUserImportConfirming(false)
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
        <div className="flex items-center gap-2 shrink-0">
          {canManageUsers && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUserExport}
                disabled={userExporting}
                className="border-zinc-300 dark:border-zinc-600"
              >
                {userExporting ? <Loader2 className="size-4 animate-spin mr-2" /> : <FileDown className="size-4 mr-2" />}
                Exportar Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUserImportModal(true)}
                className="border-zinc-300 dark:border-zinc-600"
              >
                <Upload className="size-4 mr-2" />
                Importação em Massa
              </Button>
            </>
          )}
          {canManageUsers && (
            <Button
              onClick={openCreate}
              className="bg-[#0F1C38] hover:bg-[#162444] text-white shrink-0"
            >
              <UserPlus className="size-4 mr-2" />
              Novo Usuário
            </Button>
          )}
        </div>
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
                  {canManageUsers && (
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
                      {canManageUsers && (
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

      {/* Modal Importação em Massa Usuários */}
      {showUserImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/60 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-start justify-between border-b border-zinc-200 px-6 py-4 shrink-0 dark:border-zinc-700">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Importação em Massa de Usuários
                </h2>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  Etapa {userImportStep} de 3
                </p>
              </div>
              <button
                onClick={closeUserImportModal}
                disabled={userImportValidating || userImportConfirming}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors disabled:opacity-50"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {userImportStep === 1 && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50 space-y-3">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Regras principais:</p>
                    <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                      <li>A planilha tem uma aba <strong>Usuários</strong></li>
                      <li><strong>operacao=C</strong>: cria usuário com senha inicial &quot;Mudar@1234&quot;</li>
                      <li><strong>operacao=E</strong>: atualiza nome, perfil e/ou ativo — e-mail não pode ser alterado</li>
                      <li>Perfis aceitos: ADMIN, MASTER, TRIAGEM, FISCAL, MRP, SOLICITANTE</li>
                      <li>ativo aceita: Sim ou Não</li>
                      <li>Não alterar os nomes das colunas do cabeçalho</li>
                    </ul>
                  </div>
                  <Button
                    onClick={handleUserDownloadTemplate}
                    disabled={userImportDownloading}
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {userImportDownloading ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
                    Baixar Planilha Template
                  </Button>
                </div>
              )}
              {userImportStep === 2 && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => { e.preventDefault() }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const f = e.dataTransfer.files[0]
                      if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
                        setUserImportFile(f)
                      } else {
                        toast.error('Apenas arquivos .xlsx ou .xls são aceitos')
                      }
                    }}
                    onClick={() => document.getElementById('user-import-file')?.click()}
                    className="border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500"
                  >
                    <input
                      id="user-import-file"
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) setUserImportFile(f)
                        e.target.value = ''
                      }}
                    />
                    <FileSpreadsheet className="size-10 text-zinc-400 dark:text-zinc-500" />
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Arraste a planilha aqui ou clique para selecionar
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Formatos aceitos: .xlsx, .xls</p>
                    {userImportFile && (
                      <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-2">
                        ✓ {userImportFile.name}
                      </p>
                    )}
                  </div>
                  {userImportFile && (
                    <Button onClick={handleUserValidateFile} disabled={userImportValidating} className="gap-2">
                      {userImportValidating ? <Loader2 className="size-4 animate-spin" /> : null}
                      Validar Planilha
                    </Button>
                  )}
                </div>
              )}
              {userImportStep === 3 && userImportResult && (
                <div className="space-y-6">
                  {userImportError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{userImportError}</p>
                  )}
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Aba Usuários</h3>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        Total: {userImportResult.users?.total_rows ?? 0}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Válidas: {userImportResult.users?.valid_rows ?? 0}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                        Avisos: {userImportResult.users?.warning_rows ?? 0}
                      </span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        Erros: {userImportResult.users?.error_rows ?? 0}
                      </span>
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-zinc-100 dark:bg-zinc-800">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Linha</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Op.</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Email</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Nome</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Perfil</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Ativo</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Status</th>
                            <th className="px-3 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-300">Erros/Avisos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(userImportResult.users?.rows ?? [])
                            .sort((a, b) => (a.status === 'error' ? 0 : a.status === 'warning' ? 1 : 2) - (b.status === 'error' ? 0 : b.status === 'warning' ? 1 : 2))
                            .map((r) => (
                              <tr
                                key={`user-${r.row_number}`}
                                className={
                                  r.status === 'error'
                                    ? 'bg-red-50 dark:bg-red-900/20'
                                    : r.status === 'warning'
                                      ? 'bg-yellow-50 dark:bg-yellow-900/20'
                                      : 'bg-white dark:bg-zinc-900'
                                }
                              >
                                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.row_number}</td>
                                <td className="px-3 py-2">
                                  {r.operacao === 'C' && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Criação</span>}
                                  {r.operacao === 'E' && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Edição</span>}
                                  {!['C', 'E'].includes(r.operacao) && <span className="text-zinc-600 dark:text-zinc-400">{r.operacao}</span>}
                                </td>
                                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 max-w-[160px] truncate">{r.email ?? '—'}</td>
                                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300 max-w-[120px] truncate">{r.nome ?? '—'}</td>
                                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.perfil ?? '—'}</td>
                                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.ativo ?? '—'}</td>
                                <td className="px-3 py-2">
                                  {r.status === 'ok' && <span className="text-green-600 dark:text-green-400"><CheckCircle2 className="size-3.5 inline" /> ok</span>}
                                  {r.status === 'warning' && <span className="text-yellow-600 dark:text-yellow-400"><AlertTriangle className="size-3.5 inline" /> aviso</span>}
                                  {r.status === 'error' && <span className="text-red-600 dark:text-red-400"><XCircle className="size-3.5 inline" /> erro</span>}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {r.errors?.map((e, i) => <p key={i} className="text-red-600 dark:text-red-400"><XCircle className="size-3 inline" /> {e}</p>)}
                                  {r.warnings?.map((w, i) => <p key={i} className="text-yellow-600 dark:text-yellow-400"><AlertTriangle className="size-3 inline" /> {w}</p>)}
                                  {(!r.errors?.length && !r.warnings?.length) && '—'}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {(userImportResult.users?.error_rows ?? 0) > 0
                      ? 'Corrija os erros antes de confirmar a importação'
                      : 'Pronto para confirmar a importação'}
                  </p>
                </div>
              )}
            </div>
            <div className="border-t border-zinc-200 px-6 py-4 flex justify-between shrink-0 dark:border-zinc-700">
              <div>
                {userImportStep === 1 && <Button variant="outline" size="sm" onClick={closeUserImportModal}>Cancelar</Button>}
                {userImportStep === 2 && <Button variant="outline" size="sm" onClick={() => setUserImportStep(1)}>← Voltar</Button>}
                {userImportStep === 3 && <Button variant="outline" size="sm" onClick={() => setUserImportStep(2)} disabled={userImportConfirming}>← Voltar</Button>}
              </div>
              <div className="flex gap-2">
                {userImportStep === 1 && <Button size="sm" onClick={() => setUserImportStep(2)}>Próximo →</Button>}
                {userImportStep === 2 && (
                  <Button size="sm" onClick={handleUserValidateFile} disabled={!userImportFile || userImportValidating}>
                    {userImportValidating ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                    Validar Planilha
                  </Button>
                )}
                {userImportStep === 3 && (
                  <Button
                    size="sm"
                    onClick={handleUserConfirmImport}
                    disabled={(userImportResult?.users?.error_rows ?? 0) > 0 || userImportConfirming}
                    className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                  >
                    {userImportConfirming ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                    Confirmar Importação
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <UserModal
          mode={modalMode}
          initial={editTarget}
          roles={roles}
          accessToken={accessToken}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
