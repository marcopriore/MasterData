import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type MasterTenant = { userId: string; tenant: { id: number; name: string; slug: string } }

/** Rotas de configuração de tenant: só Master, e o tenant precisa existir. */
export async function requireMasterTenant(rawId: string): Promise<MasterTenant | { error: NextResponse }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  if (user.app_metadata?.is_master !== true) {
    return { error: NextResponse.json({ error: 'Apenas master configura tenant' }, { status: 403 }) }
  }

  const tenantId = Number(rawId)
  if (!Number.isInteger(tenantId)) return { error: NextResponse.json({ error: 'Tenant inválido' }, { status: 400 }) }
  const { data } = await supabaseAdmin.from('tenants').select('id, name, slug').eq('id', tenantId).maybeSingle()
  if (!data) return { error: NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 }) }
  return { userId: user.id, tenant: data as MasterTenant['tenant'] }
}

export function missingTable(message: string, table: string, migration: string) {
  return message.includes(table)
    ? NextResponse.json({ error: `Aplique a(s) migration(s) ${migration} no Supabase.` }, { status: 503 })
    : NextResponse.json({ error: message }, { status: 400 })
}

export async function auditTenant(tenantId: number, userId: string, action: string, description: string, eventData: Record<string, unknown>) {
  await supabaseAdmin.from('system_logs').insert({
    tenant_id: tenantId,
    user_id: userId,
    category: 'system',
    action,
    description: description.slice(0, 500),
    event_data: eventData,
  })
}
