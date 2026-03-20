import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

const PDM_HEADERS = ['operacao', 'pdm_code', 'nome', 'descricao', 'ativo']
const PDM_EXAMPLE = ['C', 'PDM-EX-001', 'Exemplo PDM', 'Descrição do PDM', 'Sim']

const ATTR_HEADERS = ['operacao', 'pdm_code', 'atributo_key', 'label', 'tipo', 'obrigatorio', 'ordem', 'opcoes']
const ATTR_EXAMPLE_1 = ['C', 'PDM-EX-001', 'diametro', 'Diâmetro', 'text', 'Sim', 1, '']
const ATTR_EXAMPLE_2 = ['C', 'PDM-EX-001', 'material_base', 'Material Base', 'select', 'Não', 2, 'Aço;Alumínio;Inox']

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const wsPdm = XLSX.utils.aoa_to_sheet([PDM_HEADERS, PDM_EXAMPLE])
  const wsAttr = XLSX.utils.aoa_to_sheet([ATTR_HEADERS, ATTR_EXAMPLE_1, ATTR_EXAMPLE_2])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsPdm, 'PDM')
  XLSX.utils.book_append_sheet(wb, wsAttr, 'Atributos')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=template_importacao_pdm.xlsx',
    },
  })
}
