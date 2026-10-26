import { requirePermission } from '@/lib/server-access'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

const PDM_HEADERS = ['operacao', 'pdm_code', 'nome', 'descricao', 'ativo']
const ATTR_HEADERS = ['operacao', 'pdm_code', 'atributo_key', 'label', 'tipo', 'obrigatorio', 'ordem', 'opcoes']

export async function GET() {
  const ctx = await requirePermission('can_edit_pdm')
  if ('error' in ctx) return ctx.error
  const effectiveTenantId = ctx.tenantId

  const { data: pdms, error } = await supabaseAdmin
    .from('pdm_templates')
    .select('id, name, internal_code, is_active, attributes')
    .eq('tenant_id', effectiveTenantId)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const pdmRows = (pdms ?? []).map((p) => [
    'E',
    p.internal_code ?? '',
    p.name ?? '',
    '',
    p.is_active ? 'Sim' : 'Não',
  ])

  const attrRows: (string | number)[][] = []
  for (const p of pdms ?? []) {
    const attrs = (p.attributes as Array<Record<string, unknown>>) ?? []
    const pdmCode = (p.internal_code as string) ?? ''
    for (const a of attrs) {
      const opts = (a.allowedValues as Array<{ value?: string } | string>) ?? []
      const opcoes = opts.map((ov) => (typeof ov === 'object' && ov?.value ? ov.value : String(ov))).join(';')
      let tipo = String(a.dataType ?? 'text').toLowerCase()
      if (tipo === 'lov') tipo = 'select'
      else if (tipo === 'numeric') tipo = 'number'
      attrRows.push([
        'E',
        pdmCode,
        (a.id ?? a.name ?? '') as string,
        (a.name ?? a.id ?? '') as string,
        tipo,
        a.isRequired ? 'Sim' : 'Não',
        (a.order as number) ?? 0,
        opcoes,
      ])
    }
  }

  const wsPdm = XLSX.utils.aoa_to_sheet([PDM_HEADERS, ...pdmRows])
  const wsAttr = XLSX.utils.aoa_to_sheet([ATTR_HEADERS, ...attrRows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsPdm, 'PDM')
  XLSX.utils.book_append_sheet(wb, wsAttr, 'Atributos')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="pdm_export_${today}.xlsx"`,
    },
  })
}
