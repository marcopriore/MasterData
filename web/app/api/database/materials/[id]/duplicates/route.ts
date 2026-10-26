import { NextResponse } from 'next/server'
import { findDuplicateBlock } from '@/lib/erp/duplicate-guard'
import { getCallerAccess } from '@/lib/server-access'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/** Mesma regra da trava do ERP, para a tela mostrar por que o material não integra. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCallerAccess()
  if ('error' in ctx) return ctx.error
  if (!ctx.isMaster && !ctx.permissions.can_view_database) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  const id = Number((await params).id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Material inválido' }, { status: 400 })

  const { data: material } = await supabaseAdmin
    .from('material_database')
    .select('id, id_sistema, description, detailed_description, pdm_code, status, technical_attributes, request_id')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  if (!material) return NextResponse.json({ error: 'Material não encontrado' }, { status: 404 })

  const block = await findDuplicateBlock(ctx.tenantId, material)
  return NextResponse.json({ duplicate: block != null, codes: block?.codes ?? [], reason: block?.reason ?? null })
}
