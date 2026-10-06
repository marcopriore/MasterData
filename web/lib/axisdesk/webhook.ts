import { timingSafeEqual } from 'crypto'
import { getAxisDeskStatusLabel, supportNoticeEventType } from '@/lib/axisdesk/types'

export type AxisDeskWebhookEvent = {
  evento: 'status_alterado' | 'comentario' | 'teste'
  chamado_id?: string
  tenant_id_externo?: string
  solicitante_id_externo?: string
  timestamp?: string
  status_novo?: string
  mensagem?: string
  motivo?: string
  autor?: string
}

export function verifyWebhookSecret(received: string | null, expected: string | undefined): boolean {
  const secret = expected?.trim()
  if (!received || !secret) return false
  const receivedBuf = Buffer.from(received)
  const expectedBuf = Buffer.from(secret)
  if (receivedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(receivedBuf, expectedBuf)
}

function truncate(value: string, max = 120): string {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

export function parseWebhookEvent(body: unknown): AxisDeskWebhookEvent | null {
  if (!body || typeof body !== 'object') return null
  const raw = body as Record<string, unknown>
  const evento = raw.evento
  if (evento !== 'teste' && evento !== 'status_alterado' && evento !== 'comentario') return null
  const text = (key: string) => (typeof raw[key] === 'string' ? raw[key] : undefined)
  if (evento === 'teste') {
    return {
      evento,
      chamado_id: text('chamado_id'),
      tenant_id_externo: text('tenant_id_externo'),
      solicitante_id_externo: text('solicitante_id_externo'),
    }
  }
  const chamadoId = text('chamado_id')?.trim()
  const tenantId = text('tenant_id_externo')?.trim()
  const solicitanteId = text('solicitante_id_externo')?.trim()
  const timestamp = text('timestamp')?.trim()
  if (!chamadoId || !tenantId || !solicitanteId || !timestamp) return null
  return {
    evento,
    chamado_id: chamadoId,
    tenant_id_externo: tenantId,
    solicitante_id_externo: solicitanteId,
    timestamp,
    status_novo: text('status_novo'),
    mensagem: text('mensagem'),
    motivo: text('motivo'),
    autor: text('autor'),
  }
}

export function buildSupportWebhookNotice(event: AxisDeskWebhookEvent): {
  eventType: string
  title: string
  message: string
} | null {
  if (!event.chamado_id || event.evento === 'teste') return null
  if (event.evento === 'status_alterado') {
    const label = event.status_novo ? getAxisDeskStatusLabel(event.status_novo) : 'atualizado'
    return {
      eventType: supportNoticeEventType(event.chamado_id),
      title: 'Chamado de suporte atualizado',
      message: `Seu chamado de suporte teve o status atualizado para ${label}.`,
    }
  }
  const message = event.mensagem?.trim() || event.motivo?.trim() || ''
  const preview = message ? truncate(message) : 'Nova mensagem da equipe de suporte.'
  const author = event.autor?.trim() ? `${event.autor.trim()}: ` : ''
  return {
    eventType: supportNoticeEventType(event.chamado_id),
    title: 'Nova resposta no chamado de suporte',
    message: `A equipe de suporte respondeu seu chamado: "${author}${preview}"`,
  }
}
