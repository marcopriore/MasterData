'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { integrationStatusTone } from '@/lib/integration-log-status'

type LogRow = {
  id: number
  direction: 'outbound' | 'inbound'
  system: string
  client_name: string | null
  action: string
  method: string
  path: string
  status_code: number | null
  success: boolean
  duration_ms: number | null
  error_message: string | null
  detail: string | null
  created_at: string
}

const ACTION_LABEL: Record<string, string> = {
  criar_material: 'Criar material',
  alterar_material: 'Alterar material',
  consultar_material: 'Consultar material',
  criar_solicitacao: 'Criar solicitação',
  consultar_solicitacao: 'Consultar solicitação',
  eliminar_material: 'Eliminar material',
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('pt-BR')
}

function origin(row: LogRow) {
  if (row.system === 'erp') return 'ERP'
  return row.client_name ?? 'Sem chave válida'
}

export function IntegrationMonitor() {
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [direction, setDirection] = useState('todas')
  const [system, setSystem] = useState('todos')
  const [selected, setSelected] = useState<LogRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (direction !== 'todas') params.set('direction', direction)
      if (system !== 'todos') params.set('system', system)
      const res = await fetch(`/api/admin/integrations?${params.toString()}`)
      const payload = await res.json() as { data?: LogRow[]; error?: string }
      if (!res.ok) {
        toast.error(payload.error ?? 'Não foi possível carregar o monitor.')
        setRows([])
        return
      }
      setRows(payload.data ?? [])
    } catch {
      toast.error('Não foi possível carregar o monitor.')
    } finally {
      setLoading(false)
    }
  }, [direction, system])

  useEffect(() => { void load() }, [load])

  return (
    <>
      <Card className="bg-card text-card-foreground">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base">Últimas chamadas</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Entrada e saída</SelectItem>
                <SelectItem value="inbound">Entrada</SelectItem>
                <SelectItem value="outbound">Saída</SelectItem>
              </SelectContent>
            </Select>
            <Select value={system} onValueChange={setSystem}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="externo">Sistemas externos</SelectItem>
                <SelectItem value="erp">ERP</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Sentido</TableHead>
                  <TableHead>Sistema</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Material / solicitação</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duração</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma chamada registrada.</TableCell></TableRow>
                ) : rows.map((row) => {
                  const tone = integrationStatusTone(row.status_code, row.success)
                  return (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => setSelected(row)}>
                      <TableCell className="whitespace-nowrap">{formatWhen(row.created_at)}</TableCell>
                      <TableCell>{row.direction === 'outbound' ? 'Saída' : 'Entrada'}</TableCell>
                      <TableCell>{origin(row)}</TableCell>
                      <TableCell>{ACTION_LABEL[row.action] ?? row.action}</TableCell>
                      <TableCell className="font-mono text-xs">{row.detail || '—'}</TableCell>
                      <TableCell className={tone === 'ok' ? 'text-green-700' : tone === 'error' ? 'text-red-700' : ''}>
                        {row.status_code ?? '—'}
                      </TableCell>
                      <TableCell>{row.duration_ms != null ? `${row.duration_ms} ms` : '—'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={selected != null} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <DialogContent className="bg-card text-card-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected ? ACTION_LABEL[selected.action] ?? selected.action : ''}</DialogTitle>
          </DialogHeader>
          {selected && (
            <dl className="space-y-2 text-sm">
              <div><dt className="text-muted-foreground">Sistema</dt><dd>{origin(selected)}</dd></div>
              <div><dt className="text-muted-foreground">Chamada</dt><dd className="font-mono text-xs">{selected.method} {selected.path}</dd></div>
              <div><dt className="text-muted-foreground">Material / solicitação</dt><dd>{selected.detail || '—'}</dd></div>
              <div><dt className="text-muted-foreground">Erro</dt><dd className="whitespace-pre-wrap">{selected.error_message || '—'}</dd></div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
