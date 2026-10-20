import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { auditTenant, requireMasterTenant } from '@/lib/master-access'

/** Revoga a chave. A linha fica para o monitor continuar mostrando o nome do sistema. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string; clientId: string }> }) {
  const { id, clientId } = await context.params
  const ctx = await requireMasterTenant(id)
  if ('error' in ctx) return ctx.error
  const apiClientId = Number(clientId)
  if (!Number.isInteger(apiClientId)) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('api_clients')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('id', apiClientId)
    .eq('tenant_id', ctx.tenant.id)
    .select('id, name')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Chave não encontrada.' }, { status: 404 })

  await auditTenant(ctx.tenant.id, ctx.userId, 'api_client_revoked', `Chave de API de "${data.name}" revogada`, {})
  return NextResponse.json({ ok: true })
}
