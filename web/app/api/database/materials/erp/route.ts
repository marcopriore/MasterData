import { NextResponse } from 'next/server'
import { eliminateMaterial, integrateMaterial, syncMaterial } from '@/lib/erp/integrate'
import { simulateEliminate, simulateIntegrate } from '@/lib/erp/simulate'
import { getCallerAccess } from '@/lib/server-access'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_IDS = 100

/**
 * Ação humana na Base de Dados:
 * - sincronizar: roteia Ativo→criar/alterar, Obsoleto+id_erp→eliminar, Bloqueado→skip
 * - integrar / eliminar: ações explícitas (detalhe)
 * Sem integração ativa, a simulação roda aqui mesmo (lib/erp/simulate.ts); a resposta traz simulated: true.
 */
export async function POST(request: Request) {
  const ctx = await getCallerAccess()
  if ('error' in ctx) return ctx.error
  if (!ctx.isMaster && !ctx.permissions.can_standardize) {
    return NextResponse.json({ error: 'Sem permissão para sincronizar com o ERP.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as { action?: unknown; ids?: unknown } | null
  const action = body?.action
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.map(Number).filter(Number.isInteger))] : []
  if (action !== 'integrar' && action !== 'eliminar' && action !== 'sincronizar') {
    return NextResponse.json({ error: 'Ação deve ser sincronizar, integrar ou eliminar.' }, { status: 400 })
  }
  if (ids.length === 0 || ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Informe de 1 a ${MAX_IDS} materiais.` }, { status: 400 })
  }

  const results = []
  for (const id of ids) {
    if (action === 'sincronizar') {
      const out = await syncMaterial(ctx.tenantId, id, ctx.userId)
      if (out.result === 'mock' && out.plan !== 'eliminar') {
        const sim = await simulateIntegrate(ctx.tenantId, id, ctx.userId)
        results.push({ id, ...sim, plan: out.plan, simulated: true })
      } else if (out.result === 'not_configured' || (out.result === 'mock' && out.plan === 'eliminar')) {
        results.push({ id, ...(await simulateEliminate(ctx.tenantId, id, ctx.userId)), plan: 'eliminar', simulated: true })
      } else {
        results.push({ id, ...out })
      }
    } else if (action === 'integrar') {
      const out = await integrateMaterial(ctx.tenantId, id, ctx.userId)
      results.push(out.result === 'mock'
        ? { id, ...(await simulateIntegrate(ctx.tenantId, id, ctx.userId)), simulated: true }
        : { id, ...out })
    } else {
      results.push({ id, ...(await eliminateMaterial(ctx.tenantId, id, ctx.userId)) })
    }
  }
  return NextResponse.json({ results })
}
