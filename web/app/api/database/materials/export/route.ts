import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

const TEMPLATE_HEADERS = [
  'operacao', 'codigo_material', 'descricao', 'pdm_code', 'status',
  'unit_of_measure', 'material_type', 'industry_sector', 'base_unit',
  'gross_weight', 'net_weight', 'weight_unit', 'volume', 'volume_unit',
  'lead_time', 'min_stock', 'max_stock', 'standard_price', 'price_unit', 'currency',
  'ncm', 'cfop', 'origem',
]

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const pdm_code = searchParams.get('pdm_code') ?? ''
  const erp_status = searchParams.get('erp_status') ?? ''
  const date_from = searchParams.get('date_from') ?? ''
  const date_to = searchParams.get('date_to') ?? ''

  let query = supabase.from('material_database').select('*').order('created_at', { ascending: false })
  if (q) query = query.or(`id_sistema.ilike.%${q}%,description.ilike.%${q}%,id_erp.ilike.%${q}%`)
  if (status) query = query.eq('status', status)
  if (pdm_code) query = query.eq('pdm_code', pdm_code)
  if (erp_status) query = query.eq('erp_status', erp_status)
  if (date_from) query = query.gte('created_at', date_from)
  if (date_to) query = query.lte('created_at', `${date_to}T23:59:59.999Z`)

  const { data: materials, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (materials ?? []).map((m) => [
    'E',
    m.id_erp ?? '',
    m.description ?? '',
    m.pdm_code ?? '',
    m.status ?? 'Ativo',
    m.unit_of_measure ?? '',
    m.material_type ?? '',
    '',
    '',
    m.gross_weight ?? '',
    m.net_weight ?? '',
    '',
    '',
    '',
    m.lead_time ?? '',
    m.min_stock ?? '',
    m.max_stock ?? '',
    m.standard_price ?? '',
    '',
    '',
    m.ncm ?? '',
    m.cfop ?? '',
    m.origin ?? '',
  ])

  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Materiais')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=materiais_export_${today}.xlsx`,
    },
  })
}
