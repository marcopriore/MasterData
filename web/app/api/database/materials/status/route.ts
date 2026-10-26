import { NextResponse } from 'next/server'
import { MATERIAL_STATUS } from '@/lib/material-api/payload'
import { getCallerAccess } from '@/lib/server-access'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const MAX_IDS = 100

/**
 * Alteração em lote do status de negócio (Ativo | Bloqueado | Obsoleto).
 * - Bloqueado: só local (não mexe em erp_status).
 * - Obsoleto com id_erp: marca pendente_erp para a próxima sincronização eliminar no ERP.
 * - Obsoleto sem id_erp: só local.
 * Material em integrando é ignorado.
 */
export async function POST(request: Request) {
  const ctx = await getCallerAccess()
  if ('error' in ctx) return ctx.error
  if (!ctx.isMaster && !ctx.permissions.can_standardize) {
    return NextResponse.json({ error: 'Sem permissão para alterar status na base.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as { ids?: unknown; status?: unknown } | null
  const status = typeof body?.status === 'string' ? body.status.trim() : ''
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.map(Number).filter(Number.isInteger))]
    : []

  if (!(MATERIAL_STATUS as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `status deve ser ${MATERIAL_STATUS.join(', ')}` },
      { status: 400 }
    )
  }
  if (ids.length === 0 || ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Informe de 1 a ${MAX_IDS} materiais.` }, { status: 400 })
  }

  // Status e situação no ERP só mudam pelo servidor (gatilho guard_material_database, migration 032).
  const supabase = supabaseAdmin
  const { data: rows, error: fetchErr } = await supabase
    .from('material_database')
    .select('id, id_sistema, id_erp, status, erp_status')
    .eq('tenant_id', ctx.tenantId)
    .in('id', ids)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const found = new Map((rows ?? []).map((r) => [r.id as number, r]))
  const updated: number[] = []
  const pendingElimination: number[] = []
  const skipped: { id: number; reason: string }[] = []
  const now = new Date().toISOString()

  for (const id of ids) {
    const row = found.get(id)
    if (!row) {
      skipped.push({ id, reason: 'não encontrado neste tenant' })
      continue
    }
    if (row.erp_status === 'integrando') {
      skipped.push({ id, reason: 'material em integração com o ERP' })
      continue
    }
    if (row.status === status) {
      skipped.push({ id, reason: 'já está neste status' })
      continue
    }

    const patch: Record<string, unknown> = { status, updated_at: now }
    const hasErpCode = typeof row.id_erp === 'string' && row.id_erp.trim() !== ''

    if (status === 'Obsoleto' && hasErpCode) {
      patch.erp_status = 'pendente_erp'
      pendingElimination.push(id)
    }

    const { error: upErr } = await supabase
      .from('material_database')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .neq('erp_status', 'integrando')

    if (upErr) {
      skipped.push({ id, reason: upErr.message })
      continue
    }
    updated.push(id)
  }

  if (updated.length > 0) {
    await supabase.from('system_logs').insert({
      tenant_id: ctx.tenantId,
      user_id: ctx.userId,
      category: 'database',
      action: 'materials_status_bulk',
      description: `Status alterado para ${status} em ${updated.length} material(is)`,
      event_data: { status, updated_ids: updated, pending_elimination: pendingElimination, skipped },
    })
  }

  return NextResponse.json({
    status,
    updated,
    pending_elimination: pendingElimination,
    skipped,
    total: ids.length,
  })
}
