import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') ?? ''
  const userId = searchParams.get('user_id') ?? ''
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''

  let query = supabase.from('system_logs').select('*').order('created_at', { ascending: false }).limit(5000)
  if (category) query = query.eq('category', category)
  if (userId) query = query.eq('user_id', userId)
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', to)

  const { data: logs, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set((logs ?? []).map((r) => r.user_id).filter(Boolean))] as string[]
  const userMap: Record<string, string> = {}
  for (const uid of userIds) {
    const { data: u } = await supabase.from('users').select('name').eq('id', uid).single()
    userMap[uid] = u?.name ?? ''
  }

  const rows = (logs ?? []).map((r) => ({
    Data: r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : '',
    Usuário: r.user_id ? userMap[r.user_id] ?? '' : '',
    Categoria: r.category,
    Ação: r.action,
    Descrição: r.description,
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Logs')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=logs_export_${today}.xlsx`,
    },
  })
}
