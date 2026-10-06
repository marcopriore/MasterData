import type {
  AxisDeskAnexo,
  AxisDeskCategoria,
  AxisDeskChamado,
  AxisDeskChamadoAcao,
  AxisDeskChamadoDetalhe,
  AxisDeskChamadoStatus,
  AxisDeskChamadoTipo,
  AxisDeskClientResult,
  AxisDeskCreateTicketPayload,
} from '@/lib/axisdesk/types'

const DEFAULT_BASE_URL = 'https://suporte.axisstrategy.com.br'

function getBaseUrl(): string {
  const raw = process.env.AXISDESK_BASE_URL?.trim()
  return raw && raw.length > 0 ? raw.replace(/\/$/, '') : DEFAULT_BASE_URL
}

function getApiKey(): string | null {
  const key = process.env.AXISDESK_API_KEY?.trim()
  return key && key.length > 0 ? key : null
}

function mapHttpError(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error
    if (typeof err === 'string' && err.trim()) return err
  }
  if (status === 400) return 'Dados inválidos. Verifique os campos e tente novamente.'
  if (status === 401) return 'Integração com suporte não autorizada. Contate o administrador.'
  if (status === 404) return 'Chamado não encontrado.'
  if (status === 409) return 'Esta ação não é permitida no status atual do chamado.'
  if (status === 500) return 'Erro interno no sistema de suporte. Tente novamente mais tarde.'
  return `Erro ao comunicar com o suporte (${status}).`
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function axisDeskFetch<T>(path: string, init?: RequestInit): Promise<AxisDeskClientResult<T>> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return { ok: false, status: 500, message: 'Integração com suporte não configurada (AXISDESK_API_KEY ausente).' }
  }
  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-api-key': apiKey,
        ...(init?.headers ?? {}),
      },
    })
    const body = await parseJsonSafe(res)
    if (!res.ok) return { ok: false, status: res.status, message: mapHttpError(res.status, body) }
    return { ok: true, data: body as T }
  } catch {
    return { ok: false, status: 500, message: 'Não foi possível conectar ao sistema de suporte.' }
  }
}

export function createTicket(payload: AxisDeskCreateTicketPayload) {
  return axisDeskFetch<AxisDeskChamado>('/api/chamados', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function listTickets(tenantIdExterno: string, status?: AxisDeskChamadoStatus) {
  const params = new URLSearchParams({ tenant_id_externo: tenantIdExterno })
  if (status) params.set('status', status)
  const result = await axisDeskFetch<AxisDeskChamado[]>(`/api/chamados?${params.toString()}`, { method: 'GET' })
  if (!result.ok) return result
  return { ok: true as const, data: Array.isArray(result.data) ? result.data : [] }
}

export async function getCategorias(tipo?: AxisDeskChamadoTipo) {
  const params = new URLSearchParams()
  if (tipo) params.set('tipo', tipo)
  const query = params.toString()
  const result = await axisDeskFetch<AxisDeskCategoria[]>(`/api/categorias${query ? `?${query}` : ''}`, { method: 'GET' })
  if (!result.ok) return result
  return { ok: true as const, data: Array.isArray(result.data) ? result.data : [] }
}

export function getTicketDetail(chamadoId: string, tenantIdExterno: string) {
  const params = new URLSearchParams({ tenant_id_externo: tenantIdExterno })
  return axisDeskFetch<AxisDeskChamadoDetalhe>(`/api/chamados/${chamadoId}?${params.toString()}`, { method: 'GET' })
}

export function executeAction(
  chamadoId: string,
  acao: AxisDeskChamadoAcao,
  mensagem?: string,
  anexos?: AxisDeskAnexo[],
) {
  const body: Record<string, unknown> = { acao }
  if (mensagem?.trim()) body.mensagem = mensagem.trim()
  if (anexos && anexos.length > 0) body.anexos = anexos
  return axisDeskFetch<AxisDeskChamado>(`/api/chamados/${chamadoId}/acoes`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
