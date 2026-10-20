import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { mergeRolePermissions, type RolePermissions } from '@/lib/permissions'

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const isMaster = user.app_metadata?.is_master === true
  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id, roles!users_role_id_fkey(permissions)')
    .eq('id', user.id)
    .single()

  const tenantId = isMaster
    ? Number(user.app_metadata?.tenant_id ?? profile?.tenant_id)
    : Number(profile?.tenant_id)
  if (!Number.isFinite(tenantId)) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 })

  if (!isMaster) {
    const { data: memberships } = await supabase
      .from('user_role_groups')
      .select('roles(permissions)')
      .eq('user_id', user.id)
    const groups = (memberships ?? []).map((row) => {
      const role = Array.isArray(row.roles) ? row.roles[0] : row.roles
      return { permissions: (role as { permissions?: Partial<RolePermissions> } | null)?.permissions ?? null }
    })
    const stage = Array.isArray(profile?.roles) ? profile.roles[0] : profile?.roles
    const source = groups.length > 0 ? groups : [{ permissions: (stage as { permissions?: Partial<RolePermissions> } | null)?.permissions ?? null }]
    const { data: grants } = await supabase.from('user_permission_grants').select('permission_key').eq('user_id', user.id)
    const perms = mergeRolePermissions(source, (grants ?? []).map((grant) => grant.permission_key as string))
    if (!perms.can_view_logs) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  const params = new URL(request.url).searchParams
  const direction = params.get('direction')
  const system = params.get('system')
  let query = supabaseAdmin
    .from('integration_logs')
    .select('id, direction, system, action, method, path, status_code, success, duration_ms, error_message, detail, created_at, api_clients(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (direction === 'outbound' || direction === 'inbound') query = query.eq('direction', direction)
  query = system === 'externo' || system === 'erp'
    ? query.eq('system', system)
    : query.in('system', ['externo', 'erp'])

  const { data, error } = await query
  if (error) {
    const missing = /integration_logs|api_client/.test(error.message)
    return NextResponse.json(
      { error: missing ? 'Aplique as migrations 019 e 020 no Supabase.' : error.message },
      { status: missing ? 503 : 400 },
    )
  }
  const rows = (data ?? []).map(({ api_clients: client, ...row }) => {
    const one = Array.isArray(client) ? client[0] : client
    return { ...row, client_name: (one as { name?: string } | null)?.name ?? null }
  })
  return NextResponse.json({ data: rows })
}
