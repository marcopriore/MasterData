'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Headphones, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { AttachmentFileList } from '@/components/support/attachment-file-list'
import { CharacterCounter } from '@/components/support/character-counter'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  AXISDESK_PRIORIDADE_OPTIONS,
  AXISDESK_STATUS_OPTIONS,
  AXISDESK_TIPO_OPTIONS,
  getAxisDeskPrioridadeLabel,
  getAxisDeskStatusLabel,
  type AxisDeskCategoria,
  type AxisDeskChamado,
  type AxisDeskChamadoPrioridade,
  type AxisDeskChamadoTipo,
} from '@/lib/axisdesk/types'
import {
  AXISDESK_MAX_TEXTO,
  AXISDESK_MAX_TITULO,
  filesToAnexos,
  mergeSelectedFiles,
  removeSelectedFile,
  validateAnexoFiles,
} from '@/lib/axisdesk/support-form'

type FormState = {
  tipo: AxisDeskChamadoTipo
  categoriaId: string
  subcategoriaId: string
  titulo: string
  descricao: string
  prioridade: AxisDeskChamadoPrioridade
  anexos: File[]
}

const EMPTY_FORM: FormState = {
  tipo: 'incidente',
  categoriaId: '',
  subcategoriaId: '',
  titulo: '',
  descricao: '',
  prioridade: 'media',
  anexos: [],
}

function formatWhen(iso?: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR')
}

