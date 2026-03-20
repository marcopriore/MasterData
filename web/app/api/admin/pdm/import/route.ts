import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

const VALID_PDM_OPS = ['C', 'E']
const VALID_ATTR_OPS = ['C', 'E', 'D']
const VALID_TIPOS = ['text', 'number', 'select', 'date', 'textarea']
const VALID_ATIVO = ['sim', 'não', 's', 'n', '1', '0', 'true', 'false']
const VALID_OBRIGATORIO = ['sim', 'não', 's', 'n']

function getSheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet | null {
  const target = name.trim().toLowerCase()
  for (const sn of wb.SheetNames) {
    if (sn.trim().toLowerCase() === target) return wb.Sheets[sn]
  }
  return null
}

function safeInt(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && !isNaN(v)) return Math.floor(v)
  const s = String(v).trim().replace(',', '.')
  if (!s) return null
  const n = parseFloat(s)
  return isNaN(n) ? null : Math.floor(n)
}

function parseOpcoes(s: string): Array<{ value: string; abbreviation: string }> {
  if (!s || !String(s).trim()) return []
  return String(s)
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => ({ value: v, abbreviation: '' }))
}

function mapTipo(t: string): string {
  const lower = (t || 'text').toLowerCase()
  if (lower === 'select') return 'lov'
  if (lower === 'number') return 'numeric'
  return 'text'
}

type PdmRowResult = {
  row_number: number
  operacao: string
  pdm_code: string | null
  nome: string | null
  status: string
  errors: string[]
  warnings: string[]
  data: Record<string, unknown>
}

type AttrRowResult = {
  row_number: number
  operacao: string
  pdm_code: string | null
  atributo_key: string | null
  status: string
  errors: string[]
  warnings: string[]
  data: Record<string, unknown>
}

function parsePdmSheet(
  ws: XLSX.WorkSheet,
  pdmCodesInDb: Set<string>
): { rows: PdmRowResult[]; codesCreated: Set<string>; _error?: string } {
  const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })
  const codesCreated = new Set<string>()
  const rows: PdmRowResult[] = []
  if (!data.length) return { rows, codesCreated }
  const headers = (data[0] ?? []).map((h) => String(h ?? '').trim().toLowerCase())
  const colMap: Record<string, number> = {}
  headers.forEach((h, i) => {
    if (h) colMap[h] = i
  })
  const required = ['operacao', 'pdm_code', 'nome']
  for (const r of required) {
    if (!(r in colMap)) {
      return {
        rows: [],
        codesCreated,
        _error: `Coluna obrigatória '${r}' não encontrada na aba PDM.`,
      }
    }
  }
  const get = (row: string[], key: string) => {
    const i = colMap[key]
    return i != null ? String(row[i] ?? '').trim() : ''
  }
  for (let r = 1; r < data.length; r++) {
    const row = (data[r] ?? []) as string[]
    if (row.every((c) => !String(c ?? '').trim())) continue
    const op = get(row, 'operacao').toUpperCase().slice(0, 1)
    const pdmCode = get(row, 'pdm_code')
    const nome = get(row, 'nome')
    const ativoRaw = get(row, 'ativo')
    const errors: string[] = []
    const warnings: string[] = []
    if (!VALID_PDM_OPS.includes(op)) {
      errors.push("operacao deve ser 'C' (Criar) ou 'E' (Editar)")
    }
    if (op === 'E' && !pdmCode) errors.push('pdm_code é obrigatório para operacao E (Editar)')
    if (op === 'E' && pdmCode && !pdmCodesInDb.has(pdmCode)) {
      errors.push(`PDM '${pdmCode}' não encontrado. Para criar um novo PDM use operacao=C.`)
    }
    if (op === 'C' && !nome) errors.push('nome é obrigatório para operacao C (Criar)')
    if (ativoRaw && !['sim', 'não', 's', 'n', '1', '0', 'true', 'false', 'yes', 'no'].includes(ativoRaw.toLowerCase())) {
      warnings.push("ativo deve ser 'Sim' ou 'Não'")
    }
    if (op === 'C' && pdmCode) codesCreated.add(pdmCode)
    const status = errors.length ? 'error' : warnings.length ? 'warning' : 'ok'
    rows.push({
      row_number: r + 1,
      operacao: op || '?',
      pdm_code: pdmCode || null,
      nome: nome || null,
      status,
      errors,
      warnings,
      data: {
        operacao: op,
        pdm_code: pdmCode || null,
        nome: nome || null,
        ativo: ativoRaw || 'Sim',
      },
    })
  }
  return { rows, codesCreated }
}

