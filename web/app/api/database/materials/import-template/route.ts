import { createServerSupabaseClient } from '@/lib/supabase/server'
import { GENERATED_FIELDS } from '@/lib/material-rules'
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
  'C', '', 'ROLAMENTO ESFERAS 6205 25MM', 'ROLA001', 'Ativo',
  'UN', 'Rolamento', '', '', 0.25, 0.23, 'KG', '', '', 14, 10, 100, 45.9, '', 'BRL',
  '8482.10.10', '6102', '0 - Nacional',
]

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  // Campos do dicionário do tenant (RLS), um por coluna, com o identificador do campo no cabeçalho.
  const { data: fields } = await supabase
    .from('field_dictionary')
    .select('field_name, field_label')
    .eq('is_active', true)
    .order('display_order')
  const dictionary = (fields ?? []).filter(
    (f) => !GENERATED_FIELDS.includes(f.field_name) && !TEMPLATE_HEADERS.includes(f.field_name)
  )

  const ws = XLSX.utils.aoa_to_sheet([
    [...TEMPLATE_HEADERS, ...dictionary.map((f) => f.field_name)],
    [...EXAMPLE_ROW, ...dictionary.map(() => '')],
  ])
  const legend = XLSX.utils.json_to_sheet(
    dictionary.map((f) => ({ Coluna: f.field_name, Campo: f.field_label }))
  )
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Materiais')
  XLSX.utils.book_append_sheet(wb, legend, 'Campos do dicionario')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=template_importacao_materiais.xlsx',
    },
  })
}