export function SupportPage() {
  const router = useRouter()
  const [tickets, setTickets] = useState<AxisDeskChamado[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('todos')
  const [tipo, setTipo] = useState('todos')
  const [prioridade, setPrioridade] = useState('todos')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [categorias, setCategorias] = useState<AxisDeskCategoria[]>([])
  const [categoriasLoading, setCategoriasLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  async function load(silent = false) {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch('/api/support/tickets')
      const payload = await res.json() as { data?: AxisDeskChamado[]; error?: string }
      if (!res.ok) {
        toast.error(payload.error ?? 'Não foi possível carregar os chamados.')
        setTickets([])
        return
      }
      setTickets(payload.data ?? [])
    } catch {
      toast.error('Não foi possível carregar os chamados.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setCategoriasLoading(true)
    void (async () => {
      const res = await fetch(`/api/support/categorias?tipo=${form.tipo}`)
      const payload = await res.json() as { data?: AxisDeskCategoria[] }
      if (!cancelled && res.ok) setCategorias(payload.data ?? [])
      if (!cancelled) setCategoriasLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, form.tipo])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tickets.filter((ticket) => {
      if (status !== 'todos' && ticket.status !== status) return false
      if (tipo !== 'todos' && ticket.tipo !== tipo) return false
      if (prioridade !== 'todos' && ticket.prioridade !== prioridade) return false
      if (!q) return true
      return ticket.titulo.toLowerCase().includes(q)
    })
  }, [tickets, query, status, tipo, prioridade])

  const subcategorias = categorias.find((item) => item.id === form.categoriaId)?.subcategorias ?? []
  const canSubmit = form.titulo.trim().length > 0 && form.descricao.trim().length > 0 && Boolean(form.categoriaId) && Boolean(form.subcategoriaId)

  function resetForm() {
    setForm(EMPTY_FORM)
  }

  async function submit() {
    const anexoError = validateAnexoFiles(form.anexos)
    if (anexoError) {
      toast.error(anexoError)
      return
    }
    setSaving(true)
    try {
      const anexos = form.anexos.length > 0 ? await filesToAnexos(form.anexos) : undefined
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: form.tipo,
          titulo: form.titulo,
          descricao: form.descricao,
          prioridade: form.prioridade,
          categoria_id: form.categoriaId,
          subcategoria_id: form.subcategoriaId,
          anexos,
        }),
      })
      const payload = await res.json() as { data?: { id?: string }; error?: string }
      if (!res.ok) {
        toast.error(payload.error ?? 'Não foi possível abrir o chamado.')
        return
      }
      toast.success('Chamado aberto.')
      setOpen(false)
      resetForm()
      if (payload.data?.id) router.push(`/support/${payload.data.id}`)
      else await load(true)
    } catch {
      toast.error('Não foi possível abrir o chamado.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Headphones className="size-6 text-primary" />
            Suporte
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Abra e acompanhe chamados com a equipe AxisStrategy.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load(true)} disabled={refreshing || loading}>
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Novo chamado
          </Button>
        </div>
      </div>

      <Card className="bg-card text-card-foreground">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base">Chamados da empresa</CardTitle>
          <span className="text-sm text-muted-foreground">{filtered.length} resultado(s)</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex w-56 flex-col">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Título</p>
              <Input placeholder="Buscar por título…" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="flex w-40 flex-col">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Tipo</p>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {AXISDESK_TIPO_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-52 flex-col">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Status</p>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {AXISDESK_STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-40 flex-col">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Prioridade</p>
              <Select value={prioridade} onValueChange={setPrioridade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {AXISDESK_PRIORIDADE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Carregando chamados…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum chamado encontrado.</TableCell></TableRow>
                ) : filtered.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="max-w-[220px] truncate font-medium">{ticket.titulo}</TableCell>
                    <TableCell>{AXISDESK_TIPO_OPTIONS.find((option) => option.value === ticket.tipo)?.label ?? ticket.tipo}</TableCell>
                    <TableCell>{getAxisDeskStatusLabel(ticket.status)}</TableCell>
                    <TableCell>{getAxisDeskPrioridadeLabel(ticket.prioridade)}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{ticket.categoria?.nome ?? '—'}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{ticket.solicitante?.nome ?? '—'}</TableCell>
                    <TableCell>{formatWhen(ticket.sla_prazo)}</TableCell>
                    <TableCell>{formatWhen(ticket.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/support/${ticket.id}`)}>
                        Ver detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm() }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-card text-card-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo chamado</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={(value) => setForm((current) => ({ ...current, tipo: value as AxisDeskChamadoTipo, categoriaId: '', subcategoriaId: '' }))}
              >
                <SelectTrigger id="tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AXISDESK_TIPO_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria</Label>
              <Select
                value={form.categoriaId || undefined}
                onValueChange={(value) => setForm((current) => ({ ...current, categoriaId: value, subcategoriaId: '' }))}
                disabled={categoriasLoading || categorias.length === 0}
              >
                <SelectTrigger id="categoria">
                  <SelectValue placeholder={categoriasLoading ? 'Carregando categorias…' : 'Selecione a categoria'} />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subcategoria">Subcategoria</Label>
              <Select
                value={form.subcategoriaId || undefined}
                onValueChange={(value) => setForm((current) => ({ ...current, subcategoriaId: value }))}
                disabled={!form.categoriaId || subcategorias.length === 0}
              >
                <SelectTrigger id="subcategoria"><SelectValue placeholder="Selecione a subcategoria" /></SelectTrigger>
                <SelectContent>
                  {subcategorias.map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                value={form.titulo}
                maxLength={AXISDESK_MAX_TITULO}
                placeholder="Resumo do problema ou solicitação"
                onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))}
              />
              <CharacterCounter current={form.titulo.length} max={AXISDESK_MAX_TITULO} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea
                id="descricao"
                value={form.descricao}
                maxLength={AXISDESK_MAX_TEXTO}
                rows={4}
                placeholder="Descreva com o máximo de detalhes possível"
                onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))}
              />
              <CharacterCounter current={form.descricao.length} max={AXISDESK_MAX_TEXTO} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Select
                value={form.prioridade}
                onValueChange={(value) => setForm((current) => ({ ...current, prioridade: value as AxisDeskChamadoPrioridade }))}
              >
                <SelectTrigger id="prioridade"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AXISDESK_PRIORIDADE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="anexos">Anexos (opcional)</Label>
              <Input
                id="anexos"
                type="file"
                multiple
                onChange={(event) => {
                  setForm((current) => ({ ...current, anexos: mergeSelectedFiles(current.anexos, event.target.files) }))
                  event.target.value = ''
                }}
              />
              <AttachmentFileList
                files={form.anexos}
                disabled={saving}
                onRemove={(index) => setForm((current) => ({ ...current, anexos: removeSelectedFile(current.anexos, index) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button type="button" onClick={() => void submit()} disabled={!canSubmit || saving}>
              {saving ? 'Enviando…' : 'Criar chamado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
