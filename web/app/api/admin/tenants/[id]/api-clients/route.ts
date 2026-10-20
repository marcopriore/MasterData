import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateApiKey } from '@/lib/material-api/api-key'
import { auditTenant, missingTable, requireMasterTenant } from '@/lib/master-access'

const COLUMNS = 'id, name, key_prefix, is_active, created_at, last_used_at, revoked_at'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Context) {
  const ctx = await requireMasterTenant((await params).id)
  if ('error' in ctx) return ctx.error
  const { data, error } = await supabaseAdmin
    .from('api_clients')
    .select(COLUMNS)
    .eq('tenant_id', ctx.tenant.id)
    .order('created_at', { ascending: false })
  if (error) return missingTable(error.message, 'api_clients', '020_material_api.sql')
  return NextResponse.json({ data: data ?? [] })
}

/** Gera a chave. O texto completo só sai nesta resposta. */
export async function POST(request: Request, { params }: Context) {
  const ctx = await requireMasterTenant((await params).id)
  if ('error' in ctx) return ctx.error
  const body = await request.json().catch(() => null) as { name?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 100) {
    return NextResponse.json({ error: 'Informe o nome do sistema (até 100 caracteres).' }, { status: 400 })
  }

  const { key, hash, prefix } = generateApiKey()
  const { data, error } = await supabaseAdmin
    .from('api_clients')
    .insert({ tenant_id: ctx.tenant.id, name, key_hash: hash, key_prefix: prefix, created_by: ctx.userId })
    .select(COLUMNS)
    .single()
  if (error) return missingTable(error.message, 'api_clients', '020_material_api.sql')

  await auditTenant(ctx.tenant.id, ctx.userId, 'api_client_created', `Chave de API gerada para "${name}"`, { prefixo: prefix })
  return NextResponse.json({ data, key }, { status: 201 })
}
