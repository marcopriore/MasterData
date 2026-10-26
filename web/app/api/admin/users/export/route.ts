import { supabaseAdmin } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/server-access'
import { authEmailsById } from '@/lib/auth-emails'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  const ctx = await requirePermission('can_manage_users')
  if ('error' in ctx) return ctx.error

  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, name, tenant_id, role_id, is_active, roles!users_role_id_fkey(name), tenants(name, slug)')
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const emailMap = await authEmailsById((users ?? []).map((u) => u.id))

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
