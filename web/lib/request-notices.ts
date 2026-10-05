/** Quem avisar e com qual texto, sem banco e sem Resend. */

export type NoticeEvent = 'created' | 'assigned' | 'approved' | 'rejected' | 'completed'

export type NoticePrefs = {
  notify_request_created: boolean
  notify_request_assigned: boolean
  notify_request_approved: boolean
  notify_request_rejected: boolean
  notify_request_completed: boolean
  email_request_created: boolean
  email_request_assigned: boolean
  email_request_approved: boolean
  email_request_rejected: boolean
  email_request_completed: boolean
}

export const DEFAULT_NOTICE_PREFS: NoticePrefs = {
  notify_request_created: true,
  notify_request_assigned: true,
  notify_request_approved: true,
  notify_request_rejected: true,
  notify_request_completed: true,
  email_request_created: true,
  email_request_assigned: true,
  email_request_approved: true,
  email_request_rejected: true,
  email_request_completed: true,
}

const FINAL_STAGES = new Set(['completed', 'finalizado', 'concluído', 'concluido', 'approved'])

export type NoticeCandidate = {
  id: string
  isActive: boolean
  stageRoleName: string
  groupNames: string[]
  prefs: Partial<NoticePrefs> | null
}

export type PlannedNotice = {
  userId: string
  inApp: boolean
  email: boolean
}

export function requestCode(id: number): string {
  return `REQ-${String(id).padStart(4, '0')}`
}

export function noticeEventFromHistory(eventType: string, stage: string | null | undefined): NoticeEvent | null {
  const type = eventType.trim().toLowerCase()
  const stageKey = (stage ?? '').trim().toLowerCase()
  if (type === 'created') return 'created'
  if (type === 'assigned') return 'assigned'
  if (type === 'rejected') return 'rejected'
  if (type === 'approved') return FINAL_STAGES.has(stageKey) ? 'completed' : 'approved'
  return null
}

function prefPair(event: NoticeEvent): { notify: keyof NoticePrefs; email: keyof NoticePrefs } {
  if (event === 'created') return { notify: 'notify_request_created', email: 'email_request_created' }
  if (event === 'assigned') return { notify: 'notify_request_assigned', email: 'email_request_assigned' }
  if (event === 'approved') return { notify: 'notify_request_approved', email: 'email_request_approved' }
  if (event === 'rejected') return { notify: 'notify_request_rejected', email: 'email_request_rejected' }
  return { notify: 'notify_request_completed', email: 'email_request_completed' }
}

function wants(prefs: Partial<NoticePrefs> | null, key: keyof NoticePrefs): boolean {
  const value = prefs?.[key]
  return value === undefined ? DEFAULT_NOTICE_PREFS[key] : value === true
}

function roleMatches(name: string, stage: string): boolean {
  return name.trim().toUpperCase() === stage.trim().toUpperCase()
}

export function selectNoticeRecipients(input: {
  event: NoticeEvent
  actorId: string | null
  requesterId: string | null
  stage: string | null
  users: NoticeCandidate[]
}): PlannedNotice[] {
  const keys = prefPair(input.event)
  const stage = input.stage ?? ''
  const targeted = input.users.filter((user) => {
    if (!user.isActive) return false
    if (input.actorId && user.id === input.actorId) return false
    if (input.event === 'assigned' || input.event === 'rejected' || input.event === 'completed') {
      return input.requesterId != null && user.id === input.requesterId
    }
    if (!stage.trim()) return false
    return roleMatches(user.stageRoleName, stage) || user.groupNames.some((name) => roleMatches(name, stage))
  })

  return targeted.flatMap((user) => {
    const inApp = wants(user.prefs, keys.notify)
    const email = wants(user.prefs, keys.email)
    if (!inApp && !email) return []
    return [{ userId: user.id, inApp, email }]
  })
}

export function noticeCopy(
  event: NoticeEvent,
  input: { code: string; stage: string; reason?: string | null }
): { title: string; message: string } {
  const stage = input.stage.trim()
  const stageLabel = stage ? stage.charAt(0).toUpperCase() + stage.slice(1) : 'a próxima etapa'
  const reason = (input.reason ?? '').trim()
  if (event === 'created') {
    return { title: 'Nova solicitação', message: `${input.code} aguarda ${stageLabel}.` }
  }
  if (event === 'assigned') {
    return { title: 'Atendimento iniciado', message: `${input.code} está em atendimento.` }
  }
  if (event === 'rejected') {
    const detail = reason ? ` Motivo: ${reason}` : ''
    return { title: 'Solicitação rejeitada', message: `${input.code} foi rejeitada.${detail}` }
  }
  if (event === 'completed') {
    return { title: 'Solicitação concluída', message: `${input.code} foi concluída.` }
  }
  return { title: 'Etapa aprovada', message: `${input.code} foi encaminhada para ${stageLabel}.` }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function noticeEmailHtml(input: { title: string; message: string; link: string }): string {
  return `<p><strong>${escapeHtml(input.title)}</strong></p><p>${escapeHtml(input.message)}</p><p><a href="${escapeHtml(input.link)}">Abrir no PRO-MAT</a></p>`
}
