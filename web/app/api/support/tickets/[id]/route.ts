import { NextResponse } from 'next/server'
import { getTicketDetail } from '@/lib/axisdesk/client'
import { getSupportContext } from '@/lib/axisdesk/support-context'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
  const ctx = await getSupportContext()
  if ('error' in ctx) return ctx.error
  const result = await getTicketDetail(id, ctx.tenantIdExterno)
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status })
  return NextResponse.json({ data: result.data })
}
