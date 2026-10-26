'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Eye, Headphones, Plus, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { AttachmentFileList } from '@/components/support/attachment-file-list'
import { CharacterCounter } from '@/components/support/character-counter'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useUser } from '@/contexts/user-context'
import { exportSupportTicketsExcel } from '@/lib/axisdesk/export-support-tickets'
import {
  applySupportListFilters,
  buildSupportListSearchParams,
  getCategoriaFilterOptions,
  getResponsavelFilterOptions,
  hasActiveSupportListFilters,
  parseSupportListFilters,
  sanitizeCategoriaFilter,
  SUPPORT_PAGE_SIZE,
  type SupportListFilters,
} from '@/lib/axisdesk/support-list-filters'
import {
  AXISDESK_PRIORIDADE_OPTIONS,
  AXISDESK_STATUS_OPTIONS,
  AXISDESK_TIPO_OPTIONS,
  getAxisDeskPrioridadeLabel,
  getAxisDeskStatusLabel,
  getAxisDeskStatusVariant,
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

const COLS = 9

function formatWhen(iso?: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex w-40 shrink-0 flex-col">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
    </div>
  )
}

export function SupportPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user } = useUser()
  const filters = useMemo(() => parseSupportListFilters(new URLSearchParams(searchParams.toString())), [searchParams])

  const [tickets, setTickets] = useState<AxisDeskChamado[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [filterCategorias, setFilterCategorias] = useState<AxisDeskCategoria[]>([])
  const [qDraft, setQDraft] = useState(filters.q)

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [categorias, setCategorias] = useState<AxisDeskCategoria[]>([])
  const [categoriasLoading, setCategoriasLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setQDraft(filters.q) }, [filters.q])

  const replaceFilters = useCallback(
    (patch: Partial<SupportListFilters>) => {
      const next: SupportListFilters = { ...filters, ...patch, page: 'page' in patch ? patch.page ?? 1 : 1 }
      if (patch.tipo !== undefined) next.categoria = sanitizeCategoriaFilter(next.categoria, filterCategorias, next.tipo)
      const qs = buildSupportListSearchParams(next).toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [filters, filterCategorias, pathname, router]
  )
  const replaceRef = useRef(replaceFilters)
  replaceRef.current = replaceFilters

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (qDraft !== filters.q) replaceRef.current({ q: qDraft })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [qDraft, filters.q])

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch('/api/support/tickets', { cache: 'no-store' })
      const payload = await res.json().catch(() => ({})) as { data?: AxisDeskChamado[]; error?: string }
      if (!res.ok) {
        setLoadError(payload.error ?? 'Não foi possível carregar os chamados.')
        setTickets([])
        return
      }
      setLoadError(null)
      setTickets(payload.data ?? [])
    } catch {
      setLoadError('Não foi possível conectar ao sistema de suporte.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void (async () => {
      const res = await fetch('/api/support/categorias', { cache: 'no-store' }).catch(() => null)
      if (!res?.ok) return
      const payload = await res.json().catch(() => ({})) as { data?: AxisDeskCategoria[] }
      setFilterCategorias(payload.data ?? [])
    })()
  }, [load])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setCategoriasLoading(true)
    void (async () => {
      const res = await fetch(`/api/support/categorias?tipo=${form.tipo}`, { cache: 'no-store' }).catch(() => null)
      const payload = res ? await res.json().catch(() => ({})) as { data?: AxisDeskCategoria[]; error?: string } : {}
      if (cancelled) return
      if (res?.ok) setCategorias(payload.data ?? [])
      else {
        setCategorias([])
        toast.error(payload.error ?? 'Não foi possível carregar as categorias.')
      }
      setCategoriasLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, form.tipo])

  const filtered = useMemo(
    () => applySupportListFilters(tickets, filters, { userId: user?.id, email: user?.email }),
    [tickets, filters, user?.id, user?.email]
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / SUPPORT_PAGE_SIZE))
  const page = Math.min(Math.max(filters.page, 1), totalPages)
  const pageTickets = filtered.slice((page - 1) * SUPPORT_PAGE_SIZE, page * SUPPORT_PAGE_SIZE)
  const categoriaOptions = useMemo(() => getCategoriaFilterOptions(filterCategorias, filters.tipo), [filterCategorias, filters.tipo])
  const responsavelOptions = useMemo(() => getResponsavelFilterOptions(tickets), [tickets])

  const subcategorias = categorias.find((item) => item.id === form.categoriaId)?.subcategorias ?? []
  const canSubmit =
    form.titulo.trim().length > 0 && form.descricao.trim().length > 0 && Boolean(form.categoriaId) && Boolean(form.subcategoriaId)

  const clearFilters = () => {
    setQDraft('')
    router.replace(filters.viewAll ? `${pathname}?viewAll=1` : pathname, { scroll: false })
  }

  async function handleExport() {
    if (filtered.length === 0) return
    setExporting(true)
    try {
      await exportSupportTicketsExcel(filtered)
      toast.success('Planilha exportada.')
    } catch {
      toast.error('Não foi possível exportar a planilha.')
    } finally {
      setExporting(false)
    }
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
      const payload = await res.json().catch(() => ({})) as { data?: { id?: string }; error?: string }
      if (!res.ok) {
        toast.error(payload.error ?? 'Não foi possível abrir o chamado.')
        return
      }
      toast.success('Chamado aberto.')
      setOpen(false)
      setForm(EMPTY_FORM)
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
          <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={Boolean(loadError)}>
            <Plus className="size-4" />
            Novo chamado
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">O sistema de suporte não respondeu.</p>
            <p className="mt-0.5">{loadError} Tente atualizar em alguns minutos; se continuar, avise o administrador do PRO-MAT.</p>
          </div>
        </div>
      )}

      <Card className="bg-card text-card-foreground">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base">{filters.viewAll ? 'Chamados da empresa' : 'Meus chamados'}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{filtered.length} resultado(s)</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleExport()} disabled={exporting || loading || filtered.length === 0}>
              <Download className="size-4" />
              {exporting ? 'Exportando…' : 'Exportar Excel'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex w-52 shrink-0 flex-col">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Título</p>
                <div className="relative">
                  <Input placeholder="Buscar por título…" value={qDraft} onChange={(e) => setQDraft(e.target.value)} className="h-9 pr-8" />
                  {qDraft && (
                    <button
                      type="button"
                      onClick={() => setQDraft('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Limpar busca"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col justify-end">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Escopo</p>
                <label className="flex h-9 w-48 cursor-pointer select-none items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
                  <Checkbox checked={filters.viewAll} onCheckedChange={(checked) => replaceFilters({ viewAll: checked === true })} />
                  <span>Visualizar todos</span>
                </label>
              </div>
              <div className="flex flex-col">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Tipo</p>
                <MultiSelectFilter label="Tipo" width="w-40" options={AXISDESK_TIPO_OPTIONS} selected={filters.tipo} onChange={(values) => replaceFilters({ tipo: values })} />
              </div>
              <div className="flex flex-col">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Status</p>
                <MultiSelectFilter label="Status" width="w-52" options={AXISDESK_STATUS_OPTIONS} selected={filters.status} onChange={(values) => replaceFilters({ status: values })} />
              </div>
              <div className="flex flex-col">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Prioridade</p>
                <MultiSelectFilter label="Prioridade" width="w-40" options={AXISDESK_PRIORIDADE_OPTIONS} selected={filters.prioridade} onChange={(values) => replaceFilters({ prioridade: values })} />
              </div>
              <div className="flex flex-col">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Categoria</p>
                <MultiSelectFilter label="Categoria" width="w-52" options={categoriaOptions} selected={filters.categoria} onChange={(values) => replaceFilters({ categoria: values })} />
              </div>
              <div className="flex flex-col">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Solicitante</p>
                <MultiSelectFilter label="Solicitante" width="w-52" options={responsavelOptions} selected={filters.responsavel} onChange={(values) => replaceFilters({ responsavel: values })} />
              </div>
              <DateFilter label="SLA de" value={filters.slaDe} onChange={(value) => replaceFilters({ slaDe: value })} />
              <DateFilter label="SLA até" value={filters.slaAte} onChange={(value) => replaceFilters({ slaAte: value })} />
              <DateFilter label="Criado de" value={filters.criadoDe} onChange={(value) => replaceFilters({ criadoDe: value })} />
              <DateFilter label="Criado até" value={filters.criadoAte} onChange={(value) => replaceFilters({ criadoAte: value })} />
            </div>
            {hasActiveSupportListFilters(filters) && (
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="size-4" />
                  Limpar filtros
                </Button>
              </div>
            )}
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
                  <TableHead>Solicitante</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={COLS} className="py-8 text-center text-muted-foreground">Carregando chamados…</TableCell></TableRow>
                ) : pageTickets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COLS} className="py-8 text-center text-muted-foreground">
                      {loadError ? 'Sem conexão com o suporte.' : filters.viewAll ? 'Nenhum chamado encontrado.' : 'Você não tem chamados com esses filtros. Marque "Visualizar todos" para ver os da empresa.'}
                    </TableCell>
                  </TableRow>
                ) : pageTickets.map((ticket) => (
                  <TableRow key={ticket.id} className="cursor-pointer" onClick={() => router.push(`/support/${ticket.id}`)}>
                    <TableCell className="max-w-[240px] truncate font-medium">{ticket.titulo}</TableCell>
                    <TableCell>{AXISDESK_TIPO_OPTIONS.find((option) => option.value === ticket.tipo)?.label ?? ticket.tipo}</TableCell>
                    <TableCell>
                      <StatusBadge variant={getAxisDeskStatusVariant(ticket.status)}>{getAxisDeskStatusLabel(ticket.status)}</StatusBadge>
                    </TableCell>
                    <TableCell>{getAxisDeskPrioridadeLabel(ticket.prioridade)}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{ticket.categoria?.nome ?? '—'}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{ticket.solicitante?.nome ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatWhen(ticket.sla_prazo)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatWhen(ticket.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={(e) => { e.stopPropagation(); router.push(`/support/${ticket.id}`) }}
                      >
                        <Eye className="size-4" />
                        Ver detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > 0 && (
              <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Exibindo {(page - 1) * SUPPORT_PAGE_SIZE + 1}–{Math.min(page * SUPPORT_PAGE_SIZE, filtered.length)} de {filtered.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1" disabled={page <= 1} onClick={() => replaceFilters({ page: page - 1 })}>
                    <ChevronLeft className="size-4" />
                    Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground">Página {page} de {totalPages}</span>
                  <Button type="button" variant="outline" size="sm" className="gap-1" disabled={page >= totalPages} onClick={() => replaceFilters({ page: page + 1 })}>
                    Próxima
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setForm(EMPTY_FORM) }}>
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
