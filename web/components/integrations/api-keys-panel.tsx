'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Copy, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type ApiClientRow = {
  id: number
  name: string
  key_prefix: string
  is_active: boolean
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

function formatWhen(iso: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('pt-BR')
}

export function ApiKeysPanel({ tenantId }: { tenantId: number }) {
  const baseUrl = `/api/admin/tenants/${tenantId}/api-clients`
  const [rows, setRows] = useState<ApiClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(baseUrl)
      const payload = await res.json() as { data?: ApiClientRow[]; error?: string }
      if (!res.ok) {
        toast.error(payload.error ?? 'Não foi possível carregar as chaves.')
        setRows([])
        return
      }
      setRows(payload.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  useEffect(() => { void load() }, [load])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const payload = await res.json() as { key?: string; error?: string }
      if (!res.ok || !payload.key) {
        toast.error(payload.error ?? 'Não foi possível gerar a chave.')
        return
      }
      setNewKey({ name: name.trim(), key: payload.key })
      setName('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke(row: ApiClientRow) {
    if (!window.confirm(`Revogar a chave de "${row.name}"? O sistema deixa de acessar as APIs na hora.`)) return
    const res = await fetch(`${baseUrl}/${row.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const payload = await res.json().catch(() => ({})) as { error?: string }
      toast.error(payload.error ?? 'Não foi possível revogar.')
      return
    }
    toast.success('Chave revogada.')
    await load()
  }

  async function copyKey() {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey.key)
    toast.success('Chave copiada.')
  }

  return (
    <div className="space-y-4">
      <Card className="bg-card text-card-foreground">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nova chave</CardTitle>
          <p className="text-sm text-muted-foreground">
            Uma chave por sistema externo. Ela dá acesso às APIs de material deste tenant no header <code>x-api-key</code>.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Label htmlFor="api-client-name">Nome do sistema</Label>
              <Input
                id="api-client-name"
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Portal de Compras"
                className="mt-1"
              />
            </div>
            <Button type="submit" disabled={saving || !name.trim()}>
              <KeyRound className="size-4" />
              Gerar chave
            </Button>
          </form>

          {newKey && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">Chave de {newKey.name}</p>
              <p className="mt-1">Copie agora. Ela não aparece de novo; se perder, revogue e gere outra.</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-white px-3 py-2 font-mono text-xs text-slate-900">{newKey.key}</code>
                <Button type="button" variant="outline" size="sm" onClick={() => void copyKey()}>
                  <Copy className="size-4" />
                  Copiar
                </Button>
              </div>
              <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setNewKey(null)}>
                Já copiei
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card text-card-foreground">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Chaves</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sistema</TableHead>
                  <TableHead>Início da chave</TableHead>
                  <TableHead>Criada</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma chave gerada.</TableCell></TableRow>
                ) : rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="font-mono text-xs">{row.key_prefix}…</TableCell>
                    <TableCell>{formatWhen(row.created_at)}</TableCell>
                    <TableCell>{formatWhen(row.last_used_at)}</TableCell>
                    <TableCell className={row.is_active ? 'text-green-700' : 'text-muted-foreground'}>
                      {row.is_active ? 'Ativa' : `Revogada em ${formatWhen(row.revoked_at)}`}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.is_active && (
                        <Button type="button" variant="outline" size="sm" onClick={() => void handleRevoke(row)}>
                          Revogar
                        </Button>
                      )}
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
