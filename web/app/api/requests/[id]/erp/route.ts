import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { integrateRequestMaterial } from '@/lib/erp/integrate'
import { getCallerAccess } from '@/lib/server-access'
import { isDoneStatus } from '@/lib/request-status'

export const runtime = 'nodejs'

/** Depois da última etapa: cria no ERP o material da solicitação, se o tenant tiver integração de criação ativa. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCallerAccess()
  if ('error' in ctx) return ctx.error
  if (!ctx.isMaster && !ctx.permissions.can_approve) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  const requestId = Number((await params).id)
  if (!Number.isInteger(requestId)) return NextResponse.json({ error: 'Solicitação inválida' }, { status: 400 })

  const { data: row } = await supabaseAdmin
    .from('material_requests')
    .select('id, status')
    .eq('id', requestId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })
  if (!isDoneStatus(row.status)) {
    return NextResponse.json({ result: 'skipped', reason: 'solicitação ainda não finalizada' })
  }

  const outcome = await integrateRequestMaterial(ctx.tenantId, requestId, ctx.userId)
  return NextResponse.json(outcome)
}
