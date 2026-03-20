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

const EXAMPLE_ROW = [
  'C', '', 'ROLAMENTO ESFERAS 6205 25MM', 'PDM-ROL-001', 'Ativo',
  'UN', 'Rolamento', '', '', 0.25, 0.23, 'KG', '', '', 14, 10, 100, 45.9, '', 'BRL',
  '8482.10.10', '6102', '0 - Nacional',
]

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, EXAMPLE_ROW])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Materiais')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=template_importacao_materiais.xlsx',
    },
  })
}
