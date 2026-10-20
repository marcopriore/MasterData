'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  DEFAULT_METHOD,
  ERP_AUTH_LABEL,
  ERP_AUTH_TYPES,
  ERP_METHODS,
  ERP_OPERATION_LABEL,
  ERP_OPERATIONS,
  ERP_SECRET_LABEL,
  type ErpAuthType,
  type ErpConnectionView,
  type ErpMethod,
  type ErpOperation,
} from '@/lib/erp-connections'

type FormState = {
  name: string
  operation: ErpOperation
  http_method: ErpMethod
  endpoint_url: string
  timeout_seconds: number
  auth_type: ErpAuthType
  auth_header_name: string
  auth_username: string
  auth_token_url: string
  auth_scope: string
  secret: string
}

const EMPTY: FormState = {
  name: ERP_OPERATION_LABEL.criar_material,
  operation: 'criar_material',
  http_method: 'POST',
  endpoint_url: '',
  timeout_seconds: 15,
  auth_type: 'none',
  auth_header_name: 'x-api-key',
  auth_username: '',
  auth_token_url: '',
  auth_scope: '',
  secret: '',
}

const selectClass = 'mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm'

function fromView(view: ErpConnectionView): FormState {
  return {
    name: view.name,
    operation: view.operation,
    http_method: view.http_method,
    endpoint_url: view.endpoint_url,
    timeout_seconds: Math.round(view.timeout_ms / 1000),
    auth_type: view.auth_type,
    auth_header_name: view.auth_header_name || 'x-api-key',
    auth_username: view.auth_username,
    auth_token_url: view.auth_token_url,
    auth_scope: view.auth_scope,
    secret: '',
  }
}