function parseAttrSheet(
  ws: XLSX.WorkSheet,
  validPdmCodes: Set<string>,
  existingAttrKeys: Set<string>
): AttrRowResult[] {
  const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })
  const rows: AttrRowResult[] = []
  if (!data.length) return rows
  const headers = (data[0] ?? []).map((h) => String(h ?? '').trim().toLowerCase())
  const colMap: Record<string, number> = {}
  headers.forEach((h, i) => {
    if (h) colMap[h] = i
  })
  const get = (row: string[], key: string) => {
    const i = colMap[key]
    return i != null ? String(row[i] ?? '').trim() : ''
  }
  const getVal = (row: string[], key: string) => {
    const i = colMap[key]
    return i != null ? row[i] : undefined
  }
  for (let r = 1; r < data.length; r++) {
    const row = (data[r] ?? []) as string[]
    if (row.every((c) => !String(c ?? '').trim())) continue
    const op = get(row, 'operacao').toUpperCase().slice(0, 1)
    const pdmCode = get(row, 'pdm_code')
    const atributoKey = get(row, 'atributo_key')
    const tipoRaw = get(row, 'tipo').toLowerCase()
    const obrigRaw = get(row, 'obrigatorio')
    const ordemRaw = getVal(row, 'ordem')
    const opcoesRaw = get(row, 'opcoes')
    const errors: string[] = []
    const warnings: string[] = []
    if (!VALID_ATTR_OPS.includes(op)) {
      errors.push("operacao deve ser 'C', 'E' ou 'D'")
    }
    if (!pdmCode) errors.push('pdm_code é obrigatório')
    if (pdmCode && !validPdmCodes.has(pdmCode)) {
      errors.push(`PDM '${pdmCode}' não encontrado no banco nem sendo criado na aba PDM`)
    }
    if (['C', 'E'].includes(op) && !atributoKey) errors.push('atributo_key é obrigatório para operacao C e E')
    if (op === 'D' && !atributoKey) errors.push('operacao=D requer pdm_code e atributo_key')
    if (
      op === 'E' &&
      pdmCode &&
      atributoKey &&
      validPdmCodes.has(pdmCode) &&
      !existingAttrKeys.has(`${pdmCode}:${atributoKey}`)
    ) {
      errors.push(`Atributo '${atributoKey}' não encontrado no PDM '${pdmCode}'. Para criar use operacao=C.`)
    }
    if (tipoRaw && !VALID_TIPOS.includes(tipoRaw)) {
      warnings.push(`tipo deve ser um de: ${VALID_TIPOS.join(', ')}`)
    }
    if (obrigRaw && !VALID_OBRIGATORIO.includes(obrigRaw.toLowerCase())) {
      warnings.push("obrigatorio deve ser 'Sim' ou 'Não'")
    }
    if (ordemRaw != null && ordemRaw !== '' && safeInt(ordemRaw) === null) {
      warnings.push('ordem deve ser numérico')
    }
    const status = errors.length ? 'error' : warnings.length ? 'warning' : 'ok'
    const rowData: Record<string, unknown> = {
      operacao: op,
      pdm_code: pdmCode || null,
      atributo_key: atributoKey || null,
      label: get(row, 'label') || atributoKey,
      tipo: tipoRaw || 'text',
      obrigatorio: obrigRaw || 'Não',
      ordem: ordemRaw,
      opcoes: opcoesRaw || '',
    }
    rows.push({
      row_number: r + 1,
      operacao: op || '?',
      pdm_code: pdmCode || null,
      atributo_key: atributoKey || null,
      status,
      errors,
      warnings,
      data: rowData,
    })
  }
  return rows
}

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
  const fn = (file.name || '').toLowerCase()
  if (!fn.endsWith('.xlsx') && !fn.endsWith('.xls')) {
    return NextResponse.json({ error: 'Arquivo deve ser planilha Excel (.xlsx)' }, { status: 400 })
  }

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dry_run') !== 'false'

  let wb: XLSX.WorkBook
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  } catch {
    return NextResponse.json({ error: 'Arquivo Excel inválido ou corrompido' }, { status: 400 })
  }

  const wsPdm = getSheet(wb, 'PDM')
  if (!wsPdm) {
    return NextResponse.json({ _error: "Aba 'PDM' não encontrada no arquivo." }, { status: 400 })
  }

  const { data: existingPdms } = await supabaseAdmin
    .from('pdm_templates')
    .select('id, internal_code, attributes')
    .eq('tenant_id', tenantId)
  const pdmCodesInDb = new Set((existingPdms ?? []).map((p) => (p.internal_code as string) ?? '').filter(Boolean))

  const existingAttrKeys = new Set<string>()
  for (const p of existingPdms ?? []) {
    const attrs = (p.attributes as Array<{ id?: string; name?: string }>) ?? []
    const code = (p.internal_code as string) ?? ''
    for (const a of attrs) {
      const k = (a.id ?? a.name ?? '').toString().trim()
      if (k) existingAttrKeys.add(`${code}:${k}`)
    }
  }

  const pdmResult = parsePdmSheet(wsPdm, pdmCodesInDb)
  if ('_error' in pdmResult) {
    return NextResponse.json({ _error: (pdmResult as { _error: string })._error }, { status: 400 })
  }
  const validPdmCodes = new Set([...pdmCodesInDb, ...pdmResult.codesCreated])

  const wsAttr = getSheet(wb, 'Atributos')
  if (!wsAttr) {
    return NextResponse.json({ _error: "Aba 'Atributos' não encontrada no arquivo." }, { status: 400 })
  }
  const attrRows = parseAttrSheet(wsAttr, validPdmCodes, existingAttrKeys)

  const pdmErrorRows = pdmResult.rows.filter((r) => r.status === 'error').length
  const pdmValidRows = pdmResult.rows.filter((r) => r.status === 'ok').length
  const pdmWarningRows = pdmResult.rows.filter((r) => r.status === 'warning').length
  const attrErrorRows = attrRows.filter((r) => r.status === 'error').length
  const attrValidRows = attrRows.filter((r) => r.status === 'ok').length
  const attrWarningRows = attrRows.filter((r) => r.status === 'warning').length

  const result = {
    dry_run: true,
    pdm: {
      total_rows: pdmResult.rows.length,
      valid_rows: pdmValidRows,
      error_rows: pdmErrorRows,
      warning_rows: pdmWarningRows,
      rows: pdmResult.rows,
    },
    attributes: {
      total_rows: attrRows.length,
      valid_rows: attrValidRows,
      error_rows: attrErrorRows,
      warning_rows: attrWarningRows,
      rows: attrRows,
    },
  }

  if (dryRun) return NextResponse.json(result)

  if (pdmErrorRows > 0 || attrErrorRows > 0) {
    return NextResponse.json(
      {
        message: 'Existem erros críticos nas linhas. Corrija e tente novamente.',
        pdm: result.pdm,
        attributes: result.attributes,
      },
      { status: 422 }
    )
  }

  let pdmCreated = 0
  let pdmUpdated = 0
  let attrCreated = 0
  let attrUpdated = 0
  let attrDeleted = 0

  const pdmByCode: Record<string, { id: number; name: string; internal_code: string; attributes: unknown[] }> = {}
  for (const p of existingPdms ?? []) {
    const code = (p.internal_code as string) ?? ''
    if (code) pdmByCode[code] = { ...p, attributes: (p.attributes as unknown[]) ?? [] } as never
  }

  for (const row of pdmResult.rows) {
    if (row.status === 'error') continue
    const d = row.data
    const op = row.operacao
    const pdmCode = String(d.pdm_code ?? '').trim()
    const nome = String(d.nome ?? pdmCode).trim()
    const ativoStr = String(d.ativo ?? 'Sim').trim().toLowerCase()
    const isActive = ['sim', 's', '1', 'true', 'yes'].includes(ativoStr)

    if (op === 'C') {
      const { data: inserted, error } = await supabaseAdmin
        .from('pdm_templates')
        .insert({
          tenant_id: tenantId,
          name: nome || pdmCode,
          internal_code: pdmCode,
          is_active: isActive,
          attributes: [],
        })
        .select('id, internal_code, name, attributes')
        .single()
      if (!error && inserted) {
        pdmByCode[pdmCode] = {
          id: inserted.id,
          name: inserted.name ?? '',
          internal_code: pdmCode,
          attributes: (inserted.attributes as unknown[]) ?? [],
        }
        pdmCreated++
      }
    } else if (op === 'E') {
      const existing = pdmByCode[pdmCode]
      if (existing) {
        await supabaseAdmin
          .from('pdm_templates')
          .update({ name: nome || existing.name, is_active: isActive })
          .eq('id', existing.id)
        pdmUpdated++
      }
    }
  }

  const { data: afterPdms } = await supabaseAdmin
    .from('pdm_templates')
    .select('id, internal_code, name, attributes')
    .eq('tenant_id', tenantId)
  for (const p of afterPdms ?? []) {
    const code = (p.internal_code as string) ?? ''
    if (code) pdmByCode[code] = { ...p, attributes: (p.attributes as unknown[]) ?? [] } as never
  }

  const attrRowsByPdm: Record<string, typeof attrRows> = {}
  for (const row of attrRows) {
    if (row.status === 'error') continue
    const pc = (row.pdm_code ?? '').toString().trim()
    if (!attrRowsByPdm[pc]) attrRowsByPdm[pc] = []
    attrRowsByPdm[pc].push(row)
  }

  for (const [pdmCode, rows] of Object.entries(attrRowsByPdm)) {
    const pdm = pdmByCode[pdmCode]
    if (!pdm) continue
    const attrs: Array<Record<string, unknown>> = [...(pdm.attributes as Array<Record<string, unknown>>)]
    let attrsByKey: Record<string, number> = {}
    attrs.forEach((a, i) => {
      const k = String(a.id ?? a.name ?? '').trim()
      if (k) attrsByKey[k] = i
    })

    for (const row of rows) {
      const d = row.data ?? {}
      const op = row.operacao
      const key = String(d.atributo_key ?? '').trim()
      if (!key) continue

      if (op === 'D') {
        const idx = attrsByKey[key]
        if (idx != null) {
          attrs.splice(idx, 1)
          attrsByKey = {}
          attrs.forEach((a, i) => {
            const k = String(a.id ?? a.name ?? '').trim()
            if (k) attrsByKey[k] = i
          })
          attrDeleted++
        }
        continue
      }

      const label = String(d.label ?? key).trim()
      const tipo = mapTipo(String(d.tipo ?? 'text'))
      const obrig = ['sim', 's', '1', 'true'].includes(String(d.obrigatorio ?? 'Não').trim().toLowerCase())
      const ordem = safeInt(d.ordem) ?? 999
      const opcoes = parseOpcoes(String(d.opcoes ?? ''))

      const attrObj: Record<string, unknown> = {
        id: key,
        order: ordem,
        name: label,
        dataType: tipo,
        isRequired: obrig,
        includeInDescription: true,
        abbreviation: '',
        allowedValues: opcoes,
      }

      if (op === 'C') {
        attrs.push(attrObj)
        attrCreated++
      } else if (op === 'E') {
        const idx = attrsByKey[key]
        if (idx != null) {
          attrs[idx] = attrObj
          attrUpdated++
        } else {
          attrs.push(attrObj)
          attrCreated++
        }
      }
      attrsByKey[key] = attrs.length - 1
    }

    await supabaseAdmin.from('pdm_templates').update({ attributes: attrs }).eq('id', pdm.id)
  }

  return NextResponse.json({
    dry_run: false,
    pdm_created: pdmCreated,
    pdm_updated: pdmUpdated,
    attr_created: attrCreated,
    attr_updated: attrUpdated,
    attr_deleted: attrDeleted,
  })
}
