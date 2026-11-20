import { NextResponse } from 'next/server'
import { loadRequestErpInfo } from '@/lib/erp/request-erp-status'
import { getCallerAccess } from '@/lib/server-access'

export const runtime = 'nodejs'

const MAX_IDS = 200

/** Situação no ERP do material de cada solicitação informada, com a mesma trava de duplicidade da base. */
export async function GET(request: Request) {
  const ctx = await getCallerAccess()
  if ('error' in ctx) return ctx.error

  const raw = new URL(request.url).searchParams.get('ids') ?? ''
  const ids = [...new Set(raw.split(',').map(Number).filter(Number.isInteger))].slice(0, MAX_IDS)
  if (ids.length === 0) return NextResponse.json({ items: [] })

  try {
    return NextResponse.json({ items: await loadRequestErpInfo(ctx.tenantId, ids) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Falha ao consultar a situação no ERP' }, { status: 500 })
  }
}
