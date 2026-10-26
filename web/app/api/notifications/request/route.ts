import { NextResponse } from 'next/server'
import { getCallerAccess } from '@/lib/server-access'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { dispatchRequestNotice } from '@/lib/dispatch-request-notice'

export async function POST(request: Request) {
  const ctx = await getCallerAccess()
  if ('error' in ctx) return ctx.error

  const body = await request.json().catch(() => null) as { requestId?: unknown } | null
  const requestId = Number(body?.requestId)
  if (!Number.isFinite(requestId)) {
    return NextResponse.json({ error: 'Solicitação inválida' }, { status: 400 })
  }

  const { data: owned } = await supabaseAdmin
    .from('material_requests')
    .select('id')
    .eq('id', requestId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  if (!owned) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const result = await dispatchRequestNotice({ requestId, actorId: ctx.userId, appOrigin: origin })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, notified: result.notified, emailed: result.emailed })
}
