import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { buildSupportWebhookNotice, parseWebhookEvent, verifyWebhookSecret } from '@/lib/axisdesk/webhook'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!verifyWebhookSecret(request.headers.get('x-axisdesk-secret'), process.env.AXISDESK_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const json = await request.json().catch(() => null)
  const event = parseWebhookEvent(json)
  if (!event) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  if (event.evento === 'teste') return NextResponse.json({ ok: true, recebido: 'teste' })

  const tenantId = Number(event.tenant_id_externo)
  if (!Number.isFinite(tenantId)) {
    return NextResponse.json({ error: 'Recipient not found' }, { status: 422 })
  }

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('id, tenant_id, is_active')
    .eq('id', event.solicitante_id_externo)
    .maybeSingle()

  if (!profile || profile.is_active === false) {
    return NextResponse.json({ error: 'Recipient not found' }, { status: 422 })
  }

  const authUser = await supabaseAdmin.auth.admin.getUserById(event.solicitante_id_externo!)
  const isMaster = authUser.data.user?.app_metadata?.is_master === true
  if (!isMaster && Number(profile.tenant_id) !== tenantId) {
    return NextResponse.json({ error: 'Recipient not found' }, { status: 422 })
  }

  const notice = buildSupportWebhookNotice(event)
  if (!notice) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const { error } = await supabaseAdmin.from('notifications').insert({
    tenant_id: tenantId,
    user_id: profile.id,
    event_type: notice.eventType,
    title: notice.title.slice(0, 200),
    message: notice.message.slice(0, 500),
  })
  if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
