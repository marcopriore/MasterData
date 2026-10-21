import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { parseErpConnection, type ErpConnectionInput } from '@/lib/erp-connections'
import { CONNECTION_COLUMNS, connectionRow, secretAudit, toConnectionView } from '@/lib/erp-connection-store'
import { auditTenant, missingTable, requireMasterTenant } from '@/lib/master-access'
import { secretBoxReady } from '@/lib/secret-box'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Context) {
  const ctx = await requireMasterTenant((await params).id)
  if ('error' in ctx) return ctx.error
  const { data, error } = await supabaseAdmin
    .from('tenant_erp_connections')
    .select(CONNECTION_COLUMNS)
    .eq('tenant_id', ctx.tenant.id)
    .order('operation', { ascending: true })
    .order('id', { ascending: true })
  if (error) return missingTable(error.message, 'tenant_erp_connections', '022 e 023')
  return NextResponse.json({
    tenant: ctx.tenant,
    connections: (data ?? []).map((row) => toConnectionView(row as Record<string, unknown>)),
    secret_box_ready: secretBoxReady(),
  })
}

/** Nova integração. Nasce ativa se não houver outra ativa para a mesma operação. */
export async function POST(request: Request, { params }: Context) {
  const ctx = await requireMasterTenant((await params).id)
  if ('error' in ctx) return ctx.error

  const body = await request.json().catch(() => null) as ErpConnectionInput | null
  const parsed = parseErpConnection(body ?? {}, { hasSecret: false, allowHttp: process.env.NODE_ENV !== 'production' })
  if (!parsed.ok) return NextResponse.json({ error: parsed.errors.join('; '), errors: parsed.errors }, { status: 400 })

  const built = connectionRow(parsed.value, ctx.userId, false)
  if (!built.ok) return built.response

  const { data: active, error: readError } = await supabaseAdmin
    .from('tenant_erp_connections')
    .select('id')
    .eq('tenant_id', ctx.tenant.id)
    .eq('operation', parsed.value.operation)
    .eq('is_active', true)
    .limit(1)
  if (readError) return missingTable(readError.message, 'tenant_erp_connections', '022 e 023')

  const { data, error } = await supabaseAdmin
    .from('tenant_erp_connections')
    .insert({ ...built.row, tenant_id: ctx.tenant.id, is_active: (active ?? []).length === 0 })
    .select(CONNECTION_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await auditTenant(ctx.tenant.id, ctx.userId, 'erp_connection_created', `Integração ERP "${parsed.value.name}" criada`, {
    operacao: parsed.value.operation,
    metodo: parsed.value.http_method,
    autenticacao: parsed.value.auth_type,
    segredo: secretAudit(parsed.value),
  })
  return NextResponse.json({ connection: toConnectionView(data as Record<string, unknown>) }, { status: 201 })
}
