'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, History, MessageSquare, Paperclip, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { AttachmentFileList } from '@/components/support/attachment-file-list'
import { CharacterCounter } from '@/components/support/character-counter'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  AXISDESK_TIPO_OPTIONS,
  buildAxisDeskActivityFeed,
  getAvailableSupportActions,
  getAxisDeskPrioridadeLabel,
  getAxisDeskStatusLabel,
  type AxisDeskChamadoAcao,
  type AxisDeskChamadoDetalhe,
  type AxisDeskHistoricoEntry,
} from '@/lib/axisdesk/types'
import {
  AXISDESK_MAX_TEXTO,
  filesToAnexos,
  formatLocalFileSize,
  mergeSelectedFiles,
  removeSelectedFile,
  validateAnexoFiles,
} from '@/lib/axisdesk/support-form'

function formatWhen(iso?: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('pt-BR')
}

function historyDate(entry: AxisDeskHistoricoEntry) {
  return entry.created_at ?? entry.data ?? ''
}

export function SupportTicketDetail({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket] = useState<AxisDeskChamadoDetalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [acting, setActing] = useState<AxisDeskChamadoAcao | null>(null)

  async function load(silent = false) {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`)
      const payload = await res.json() as { data?: AxisDeskChamadoDetalhe; error?: string }
      if (!res.ok) {
        toast.error(payload.error ?? 'Chamado não encontrado.')
        setTicket(null)
        return
      }
      setTicket(payload.data ?? null)
    } catch {
      toast.error('Não foi possível carregar o chamado.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { void load() }, [ticketId])

  const actions = ticket ? getAvailableSupportActions(ticket.status) : []
  const showMessage = actions.some((action) => action.acao === 'usuario_respondeu' || action.acao === 'usuario_reprovou' || action.acao === 'usuario_reenviou')
  const showFiles = actions.some((action) => action.acao === 'usuario_respondeu' || action.acao === 'usuario_reenviou')
  const messageRequired = actions.some((action) => action.acao === 'usuario_reprovou')
  const activity = useMemo(
    () => (ticket ? buildAxisDeskActivityFeed(ticket.comentarios ?? [], ticket.anexos ?? []) : []),
    [ticket],
  )
  const history = useMemo(() => {
    const rows = [...(ticket?.historico ?? [])]
    return rows.sort((a, b) => new Date(historyDate(b)).getTime() - new Date(historyDate(a)).getTime())
  }, [ticket])

  async function run(acao: AxisDeskChamadoAcao) {
    if (acao === 'usuario_reprovou' && !message.trim()) {
      toast.error('Motivo é obrigatório para reprovar.')
      return
    }
    const anexoError = validateAnexoFiles(files)
    if (anexoError) {
      toast.error(anexoError)
      return
    }
    setActing(acao)
    try {
      const anexos = files.length > 0 ? await filesToAnexos(files) : undefined
      const res = await fetch(`/api/support/tickets/${ticketId}/acoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao,
          ...(message.trim() && acao !== 'usuario_cancelou' ? { mensagem: message.trim() } : {}),
          ...(anexos ? { anexos } : {}),
        }),
      })
      const payload = await res.json() as { error?: string }
      if (!res.ok) {
        toast.error(payload.error ?? 'Não foi possível registrar a ação.')
        return
      }
      toast.success('Ação registrada com sucesso.')
      setMessage('')
      setFiles([])
      await load(true)
    } catch {
      toast.error('Não foi possível registrar a ação.')
    } finally {
      setActing(null)
    }
  }

  if (loading) return <p className="py-16 text-center text-sm text-muted-foreground">Carregando chamado…</p>
  if (!ticket) {
    return (
      <div className="space-y-4">
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link href="/support"><ArrowLeft className="size-4" />Voltar para Suporte</Link>
        </Button>
        <p className="text-sm text-muted-foreground">Chamado não encontrado.</p>
      </div>
    )
  }

  const placeholder = ticket.status === 'validacao_usuario'
    ? 'Descreva o motivo se for reprovar a solução'
    : ticket.status === 'reprovado'
      ? 'Explique o reenvio do chamado (opcional)'
      : 'Informações adicionais para a equipe de suporte'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/support" className="transition-colors hover:text-foreground">Suporte</Link>
            <ChevronRight className="size-4" />
            <span className="max-w-[280px] truncate text-foreground">{ticket.titulo}</span>
          </div>
          <div className="flex items-start gap-3">
            <Button type="button" variant="outline" size="icon" asChild>
              <Link href="/support"><ArrowLeft className="size-4" /></Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{ticket.titulo}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-md border bg-card px-2 py-1">{getAxisDeskStatusLabel(ticket.status)}</span>
                <span className="rounded-md border bg-muted px-2 py-1">{getAxisDeskPrioridadeLabel(ticket.prioridade)}</span>
                <span className="rounded-md border bg-muted px-2 py-1">{AXISDESK_TIPO_OPTIONS.find((item) => item.value === ticket.tipo)?.label ?? ticket.tipo}</span>
                {ticket.categoria ? <span className="rounded-md border bg-card px-2 py-1">{ticket.categoria.nome}</span> : null}
                {ticket.subcategoria ? <span className="rounded-md border bg-card px-2 py-1">{ticket.subcategoria.nome}</span> : null}
              </div>
            </div>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load(true)} disabled={refreshing}>
          <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="bg-card text-card-foreground">
            <CardHeader className="pb-3"><CardTitle className="text-base">Descrição</CardTitle></CardHeader>
            <CardContent><p className="whitespace-pre-wrap text-sm">{ticket.descricao}</p></CardContent>
          </Card>

          <Card className="bg-card text-card-foreground">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="size-4 text-primary" />Atividade</CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
              ) : (
                <div className="space-y-4">
                  {activity.map((item) => (
                    <div key={item.id} className="rounded-lg border bg-card p-3">
                      {item.kind === 'comment' ? (
                        <>
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{item.autorNome} · {item.autorTipo}</span>
                            <span>{formatWhen(item.createdAt)}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm">{item.mensagem}</p>
                        </>
                      ) : (
                        <div className="flex items-start gap-3">
                          <Paperclip className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">{item.autorNome ? `${item.autorNome} · ` : ''}Anexo · {formatWhen(item.createdAt)}</p>
                            <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                              {item.nomeArquivo}
                              <span className="text-xs font-normal text-muted-foreground">({item.tamanho == null ? '—' : formatLocalFileSize(item.tamanho)})</span>
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {history.length > 0 && (
            <Card className="bg-card text-card-foreground">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><History className="size-4 text-primary" />Histórico de alterações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {history.map((entry, index) => (
                  <div key={entry.id ?? `hist-${index}`} className="rounded-lg border bg-muted/20 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{entry.alterado_por}</span>
                      <span>{formatWhen(historyDate(entry))}</span>
                    </div>
                    <p className="mt-2"><span className="text-muted-foreground">Campo: </span>{entry.campo_alterado}</p>
                    <p className="mt-1">
                      <span className="text-muted-foreground">De: </span>
                      {entry.campo_alterado === 'status' ? getAxisDeskStatusLabel(entry.valor_anterior ?? '') : (entry.valor_anterior || '—')}
                      <span className="mx-2 text-muted-foreground">→</span>
                      <span className="text-muted-foreground">Para: </span>
                      {entry.campo_alterado === 'status' ? getAxisDeskStatusLabel(entry.valor_novo ?? '') : (entry.valor_novo || '—')}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="bg-card text-card-foreground">
            <CardHeader className="pb-3"><CardTitle className="text-base">Informações</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Criado em: </span>{formatWhen(ticket.created_at)}</div>
              <div><span className="text-muted-foreground">SLA: </span>{formatWhen(ticket.sla_prazo)}</div>
              {ticket.solicitante ? (
                <div><span className="text-muted-foreground">Solicitante: </span>{ticket.solicitante.nome} ({ticket.solicitante.email})</div>
              ) : null}
              {ticket.contexto_origem ? (
                <div><span className="text-muted-foreground">Origem: </span>{ticket.contexto_origem}</div>
              ) : null}
            </CardContent>
          </Card>

          {actions.length > 0 && (
            <Card className="bg-card text-card-foreground">
              <CardHeader className="pb-3"><CardTitle className="text-base">Ações</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {showMessage && (
                  <div className="space-y-2">
                    <Label htmlFor="action-message">{messageRequired ? 'Mensagem / motivo' : 'Mensagem (opcional)'}</Label>
                    <Textarea
                      id="action-message"
                      value={message}
                      maxLength={AXISDESK_MAX_TEXTO}
                      rows={3}
                      placeholder={placeholder}
                      onChange={(event) => setMessage(event.target.value)}
                    />
                    <CharacterCounter current={message.length} max={AXISDESK_MAX_TEXTO} />
                  </div>
                )}
                {showFiles && (
                  <div className="space-y-2">
                    <Label htmlFor="action-anexos">Anexos (opcional)</Label>
                    <Input
                      id="action-anexos"
                      type="file"
                      multiple
                      disabled={acting != null}
                      onChange={(event) => {
                        setFiles((current) => mergeSelectedFiles(current, event.target.files))
                        event.target.value = ''
                      }}
                    />
                    <AttachmentFileList files={files} disabled={acting != null} onRemove={(index) => setFiles((current) => removeSelectedFile(current, index))} />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {actions.map((action) => (
                    <Button
                      key={action.acao}
                      type="button"
                      variant={action.destructive ? 'destructive' : 'default'}
                      size="sm"
                      className="w-full"
                      disabled={acting != null}
                      onClick={() => void run(action.acao)}
                    >
                      {acting === action.acao ? 'Processando…' : action.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
