import { NextResponse } from 'next/server'
import { eliminateMaterial, integrateMaterial, syncMaterial } from '@/lib/erp/integrate'
import { getCallerAccess } from '@/lib/server-access'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_IDS = 100

/**
 * Ação humana na Base de Dados:
 * - sincronizar: roteia Ativo→criar/alterar, Obsoleto+id_erp→eliminar, Bloqueado→skip
 * - integrar / eliminar: ações explícitas (detalhe)
 * Resultado 'mock' / 'not_configured' quer dizer que não há integração ativa e a tela pode simular.
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
      results.push({ id, ...(await syncMaterial(ctx.tenantId, id, ctx.userId)) })
    } else if (action === 'integrar') {
      results.push({ id, ...(await integrateMaterial(ctx.tenantId, id, ctx.userId)) })
    } else {
      results.push({ id, ...(await eliminateMaterial(ctx.tenantId, id, ctx.userId)) })
    }
  }
  return NextResponse.json({ results })
}
