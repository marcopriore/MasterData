export type AxisDeskChamadoStatus =
  | 'aberto'
  | 'em_atendimento'
  | 'pendente_usuario'
  | 'validacao_usuario'
  | 'pendente_publicacao'
  | 'concluido'
  | 'reprovado'
  | 'cancelado'

export type AxisDeskChamadoTipo = 'incidente' | 'melhoria'
export type AxisDeskChamadoPrioridade = 'baixa' | 'media' | 'alta' | 'critica'
export type AxisDeskChamadoAcao =
  | 'usuario_respondeu'
  | 'usuario_aprovou'
  | 'usuario_reprovou'
  | 'usuario_cancelou'
  | 'usuario_reenviou'

export type AxisDeskAnexo = {
  nome_arquivo: string
  tipo_mime: string
  conteudo_base64: string
}

export type AxisDeskSubcategoria = { id: string; nome: string }

export type AxisDeskCategoria = {
  id: string
  tipo: AxisDeskChamadoTipo
  nome: string
  subcategorias: AxisDeskSubcategoria[]
}

export type AxisDeskCreateTicketPayload = {
  tenant_id_externo: string
  nome_empresa: string
  solicitante: { id_externo: string; nome: string; email: string }
  tipo: AxisDeskChamadoTipo
  titulo: string
  descricao: string
  contexto_origem?: string
  prioridade?: AxisDeskChamadoPrioridade
  categoria_id?: string
  subcategoria_id?: string
  anexos?: AxisDeskAnexo[]
}

export type AxisDeskCategoriaRef = { id: string; nome: string }

export type AxisDeskComentario = {
  id?: string
  autor_tipo: string
  autor_nome: string
  mensagem: string
  created_at: string
}

export type AxisDeskAnexoDetalhe = {
  id?: string
  nome_arquivo: string
  tamanho?: number | null
  tamanho_bytes?: number | null
  url: string
  autor_nome?: string | null
  created_at: string
}

export type AxisDeskHistoricoEntry = {
  id?: string
  campo_alterado: string
  valor_anterior: string | null
  valor_novo: string | null
  alterado_por: string
  created_at?: string
  data?: string
}

export type AxisDeskChamado = {
  id: string
  tenant_id_externo: string
  tipo: AxisDeskChamadoTipo
  titulo: string
  descricao: string
  status: AxisDeskChamadoStatus
  prioridade: AxisDeskChamadoPrioridade
  contexto_origem?: string | null
  sla_prazo?: string | null
  created_at: string
  updated_at?: string | null
  solicitante?: { id_externo?: string; nome: string; email: string }
  categoria?: AxisDeskCategoriaRef | null
  subcategoria?: AxisDeskCategoriaRef | null
}

export type AxisDeskChamadoDetalhe = AxisDeskChamado & {
  comentarios?: AxisDeskComentario[]
  anexos?: AxisDeskAnexoDetalhe[]
  historico?: AxisDeskHistoricoEntry[]
}

export type AxisDeskActivityItem =
  | { kind: 'comment'; id: string; createdAt: string; autorTipo: string; autorNome: string; mensagem: string }
  | { kind: 'attachment'; id: string; createdAt: string; nomeArquivo: string; tamanho: number | null; url: string; autorNome: string | null }

export type AxisDeskClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string }

export const AXISDESK_STATUS_OPTIONS: { value: AxisDeskChamadoStatus; label: string }[] = [
  { value: 'aberto', label: 'Aberto' },
  { value: 'em_atendimento', label: 'Em atendimento' },
  { value: 'pendente_usuario', label: 'Pendente usuário' },
  { value: 'validacao_usuario', label: 'Aguardando validação' },
  { value: 'pendente_publicacao', label: 'Pendente publicação' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'cancelado', label: 'Cancelado' },
]

export const AXISDESK_PRIORIDADE_OPTIONS: { value: AxisDeskChamadoPrioridade; label: string }[] = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Crítica' },
]

export const AXISDESK_TIPO_OPTIONS: { value: AxisDeskChamadoTipo; label: string }[] = [
  { value: 'incidente', label: 'Incidente' },
  { value: 'melhoria', label: 'Melhoria' },
]

export function getAxisDeskStatusLabel(status: string): string {
  return AXISDESK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

export function getAxisDeskPrioridadeLabel(prioridade: string): string {
  return AXISDESK_PRIORIDADE_OPTIONS.find((option) => option.value === prioridade)?.label ?? prioridade
}

export function supportNoticeEventType(chamadoId: string): string {
  return `sup:${chamadoId}`.slice(0, 50)
}

export function supportTicketIdFromEvent(eventType: string): string | null {
  if (!eventType.startsWith('sup:')) return null
  const id = eventType.slice(4).trim()
  return id.length > 0 ? id : null
}

export function buildAxisDeskActivityFeed(
  comentarios: AxisDeskComentario[] = [],
  anexos: AxisDeskAnexoDetalhe[] = [],
): AxisDeskActivityItem[] {
  const items: AxisDeskActivityItem[] = [
    ...comentarios.map((item, index) => ({
      kind: 'comment' as const,
      id: item.id ?? `comment-${index}-${item.created_at}`,
      createdAt: item.created_at,
      autorTipo: item.autor_tipo,
      autorNome: item.autor_nome,
      mensagem: item.mensagem,
    })),
    ...anexos.map((item, index) => ({
      kind: 'attachment' as const,
      id: item.id ?? `attachment-${index}-${item.created_at}`,
      createdAt: item.created_at,
      nomeArquivo: item.nome_arquivo,
      tamanho: item.tamanho_bytes ?? item.tamanho ?? null,
      url: item.url,
      autorNome: item.autor_nome ?? null,
    })),
  ]
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getAvailableSupportActions(status: AxisDeskChamadoStatus): {
  acao: AxisDeskChamadoAcao
  label: string
  destructive?: boolean
}[] {
  if (status === 'pendente_usuario') {
    return [
      { acao: 'usuario_respondeu', label: 'Responder' },
      { acao: 'usuario_cancelou', label: 'Cancelar chamado', destructive: true },
    ]
  }
  if (status === 'validacao_usuario') {
    return [
      { acao: 'usuario_aprovou', label: 'Aprovar solução' },
      { acao: 'usuario_reprovou', label: 'Reprovar solução', destructive: true },
    ]
  }
  if (status === 'reprovado') {
    return [
      { acao: 'usuario_reenviou', label: 'Reenviar chamado' },
      { acao: 'usuario_cancelou', label: 'Cancelar chamado', destructive: true },
    ]
  }
  return []
}
