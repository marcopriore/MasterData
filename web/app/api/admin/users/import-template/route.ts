import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

const HEADERS = ['operacao', 'nome', 'email', 'senha', 'tenant_slug', 'perfil']

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ['C', 'João Silva', 'joao@empresa.com', 'Senha123!', 'meu-tenant', 'SOLICITANTE']])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Usuários')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=template_importacao_usuarios.xlsx',
    },
  })
}
