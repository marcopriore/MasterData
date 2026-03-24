import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, roles(name)').eq('id', user.id).single()
  const isMaster = (user.app_metadata?.is_master as boolean) ?? false
  const effectiveTenantId = isMaster
    ? ((user.app_metadata?.tenant_id as number) ?? profile?.tenant_id)
    : profile?.tenant_id
  let q = supabaseAdmin.from('users').select('id, name, tenant_id, role_id, is_active, roles(name), tenants(name, slug)').order('created_at', { ascending: false })
  if (effectiveTenantId) q = q.eq('tenant_id', effectiveTenantId)
  const { data: users, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()
  const emailMap: Record<string, string> = {}
  for (const au of authUsers?.users ?? []) {
    if (au.email) emailMap[au.id] = au.email
  }

  const rows = (users ?? []).map((u) => {
    const role = Array.isArray(u.roles) ? u.roles[0] : u.roles
    const tenant = Array.isArray(u.tenants) ? u.tenants[0] : u.tenants
    return {
      Nome: u.name,
      Email: emailMap[u.id] ?? '',
      Tenant: tenant?.name ?? '',
      Perfil: role?.name ?? '',
      Ativo: u.is_active ? 'Sim' : 'Não',
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Usuários')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=usuarios_export_${today}.xlsx`,
    },
  })
}
