import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

const HEADERS = [
  'operacao', 'codigo_material', 'descricao', 'pdm_code', 'status',
  'unit_of_measure', 'material_type', 'gross_weight', 'net_weight',
  'lead_time', 'min_stock', 'max_stock', 'standard_price', 'ncm', 'cfop', 'origem',
]

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  const tenantId = profile?.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'Perfil sem tenant' }, { status: 400 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

  const url = new URL(request.url)
  const searchParams = url.searchParams
  const dryRun = searchParams.get('dry_run') !== 'false'

  const buf = Buffer.from(await file.arrayBuffer())
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  } catch {
    return NextResponse.json({ error: 'Arquivo Excel inválido' }, { status: 400 })
  }

  const sheetName = wb.SheetNames.find((s) => s === 'Materiais') ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })

  if (!data.length) return NextResponse.json({
    dry_run: true,
    total_rows: 0,
    valid_rows: 0,
    error_rows: 0,
    warning_rows: 0,
    rows: [],
    _error: 'Planilha vazia',
  })

  const rawHeaders = (data[0] ?? []).map((h) => String(h ?? '').trim().toLowerCase())
  const colMap: Record<string, number> = {}
  rawHeaders.forEach((h, i) => { if (h) colMap[h] = i })

  const reqCols = ['operacao', 'descricao', 'pdm_code']
  for (const rc of reqCols) {
    if (!(rc in colMap)) {
      return NextResponse.json({
        dry_run: true,
        total_rows: 0,
        valid_rows: 0,
        error_rows: 0,
        warning_rows: 0,
        rows: [],
        _error: `Coluna obrigatória '${rc}' não encontrada`,
      })
    }
  }

  const get = (row: string[], key: string) => {
    const i = colMap[key]
    return i != null ? String(row[i] ?? '').trim() : ''
  }
  const getNum = (row: string[], key: string) => {
    const v = get(row, key)
    if (!v) return null
    const n = parseFloat(v.replace(',', '.'))
    return isNaN(n) ? null : n
  }

  const rows: Array<{
    row_number: number
    operacao: string
    codigo_material: string | null
    descricao: string | null
    status: 'ok' | 'warning' | 'error'
    errors: string[]
    warnings: string[]
    data: Record<string, unknown>
  }> = []
  let validRows = 0
  let errorRows = 0
  let warningRows = 0

  for (let r = 1; r < data.length; r++) {
    const row = (data[r] ?? []) as string[]
    const operacao = get(row, 'operacao').toUpperCase().slice(0, 1)
    const codigo = get(row, 'codigo_material')
    const descricao = get(row, 'descricao')
    const pdmCode = get(row, 'pdm_code')
    const statusVal = get(row, 'status') || 'Ativo'

    const errors: string[] = []
    const warnings: string[] = []

    if (operacao !== 'C' && operacao !== 'E') errors.push('operacao deve ser C ou E')
    if (operacao === 'E' && !codigo) errors.push('codigo_material obrigatório para Editar')
    if (operacao === 'C' && !descricao) errors.push('descricao obrigatória para Criar')
    if (!pdmCode) errors.push('pdm_code obrigatório')
    if (statusVal && !['Ativo', 'Bloqueado', 'Obsoleto'].includes(statusVal)) {
      warnings.push('status inválido; será usado Ativo')
    }

    const rowData: Record<string, unknown> = {
      description: descricao || null,
      pdm_code: pdmCode || null,
      status: statusVal || 'Ativo',
      unit_of_measure: get(row, 'unit_of_measure') || null,
      material_type: get(row, 'material_type') || null,
      gross_weight: getNum(row, 'gross_weight'),
      net_weight: getNum(row, 'net_weight'),
      lead_time: getNum(row, 'lead_time'),
      min_stock: getNum(row, 'min_stock'),
      max_stock: getNum(row, 'max_stock'),
      standard_price: getNum(row, 'standard_price'),
      ncm: get(row, 'ncm') || null,
      cfop: get(row, 'cfop') || null,
      origin: get(row, 'origem') || null,
    }

    const hasError = errors.length > 0
    const hasWarn = warnings.length > 0
    if (hasError) errorRows++
    else if (hasWarn) warningRows++
    else validRows++

    rows.push({
      row_number: r + 1,
      operacao: operacao || '',
      codigo_material: codigo || null,
      descricao: descricao || null,
      status: hasError ? 'error' : hasWarn ? 'warning' : 'ok',
      errors,
      warnings,
      data: rowData,
    })
  }

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      total_rows: rows.length,
      valid_rows: validRows,
      error_rows: errorRows,
      warning_rows: warningRows,
      rows,
    })
  }

  if (errorRows > 0) {
    return NextResponse.json({ error: `${errorRows} linha(s) com erro. Corrija e tente novamente.` }, { status: 400 })
  }

  let created = 0
  let updated = 0

  for (const r of rows) {
    if (r.status === 'error') continue
    const d = r.data as Record<string, unknown>
    if (r.operacao === 'C') {
      const { error } = await supabaseAdmin.from('material_database').insert({
        tenant_id: tenantId,
        description: d.description,
        pdm_code: d.pdm_code,
        status: d.status ?? 'Ativo',
        unit_of_measure: d.unit_of_measure,
        material_type: d.material_type,
        gross_weight: d.gross_weight,
        net_weight: d.net_weight,
        lead_time: d.lead_time,
        min_stock: d.min_stock,
        max_stock: d.max_stock,
        standard_price: d.standard_price,
        ncm: d.ncm,
        cfop: d.cfop,
        origin: d.origin,
      })
      if (!error) created++
    } else {
      const { data: existing } = await supabaseAdmin
        .from('material_database')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('id_erp', r.codigo_material)
        .single()
      if (existing) {
        const { error } = await supabaseAdmin.from('material_database').update({
          description: d.description,
          pdm_code: d.pdm_code,
          status: d.status,
          unit_of_measure: d.unit_of_measure,
          material_type: d.material_type,
          gross_weight: d.gross_weight,
          net_weight: d.net_weight,
          lead_time: d.lead_time,
          min_stock: d.min_stock,
          max_stock: d.max_stock,
          standard_price: d.standard_price,
          ncm: d.ncm,
          cfop: d.cfop,
          origin: d.origin,
        }).eq('id', existing.id)
        if (!error) updated++
      }
    }
  }

  return NextResponse.json({ created, updated })
}
