import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type SupportContext = {
  tenantIdExterno: string
  nomeEmpresa: string
  solicitante: { idExterno: string; nome: string; email: string }
}

export async function getSupportContext(): Promise<SupportContext | { error: NextResponse }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users')
    .select('name, tenant_id, is_active')
    .eq('id', user.id)
    .single()

  if (!profile || profile.is_active === false) {
    return { error: NextResponse.json({ error: 'Usuário sem acesso.' }, { status: 403 }) }
  }

  const isMaster = user.app_metadata?.is_master === true
  const tenantId = isMaster
    ? Number(user.app_metadata?.tenant_id ?? profile.tenant_id)
    : Number(profile.tenant_id)

  if (!Number.isFinite(tenantId)) {
    return { error: NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 }) }
  }

  const { data: tenant } = await supabaseAdmin.from('tenants').select('name').eq('id', tenantId).maybeSingle()
  if (!tenant?.name) {
    return { error: NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 }) }
  }

  const email = user.email?.trim() || (await supabaseAdmin.auth.admin.getUserById(user.id)).data.user?.email?.trim()
  if (!email) {
    return { error: NextResponse.json({ error: 'E-mail do solicitante não encontrado.' }, { status: 400 }) }
  }

  return {
    tenantIdExterno: String(tenantId),
    nomeEmpresa: String(tenant.name),
    solicitante: {
      idExterno: user.id,
      nome: String(profile.name || email),
      email,
    },
  }
}
