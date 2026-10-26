import { NextResponse } from 'next/server'
import { findDuplicateBlock } from '@/lib/erp/duplicate-guard'
import { getCallerAccess } from '@/lib/server-access'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { RequestErpInfo } from '@/lib/request-erp-state'

export const runtime = 'nodejs'

const MAX_IDS = 200
const NEEDS_CHECK = ['pendente_erp', 'erro_erp']

/** Situação no ERP do material de cada solicitação informada, com a mesma trava de duplicidade da base. */
export async function GET(request: Request) {
  const ctx = await getCallerAccess()
  if ('error' in ctx) return ctx.error

  const raw = new URL(request.url).searchParams.get('ids') ?? ''
  const ids = [...new Set(raw.split(',').map(Number).filter(Number.isInteger))].slice(0, MAX_IDS)
  if (ids.length === 0) return NextResponse.json({ items: [] })

  const { data, error } = await supabaseAdmin
    .from('material_database')
    .select('id, id_sistema, id_erp, status, erp_status, erp_error_message, description, detailed_description, pdm_code, technical_attributes, request_id')
    .eq('tenant_id', ctx.tenantId)
    .in('request_id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byRequest = new Map((data ?? []).map((row) => [row.request_id as number, row]))
  const items: RequestErpInfo[] = []
  for (const requestId of ids) {
    const row = byRequest.get(requestId)
    if (!row) {
      items.push({ request_id: requestId, material: null, duplicate_codes: [] })
      continue
    }
    const check = row.status !== 'Obsoleto' && NEEDS_CHECK.includes(row.erp_status ?? '')
    const block = check ? await findDuplicateBlock(ctx.tenantId, row) : null
    items.push({
      request_id: requestId,
      material: {
        id: row.id,
        id_sistema: row.id_sistema ?? null,
        id_erp: row.id_erp ?? null,
        status: row.status ?? null,
        erp_status: row.erp_status ?? null,
        erp_error_message: row.erp_error_message ?? null,
      },
      duplicate_codes: block?.codes ?? [],
    })
  }
  return NextResponse.json({ items })
}