export function ErpConnectionsPanel({ tenantId }: { tenantId: number }) {
  const baseUrl = `/api/admin/tenants/${tenantId}/erp-connections`
  const [rows, setRows] = useState<ErpConnectionView[]>([])
  const [secretBoxReady, setSecretBoxReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [editing, setEditing] = useState<ErpConnectionView | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(baseUrl)
      const payload = await res.json() as { connections?: ErpConnectionView[]; secret_box_ready?: boolean; error?: string }
      if (!res.ok) {
        toast.error(payload.error ?? 'Não foi possível carregar as integrações.')
        setRows([])
        return
      }
      setRows(payload.connections ?? [])
      setSecretBoxReady(payload.secret_box_ready === true)
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  useEffect(() => { void load() }, [load])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function changeOperation(operation: ErpOperation) {
    setForm((prev) => ({
      ...prev,
      operation,
      http_method: editing ? prev.http_method : DEFAULT_METHOD[operation],
      name: editing || (prev.name && prev.name !== ERP_OPERATION_LABEL[prev.operation]) ? prev.name : ERP_OPERATION_LABEL[operation],
    }))
  }

  function startEdit(row: ErpConnectionView) {
    setEditing(row)
    setForm(fromView(row))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(EMPTY)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(editing ? `${baseUrl}/${editing.id}` : baseUrl, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          operation: form.operation,
          http_method: form.http_method,
          endpoint_url: form.endpoint_url,
          timeout_ms: form.timeout_seconds * 1000,
          auth_type: form.auth_type,
          auth_header_name: form.auth_header_name,
          auth_username: form.auth_username,
          auth_token_url: form.auth_token_url,
          auth_scope: form.auth_scope,
          secret: form.secret,
        }),
      })
      const payload = await res.json() as { connection?: ErpConnectionView; error?: string; errors?: string[] }
      if (!res.ok || !payload.connection) {
        toast.error(payload.errors?.length ? payload.errors.join('\n') : payload.error ?? 'Não foi possível salvar.')
        return
      }
      if (!editing && !payload.connection.is_active) {
        toast.message('Integração incluída desativada: já existe outra ativa para esta operação.')
      } else {
        toast.success(editing ? 'Integração modificada.' : 'Integração incluída.')
      }
      cancelEdit()
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function toggle(row: ErpConnectionView) {
    setBusyId(row.id)
    try {
      const res = await fetch(`${baseUrl}/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !row.is_active }),
      })
      const payload = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) {
        toast.error(payload.error ?? 'Não foi possível alterar.')
        return
      }
      toast.success(row.is_active ? 'Integração desativada.' : 'Integração ativada.')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function remove(row: ErpConnectionView) {
    if (!window.confirm(`Excluir a integração "${row.name}"? A URL e o segredo gravados saem junto.`)) return
    setBusyId(row.id)
    try {
      const res = await fetch(`${baseUrl}/${row.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string }
        toast.error(payload.error ?? 'Não foi possível excluir.')
        return
      }
      if (editing?.id === row.id) cancelEdit()
      toast.success('Integração excluída.')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const secretLabel = ERP_SECRET_LABEL[form.auth_type]
  const keepsSecret = Boolean(editing?.has_secret && editing.auth_type === form.auth_type)

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit}>
        <Card className="bg-card text-card-foreground">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{editing ? `Modificar integração — ${editing.name}` : 'Nova integração com o ERP'}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cada operação tem sua própria URL, tipo e autenticação. Só uma integração fica ativa por operação.
              A chamada real ainda não está ligada: o botão Integrar com ERP continua simulado.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="erp-operation">Operação</Label>
                <select
                  id="erp-operation"
                  value={form.operation}
                  onChange={(e) => changeOperation(e.target.value as ErpOperation)}
                  className={selectClass}
                >
                  {ERP_OPERATIONS.map((op) => <option key={op} value={op}>{ERP_OPERATION_LABEL[op]}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="erp-method">Tipo de integração</Label>
                <select
                  id="erp-method"
                  value={form.http_method}
                  onChange={(e) => set('http_method', e.target.value as ErpMethod)}
                  className={selectClass}
                >
                  {ERP_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="erp-timeout">Tempo limite (segundos)</Label>
                <Input
                  id="erp-timeout"
                  type="number"
                  min={1}
                  max={60}
                  value={form.timeout_seconds}
                  onChange={(e) => set('timeout_seconds', Number(e.target.value))}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="erp-name">Nome</Label>
              <Input
                id="erp-name"
                value={form.name}
                maxLength={100}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Ex.: Criação de material — SAP"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="erp-url">URL do endpoint de saída</Label>
              <Input
                id="erp-url"
                value={form.endpoint_url}
                onChange={(e) => set('endpoint_url', e.target.value)}
                placeholder="https://erp.empresa.com.br/api/materiais/{id_erp}"
                className="mt-1 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Use {'{id_erp}'} ou {'{id_sistema}'} quando o ERP pedir o código do material no caminho.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="erp-auth">Tipo de autenticação</Label>
                <select
                  id="erp-auth"
                  value={form.auth_type}
                  onChange={(e) => set('auth_type', e.target.value as ErpAuthType)}
                  className={selectClass}
                >
                  {ERP_AUTH_TYPES.map((type) => <option key={type} value={type}>{ERP_AUTH_LABEL[type]}</option>)}
                </select>
              </div>
              {form.auth_type === 'api_key' && (
                <div>
                  <Label htmlFor="erp-header">Nome do header</Label>
                  <Input
                    id="erp-header"
                    value={form.auth_header_name}
                    onChange={(e) => set('auth_header_name', e.target.value)}
                    className="mt-1 font-mono text-sm"
                  />
                </div>
              )}
              {(form.auth_type === 'basic' || form.auth_type === 'oauth2_client_credentials') && (
                <div>
                  <Label htmlFor="erp-user">{form.auth_type === 'basic' ? 'Usuário' : 'Client ID'}</Label>
                  <Input
                    id="erp-user"
                    value={form.auth_username}
                    onChange={(e) => set('auth_username', e.target.value)}
                    autoComplete="off"
                    className="mt-1"
                  />
                </div>
              )}
            </div>

            {form.auth_type === 'oauth2_client_credentials' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="erp-token-url">URL do token</Label>
                  <Input
                    id="erp-token-url"
                    value={form.auth_token_url}
                    onChange={(e) => set('auth_token_url', e.target.value)}
                    placeholder="https://auth.empresa.com.br/oauth/token"
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="erp-scope">Scope (opcional)</Label>
                  <Input id="erp-scope" value={form.auth_scope} onChange={(e) => set('auth_scope', e.target.value)} className="mt-1" />
                </div>
              </div>
            )}

            {form.auth_type !== 'none' && (
              <div>
                <Label htmlFor="erp-secret">{secretLabel}</Label>
                <Input
                  id="erp-secret"
                  type="password"
                  value={form.secret}
                  onChange={(e) => set('secret', e.target.value)}
                  autoComplete="new-password"
                  placeholder={keepsSecret ? 'Guardado. Deixe em branco para manter.' : ''}
                  disabled={!secretBoxReady}
                  className="mt-1"
                />
                <p className={`mt-1 text-xs ${secretBoxReady ? 'text-muted-foreground' : 'text-red-700'}`}>
                  {secretBoxReady
                    ? 'Gravado cifrado. Depois de salvo, não aparece de novo.'
                    : 'O servidor está sem INTEGRATION_SECRET_KEY. Sem ela o segredo não pode ser gravado.'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {editing && <Button type="button" variant="outline" onClick={cancelEdit}>Cancelar</Button>}
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : !editing && <Plus className="size-4" />}
                {editing ? 'Salvar alterações' : 'Incluir integração'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Card className="bg-card text-card-foreground">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Integrações cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Operação</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>URL do endpoint</TableHead>
                  <TableHead>Autenticação</TableHead>
                  <TableHead>Tempo limite</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhuma integração cadastrada.</TableCell></TableRow>
                ) : rows.map((row) => (
                  <TableRow key={row.id} className={editing?.id === row.id ? 'bg-muted/40' : undefined}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{ERP_OPERATION_LABEL[row.operation]}</TableCell>
                    <TableCell className="font-mono text-xs">{row.http_method}</TableCell>
                    <TableCell className="max-w-72 truncate font-mono text-xs" title={row.endpoint_url}>{row.endpoint_url}</TableCell>
                    <TableCell>
                      {ERP_AUTH_LABEL[row.auth_type]}
                      {row.auth_type !== 'none' && !row.has_secret && <span className="ml-1 text-xs text-red-700">(sem segredo)</span>}
                    </TableCell>
                    <TableCell>{Math.round(row.timeout_ms / 1000)} s</TableCell>
                    <TableCell className={row.is_active ? 'text-green-700' : 'text-muted-foreground'}>
                      {row.is_active ? 'Ativa' : 'Inativa'}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" className="gap-1" disabled={busyId === row.id} onClick={() => void toggle(row)}>
                          <Power className="size-3.5" />
                          {row.is_active ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="gap-1" disabled={busyId === row.id} onClick={() => startEdit(row)}>
                          <Pencil className="size-3.5" />
                          Modificar
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="gap-1 text-red-700" disabled={busyId === row.id} onClick={() => void remove(row)}>
                          <Trash2 className="size-3.5" />
                          Excluir
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
