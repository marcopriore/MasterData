import { createServerSupabaseClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

type RowResult = {
  row_number: number
  operacao: string
  email: string | null
  nome: string | null
  perfil: string | null
  ativo: string | null
  status: 'ok' | 'warning' | 'error'
  errors: string[]
  warnings: string[]
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('tenant_id, roles(name)').eq('id', user.id).single()
  const roleName = (profile?.roles as { name?: string })?.name?.toUpperCase() ?? ''
  const isMaster = (user.app_metadata?.is_master as boolean) ?? false
  const canManage = roleName === 'ADMIN' || roleName === 'MASTER' || isMaster
  if (!canManage) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const effectiveTenantId = isMaster
    ? ((user.app_metadata?.tenant_id as number) ?? profile?.tenant_id)
    : profile?.tenant_id
  if (!effectiveTenantId) return NextResponse.json({ error: 'Perfil sem tenant' }, { status: 400 })

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dry_run') !== 'false'

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

  let wb: XLSX.WorkBook
  try {
    const buf = Buffer.from(await file.arrayBuffer())
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
  } catch {
    return NextResponse.json({ error: 'Arquivo Excel inválido ou corrompido' }, { status: 400 })
  }

  const sheetName = wb.SheetNames.find((s) => s === 'Usuários') ?? wb.SheetNames[0]
  if (!sheetName) return NextResponse.json({ error: 'Planilha não encontrada' }, { status: 400 })

  const ws = wb.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })

  if (!data.length) {
    return NextResponse.json({
      dry_run: true,
      users: { total_rows: 0, valid_rows: 0, error_rows: 0, warning_rows: 0, rows: [] },
    })
  }

  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const rawHeaders = (data[0] ?? []).map((h) => normalize(String(h ?? '').trim()))
  const colMap: Record<string, number> = {}
  const canonicalKeys: Record<string, string[]> = {
    operacao: ['operacao'],
    email: ['email', 'e-mail'],
    nome: ['nome', 'name'],
    perfil: ['perfil', 'role', 'profile'],
    ativo: ['ativo', 'active'],
  }
  rawHeaders.forEach((h, i) => {
    if (h) {
      colMap[h] = i
      for (const [canon, aliases] of Object.entries(canonicalKeys)) {
        if (aliases.includes(h) || h === canon) colMap[canon] = i
      }
    }
  })

  const get = (row: string[], key: string) => {
    const i = colMap[key] ?? colMap[normalize(key)]
    return i != null ? String(row[i] ?? '').trim() : ''
  }

  const { data: roles } = await supabaseAdmin
    .from('roles')
    .select('id, name')
    .eq('tenant_id', effectiveTenantId)
  const roleMap: Record<string, number> = {}
  for (const r of roles ?? []) {
    roleMap[(r.name ?? '').toUpperCase()] = r.id
  }

  const { data: tenantUsers } = await supabaseAdmin
    .from('users')
    .select('id, name, role_id, is_active')
    .eq('tenant_id', effectiveTenantId)

  const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  const idToEmail: Record<string, string> = {}
  for (const au of authData?.users ?? []) {
    if (au.email) idToEmail[au.id] = au.email
  }
  const emailToUserId: Record<string, string> = {}
  for (const u of tenantUsers ?? []) {
    const email = idToEmail[u.id]
    if (email) emailToUserId[email.toLowerCase()] = u.id
  }

  const rows: RowResult[] = []
  let created = 0
  let updated = 0

  for (let r = 1; r < data.length; r++) {
    const row = (data[r] ?? []) as string[]
    const rowNumber = r + 2
    const operacao = get(row, 'operacao').toUpperCase().trim().slice(0, 1)
    const emailRaw = get(row, 'email')
    const email = emailRaw ? emailRaw.toLowerCase() : ''
    const nome = get(row, 'nome')
    const perfil = get(row, 'perfil')
    const ativoRaw = get(row, 'ativo')

    const errors: string[] = []
    const warnings: string[] = []

    if (operacao !== 'C' && operacao !== 'E') errors.push('operacao deve ser C ou E')
    if (!email) errors.push('email obrigatório')
    else if (!email.includes('@')) errors.push('email inválido')
    if (!nome) errors.push('nome obrigatório')
    if (!perfil) errors.push('perfil obrigatório')
    else if (!roleMap[perfil.toUpperCase()]) errors.push(`perfil '${perfil}' não encontrado`)
    if (ativoRaw && !['Sim', 'Não'].includes(ativoRaw)) warnings.push("ativo deve ser 'Sim' ou 'Não'; será ignorado")

    if (operacao === 'C' && email && emailToUserId[email]) errors.push('e-mail já existe')
    if (operacao === 'E' && email && !emailToUserId[email]) errors.push('e-mail não encontrado')

    const status: 'ok' | 'warning' | 'error' = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok'
    const roleId = roleMap[perfil?.toUpperCase() ?? '']
    const isActive = ativoRaw === 'Sim'

    if (status !== 'error' && !dryRun) {
      try {
        if (operacao === 'C') {
          const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: 'Mudar@1234',
            email_confirm: true,
            app_metadata: { tenant_id: effectiveTenantId },
          })
          if (authError) {
            errors.push(authError.message)
          } else if (authUser.user) {
            const { error: profileError } = await supabaseAdmin
              .from('users')
              .insert({
                id: authUser.user.id,
                tenant_id: effectiveTenantId,
                name: nome,
                role_id: roleId,
              })
            if (profileError) {
              await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
              errors.push(profileError.message)
            } else {
              created++
              emailToUserId[email] = authUser.user.id
            }
          }
        } else if (operacao === 'E') {
          const userId = emailToUserId[email]
          const updatePayload: { name: string; role_id: number; is_active?: boolean } = {
            name: nome,
            role_id: roleId,
          }
          if (['Sim', 'Não'].includes(ativoRaw)) updatePayload.is_active = isActive
          const { error: updateError } = await supabaseAdmin
            .from('users')
            .update(updatePayload)
            .eq('id', userId)
          if (updateError) errors.push(updateError.message)
          else updated++
        }
      } catch (err) {
        errors.push((err as Error).message)
      }
    }

    const finalStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok'
    rows.push({
      row_number: rowNumber,
      operacao,
      email: email || null,
      nome: nome || null,
      perfil: perfil || null,
      ativo: ativoRaw || null,
      status: finalStatus,
      errors,
      warnings,
    })
  }

  if (dryRun) {
    const validRows = rows.filter((x) => x.status === 'ok').length
    const errorRows = rows.filter((x) => x.status === 'error').length
    const warningRows = rows.filter((x) => x.status === 'warning').length
    return NextResponse.json({
      dry_run: true,
      users: {
        total_rows: rows.length,
        valid_rows: validRows,
        error_rows: errorRows,
        warning_rows: warningRows,
        rows,
      },
    })
  }

  return NextResponse.json({
    dry_run: false,
    created,
    updated,
  })
}
