import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { parseErpConnection, type ErpConnectionInput } from '@/lib/erp-connections'
import {
  activeConflict,
  CONNECTION_COLUMNS,
  connectionRow,
  secretAudit,
  toConnectionView,
} from '@/lib/erp-connection-store'
import { auditTenant, requireMasterTenant } from '@/lib/master-access'

type Context = { params: Promise<{ id: string; connectionId: string }> }

async function load(context: Context) {
  const { id, connectionId } = await context.params
  const ctx = await requireMasterTenant(id)
  if ('error' in ctx) return ctx
  const connId = Number(connectionId)
  if (!Number.isInteger(connId)) return { error: NextResponse.json({ error: 'Integração inválida' }, { status: 400 }) }
  const { data } = await supabaseAdmin
    .from('tenant_erp_connections')
    .select('id, name, operation, is_active, secret_ciphertext')
    .eq('id', connId)
    .eq('tenant_id', ctx.tenant.id)
    .maybeSingle()
  if (!data) return { error: NextResponse.json({ error: 'Integração não encontrada' }, { status: 404 }) }
  return { ...ctx, current: data as { id: number; name: string; operation: string; is_active: boolean; secret_ciphertext: string | null } }
}

async function otherActive(tenantId: number, operation: string, exceptId: number) {
  const { data } = await supabaseAdmin
    .from('tenant_erp_connections')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('operation', operation)
    .eq('is_active', true)
    .neq('id', exceptId)
    .limit(1)
  return (data ?? []).length > 0
}

/** Modificar. Segredo em branco mantém o atual. */
export async function PUT(request: Request, context: Context) {
  const ctx = await load(context)
  if ('error' in ctx) return ctx.error

  const body = await request.json().catch(() => null) as ErpConnectionInput | null
  const hadSecret = Boolean(ctx.current.secret_ciphertext)
  const parsed = parseErpConnection(body ?? {}, { hasSecret: hadSecret, allowHttp: process.env.NODE_ENV !== 'production' })
  if (!parsed.ok) return NextResponse.json({ error: parsed.errors.join('; '), errors: parsed.errors }, { status: 400 })
  if (ctx.current.is_active && parsed.value.operation !== ctx.current.operation
    && await otherActive(ctx.tenant.id, parsed.value.operation, ctx.current.id)) {
    return activeConflict(parsed.value.operation)
  }

  const built = connectionRow(parsed.value, ctx.userId, hadSecret)
  if (!built.ok) return built.response

  const { data, error } = await supabaseAdmin
    .from('tenant_erp_connections')
    .update(built.row)
    .eq('id', ctx.current.id)
    .eq('tenant_id', ctx.tenant.id)
    .select(CONNECTION_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await auditTenant(ctx.tenant.id, ctx.userId, 'erp_connection_updated', `Integração ERP "${parsed.value.name}" modificada`, {
    operacao: parsed.value.operation,
    metodo: parsed.value.http_method,
    autenticacao: parsed.value.auth_type,
    segredo: secretAudit(parsed.value),
  })
  return NextResponse.json({ connection: toConnectionView(data as Record<string, unknown>) })
}

/** Ativar ou desativar. Só uma ativa por operação. */
export async function PATCH(request: Request, context: Context) {
  const ctx = await load(context)
  if ('error' in ctx) return ctx.error
  const body = await request.json().catch(() => null) as { is_active?: unknown } | null
  if (typeof body?.is_active !== 'boolean') return NextResponse.json({ error: 'Informe is_active' }, { status: 400 })

  if (body.is_active && await otherActive(ctx.tenant.id, ctx.current.operation, ctx.current.id)) {
    return activeConflict(ctx.current.operation)
  }
  const { data, error } = await supabaseAdmin
    .from('tenant_erp_connections')
    .update({ is_active: body.is_active, updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', ctx.current.id)
    .eq('tenant_id', ctx.tenant.id)
    .select(CONNECTION_COLUMNS)
    .single()
  if (error) {
    return error.code === '23505' ? activeConflict(ctx.current.operation) : NextResponse.json({ error: error.message }, { status: 400 })
  }

  await auditTenant(
    ctx.tenant.id,
    ctx.userId,
    body.is_active ? 'erp_connection_enabled' : 'erp_connection_disabled',
    `Integração ERP "${ctx.current.name}" ${body.is_active ? 'ativada' : 'desativada'}`,
    { operacao: ctx.current.operation },
  )
  return NextResponse.json({ connection: toConnectionView(data as Record<string, unknown>) })
}

export async function DELETE(_request: Request, context: Context) {
  const ctx = await load(context)
  if ('error' in ctx) return ctx.error
  const { error } = await supabaseAdmin
    .from('tenant_erp_connections')
    .delete()
    .eq('id', ctx.current.id)
    .eq('tenant_id', ctx.tenant.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await auditTenant(ctx.tenant.id, ctx.userId, 'erp_connection_deleted', `Integração ERP "${ctx.current.name}" excluída`, {
    operacao: ctx.current.operation,
  })
  return NextResponse.json({ ok: true })
}
