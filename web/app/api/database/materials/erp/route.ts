import { NextResponse } from 'next/server'
import { eliminateMaterial, integrateMaterial } from '@/lib/erp/integrate'
import { getCallerAccess } from '@/lib/server-access'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_IDS = 100

/**
 * Ação humana na Base de Dados: integrar (criação ou alteração) ou eliminar no ERP.
 * Resultado 'mock' quer dizer que não há integração ativa e a tela segue com a simulação.
 */
export async function POST(request: Request) {
  const ctx = await getCallerAccess()
  if ('error' in ctx) return ctx.error
  if (!ctx.isMaster && !ctx.permissions.can_standardize) {
    return NextResponse.json({ error: 'Sem permissão para integrar com o ERP.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as { action?: unknown; ids?: unknown } | null
  const action = body?.action
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.map(Number).filter(Number.isInteger))] : []
  if (action !== 'integrar' && action !== 'eliminar') {
    return NextResponse.json({ error: 'Ação deve ser integrar ou eliminar.' }, { status: 400 })
  }
  if (ids.length === 0 || ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Informe de 1 a ${MAX_IDS} materiais.` }, { status: 400 })
  }

  const results = []
  for (const id of ids) {
    const outcome = action === 'integrar'
      ? await integrateMaterial(ctx.tenantId, id, ctx.userId)
      : await eliminateMaterial(ctx.tenantId, id, ctx.userId)
    results.push({ id, ...outcome })
  }
  return NextResponse.json({ results })
}
