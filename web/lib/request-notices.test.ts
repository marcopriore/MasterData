import { describe, expect, it } from 'vitest'
import {
  noticeCopy,
  noticeEmailHtml,
  noticeEventFromHistory,
  selectNoticeRecipients,
  type NoticeCandidate,
} from './request-notices'

function user(partial: Partial<NoticeCandidate> & Pick<NoticeCandidate, 'id'>): NoticeCandidate {
  return {
    isActive: true,
    stageRoleName: '',
    groupNames: [],
    prefs: null,
    ...partial,
  }
}

const people = [
  user({ id: 'autor', stageRoleName: 'SOLICITANTE' }),
  user({ id: 'cadastro', stageRoleName: 'CADASTRO' }),
  user({ id: 'compras-grupo', stageRoleName: 'SOLICITANTE', groupNames: ['COMPRAS'] }),
  user({ id: 'inativo', stageRoleName: 'CADASTRO', isActive: false }),
  user({
    id: 'mudo',
    stageRoleName: 'CADASTRO',
    prefs: { notify_request_created: false, email_request_created: false },
  }),
]

describe('evento a partir do histórico', () => {
  it('criação, atendimento e rejeição', () => {
    expect(noticeEventFromHistory('created', 'cadastro')).toBe('created')
    expect(noticeEventFromHistory('assigned', 'cadastro')).toBe('assigned')
    expect(noticeEventFromHistory('rejected', 'rejected')).toBe('rejected')
  })

  it('aprovação vira conclusão quando a etapa é final', () => {
    expect(noticeEventFromHistory('approved', 'compras')).toBe('approved')
    expect(noticeEventFromHistory('approved', 'finalizado')).toBe('completed')
    expect(noticeEventFromHistory('approved', 'completed')).toBe('completed')
  })
})

describe('destinatários', () => {
  it('solicitação criada avisa a etapa, não o autor, e respeita quem desligou os dois canais', () => {
    const planned = selectNoticeRecipients({
      event: 'created',
      actorId: 'autor',
      requesterId: 'autor',
      stage: 'cadastro',
      users: people,
    })
    expect(planned).toEqual([{ userId: 'cadastro', inApp: true, email: true }])
  })

  it('grupo da próxima etapa recebe a aprovação mesmo com outro papel de etapa', () => {
    const planned = selectNoticeRecipients({
      event: 'approved',
      actorId: 'cadastro',
      requesterId: 'autor',
      stage: 'compras',
      users: people,
    })
    expect(planned.map((item) => item.userId)).toEqual(['compras-grupo'])
  })

  it('atendimento, rejeição e conclusão vão para o solicitante', () => {
    for (const event of ['assigned', 'rejected', 'completed'] as const) {
      const planned = selectNoticeRecipients({
        event,
        actorId: 'cadastro',
        requesterId: 'autor',
        stage: 'cadastro',
        users: people,
      })
      expect(planned.map((item) => item.userId)).toEqual(['autor'])
    }
  })

  it('e-mail pode seguir desligado com o sino ligado', () => {
    const planned = selectNoticeRecipients({
      event: 'assigned',
      actorId: 'cadastro',
      requesterId: 'autor',
      stage: null,
      users: [user({ id: 'autor', prefs: { email_request_assigned: false } })],
    })
    expect(planned).toEqual([{ userId: 'autor', inApp: true, email: false }])
  })
})

describe('texto do aviso', () => {
  it('rejeição inclui o motivo e o e-mail escapa HTML', () => {
    const copy = noticeCopy('rejected', { code: 'REQ-0007', stage: 'cadastro', reason: '<b>ncm</b>' })
    expect(copy.message).toContain('Motivo: <b>ncm</b>')
    const html = noticeEmailHtml({ title: copy.title, message: copy.message, link: 'https://app.example/governance/request/7' })
    expect(html).toContain('&lt;b&gt;ncm&lt;/b&gt;')
    expect(html).not.toContain('<b>ncm</b>')
  })
})
