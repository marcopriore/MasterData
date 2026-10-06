import { describe, expect, it } from 'vitest'
import { getAvailableSupportActions, supportNoticeEventType, supportTicketIdFromEvent } from './types'
import { buildSupportWebhookNotice, parseWebhookEvent, verifyWebhookSecret } from './webhook'

describe('ações do chamado', () => {
  it('pendente pede resposta ou cancelamento', () => {
    expect(getAvailableSupportActions('pendente_usuario').map((item) => item.acao)).toEqual([
      'usuario_respondeu',
      'usuario_cancelou',
    ])
  })

  it('validação pede aprovar ou reprovar', () => {
    expect(getAvailableSupportActions('validacao_usuario').map((item) => item.acao)).toEqual([
      'usuario_aprovou',
      'usuario_reprovou',
    ])
  })

  it('chamado aberto não oferece ação do usuário', () => {
    expect(getAvailableSupportActions('aberto')).toEqual([])
  })
})

describe('webhook do AxisDesk', () => {
  it('rejeita segredo diferente ou ausente', () => {
    expect(verifyWebhookSecret(null, 'segredo')).toBe(false)
    expect(verifyWebhookSecret('outro', 'segredo')).toBe(false)
    expect(verifyWebhookSecret('segredo', 'segredo')).toBe(true)
  })

  it('aviso de status aponta o chamado no sino', () => {
    const event = parseWebhookEvent({
      evento: 'status_alterado',
      chamado_id: '11111111-1111-1111-1111-111111111111',
      tenant_id_externo: '2',
      solicitante_id_externo: 'user-1',
      timestamp: '2026-10-05T12:00:00Z',
      status_novo: 'pendente_usuario',
    })
    const notice = buildSupportWebhookNotice(event!)
    expect(notice?.title).toBe('Chamado de suporte atualizado')
    expect(notice?.message).toContain('Pendente usuário')
    expect(supportTicketIdFromEvent(notice!.eventType)).toBe('11111111-1111-1111-1111-111111111111')
    expect(supportNoticeEventType('11111111-1111-1111-1111-111111111111').length).toBeLessThanOrEqual(50)
  })

  it('evento de teste não vira aviso', () => {
    expect(buildSupportWebhookNotice({ evento: 'teste' })).toBeNull()
  })
})
