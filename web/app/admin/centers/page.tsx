'use client'

import { useCallback, useEffect, useState } from 'react'
import { Factory, Loader2, Pencil, Plus, Trash2, X, Check } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { useUser } from '@/contexts/user-context'
import { createCenter, deleteCenter, getCenters, updateCenter, type Center } from '@/lib/supabase-api'
import { toErpText } from '@/lib/erp-text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLoading } from '@/components/ui/page-loading'

/** Centros da empresa (migration 045): o cadastro escolhe o inicial e a Ampliação acrescenta outros. */
export default function CentersPage() {
  const { can } = useUser()
  const canEdit = can('can_manage_fields')
  const [centers, setCenters] = useState<Center[]>([])
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<{ id: number; code: string; name: string } | null>(null)

  const load = useCallback(async () => {
    try {
      setCenters(await getCenters())
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Não foi possível carregar os centros.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const upper = (v: string) => toErpText(v.toUpperCase())

  async function handleCreate() {
    if (!code.trim() || !name.trim()) {
      toast.error('Informe o código e o nome do centro.')
      return
    }
    setSaving(true)
    try {
      await createCenter({ code, name })
      setCode('')
      setName('')
      toast.success('Centro cadastrado.')
      await load()
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Não foi possível cadastrar o centro.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit() {
    if (!editing) return
    if (!editing.code.trim() || !editing.name.trim()) {
      toast.error('Informe o código e o nome do centro.')
      return
    }
    try {
      await updateCenter(editing.id, { code: editing.code, name: editing.name })
      setEditing(null)
      toast.success('Centro alterado.')
      await load()
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Não foi possível alterar o centro.')
    }
  }

  async function handleToggle(center: Center) {
    try {
      await updateCenter(center.id, { is_active: !center.is_active })
      await load()
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Não foi possível alterar o centro.')
    }
  }

  async function handleDelete(center: Center) {
    if (!window.confirm(`Excluir o centro ${center.code}?`)) return
    try {
      await deleteCenter(center.id)
      toast.success('Centro excluído.')
      await load()
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Não foi possível excluir o centro.')
    }
  }

  if (loading) return <PageLoading label="Carregando centros…" />

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <Toaster position="top-right" richColors />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-foreground">
          <Factory className="size-6" />
          Centros
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Centros da empresa. A solicitação de cadastro escolhe o centro inicial do material; a Ampliação acrescenta outro centro. Os campos marcados &quot;Por centro&quot; no Dicionário de Campos são pedidos para cada centro.
        </p>
      </div>

      {canEdit ? (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-[120px_1fr_auto] dark:border-zinc-700/50 dark:bg-card">
          <div>
            <label htmlFor="center-code" className="text-xs font-medium text-muted-foreground">Código * (até 4)</label>
            <Input id="center-code" value={code} maxLength={4} onChange={(e) => setCode(upper(e.target.value))} className="mt-1 uppercase" />
          </div>
          <div>
            <label htmlFor="center-name" className="text-xs font-medium text-muted-foreground">Nome *</label>
            <Input id="center-name" value={name} maxLength={120} onChange={(e) => setName(upper(e.target.value))} className="mt-1 uppercase" />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void handleCreate()} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Novo centro
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Somente visualização: seu perfil não tem permissão para editar centros.</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-zinc-700/50 dark:bg-card">
        {centers.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Nenhum centro cadastrado. Sem centro, o cadastro de material não pede centro e a Ampliação fica indisponível.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-600 dark:bg-muted/30 dark:text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5">Código</th>
                <th className="px-5 py-2.5">Nome</th>
                <th className="px-5 py-2.5">Situação</th>
                {canEdit && <th className="px-5 py-2.5 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-700/50">
              {centers.map((center) => {
                const isEditing = editing?.id === center.id
                return (
                  <tr key={center.id} data-testid={`center-${center.code}`}>
                    <td className="px-5 py-2.5 font-mono font-semibold">
                      {isEditing ? (
                        <Input aria-label="Código do centro" value={editing.code} maxLength={4} onChange={(e) => setEditing({ ...editing, code: upper(e.target.value) })} className="h-8 uppercase" />
                      ) : center.code}
                    </td>
                    <td className="px-5 py-2.5">
                      {isEditing ? (
                        <Input aria-label="Nome do centro" value={editing.name} maxLength={120} onChange={(e) => setEditing({ ...editing, name: upper(e.target.value) })} className="h-8 uppercase" />
                      ) : center.name}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={center.is_active ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
                        {center.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-5 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          {isEditing ? (
                            <>
                              <Button size="sm" variant="ghost" aria-label="Salvar centro" onClick={() => void handleSaveEdit()}><Check className="size-4" /></Button>
                              <Button size="sm" variant="ghost" aria-label="Cancelar edição" onClick={() => setEditing(null)}><X className="size-4" /></Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="ghost" aria-label={`Editar ${center.code}`} onClick={() => setEditing({ id: center.id, code: center.code, name: center.name })}><Pencil className="size-4" /></Button>
                              <Button size="sm" variant="outline" onClick={() => void handleToggle(center)}>{center.is_active ? 'Desativar' : 'Ativar'}</Button>
                              <Button size="sm" variant="ghost" aria-label={`Excluir ${center.code}`} onClick={() => void handleDelete(center)}><Trash2 className="size-4 text-red-600" /></Button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
