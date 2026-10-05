import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { dispatchRequestNotice } from '@/lib/dispatch-request-notice'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null) as { requestId?: unknown } | null
  const requestId = Number(body?.requestId)
  if (!Number.isFinite(requestId)) {
    return NextResponse.json({ error: 'Solicitação inválida' }, { status: 400 })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const result = await dispatchRequestNotice({ requestId, actorId: user.id, appOrigin: origin })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, notified: result.notified, emailed: result.emailed })
}
