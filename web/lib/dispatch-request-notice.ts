import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send-email'
import {
  noticeCopy,
  noticeEmailHtml,
  noticeEventFromHistory,
  requestCode,
  selectNoticeRecipients,
  type NoticeCandidate,
  type NoticePrefs,
} from '@/lib/request-notices'

const RECENT_MS = 10 * 60 * 1000
const HISTORY_MS = 5 * 60 * 1000

type RoleEmbed = { name?: string | null } | { name?: string | null }[] | null

function oneRoleName(value: RoleEmbed): string {
  const row = Array.isArray(value) ? value[0] : value
  return row?.name ?? ''
}

function asPrefs(value: unknown): Partial<NoticePrefs> | null {
  if (!value) return null
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== 'object') return null
  return row as Partial<NoticePrefs>
}

function reasonFromHistory(eventData: unknown): string {
  if (!eventData || typeof eventData !== 'object') return ''
  const justification = (eventData as { justification?: unknown }).justification
  return typeof justification === 'string' ? justification : ''
}

export async function dispatchRequestNotice(input: {
  requestId: number
  actorId: string
  appOrigin: string
}): Promise<{ ok: true; notified: number; emailed: number } | { ok: false; status: number; error: string }> {
  const { data: request, error: requestError } = await supabaseAdmin
    .from('material_requests')
    .select('id, tenant_id, user_id')
    .eq('id', input.requestId)
    .maybeSingle()

  if (requestError) return { ok: false, status: 400, error: requestError.message }
  if (!request) return { ok: false, status: 404, error: 'Solicitação não encontrada' }

  const { data: history, error: historyError } = await supabaseAdmin
    .from('request_history')
    .select('event_type, stage, event_data, created_at')
    .eq('request_id', input.requestId)
    .eq('user_id', input.actorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (historyError) return { ok: false, status: 400, error: historyError.message }
  if (!history) return { ok: false, status: 403, error: 'Sem ação recente nesta solicitação' }

  const createdAt = new Date(history.created_at as string).getTime()
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > HISTORY_MS) {
    return { ok: false, status: 403, error: 'Sem ação recente nesta solicitação' }
  }

  const event = noticeEventFromHistory(String(history.event_type ?? ''), history.stage as string | null)
  if (!event) return { ok: false, status: 400, error: 'Evento sem aviso' }

  const { data: rows, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id, is_active, roles!users_role_id_fkey(name), user_role_groups(roles(name)), user_notification_prefs(*)')
    .eq('tenant_id', request.tenant_id)
    .eq('is_active', true)

  if (usersError) return { ok: false, status: 400, error: usersError.message }

  const users: NoticeCandidate[] = (rows ?? []).map((row) => {
    const groups = Array.isArray(row.user_role_groups) ? row.user_role_groups : []
    return {
      id: row.id as string,
      isActive: row.is_active !== false,
      stageRoleName: oneRoleName(row.roles as RoleEmbed),
      groupNames: groups.map((group: { roles: RoleEmbed }) => oneRoleName(group.roles)),
      prefs: asPrefs(row.user_notification_prefs),
    }
  })

  const planned = selectNoticeRecipients({
    event,
    actorId: input.actorId,
    requesterId: (request.user_id as string | null) ?? null,
    stage: (history.stage as string | null) ?? null,
    users,
  })
  if (planned.length === 0) return { ok: true, notified: 0, emailed: 0 }

  const since = new Date(Date.now() - RECENT_MS).toISOString()
  const { data: existing } = await supabaseAdmin
    .from('notifications')
    .select('user_id')
    .eq('request_id', input.requestId)
    .eq('event_type', event)
    .in('user_id', planned.map((item) => item.userId))
    .gte('created_at', since)

  const already = new Set((existing ?? []).map((row) => row.user_id as string))
  const fresh = planned.filter((item) => !already.has(item.userId))
  if (fresh.length === 0) return { ok: true, notified: 0, emailed: 0 }

  const copy = noticeCopy(event, {
    code: requestCode(input.requestId),
    stage: String(history.stage ?? ''),
    reason: reasonFromHistory(history.event_data),
  })
  const link = `${input.appOrigin.replace(/\/$/, '')}/governance/request/${input.requestId}`

  const inApp = fresh.filter((item) => item.inApp)
  if (inApp.length > 0) {
    const { error: insertError } = await supabaseAdmin.from('notifications').insert(
      inApp.map((item) => ({
        tenant_id: request.tenant_id,
        user_id: item.userId,
        request_id: input.requestId,
        event_type: event,
        title: copy.title.slice(0, 200),
        message: copy.message.slice(0, 500),
      }))
    )
    if (insertError) return { ok: false, status: 400, error: insertError.message }
  }

  let emailed = 0
  const emailTargets = fresh.filter((item) => item.email)
  await Promise.all(
    emailTargets.map(async (item) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(item.userId)
      const to = data.user?.email?.trim()
      if (!to) return
      const sent = await sendEmail({
        to,
        subject: copy.title,
        html: noticeEmailHtml({ title: copy.title, message: copy.message, link }),
      })
      if (sent) emailed += 1
    })
  )

  return { ok: true, notified: inApp.length, emailed }
}
