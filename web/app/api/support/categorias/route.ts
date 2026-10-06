import { NextResponse } from 'next/server'
import { getCategorias } from '@/lib/axisdesk/client'
import { getSupportContext } from '@/lib/axisdesk/support-context'
import type { AxisDeskChamadoTipo } from '@/lib/axisdesk/types'

const TIPOS = new Set<AxisDeskChamadoTipo>(['incidente', 'melhoria'])

export async function GET(request: Request) {
  const ctx = await getSupportContext()
  if ('error' in ctx) return ctx.error
  const tipoParam = new URL(request.url).searchParams.get('tipo')
  if (tipoParam && !TIPOS.has(tipoParam as AxisDeskChamadoTipo)) {
    return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 })
  }
  const result = await getCategorias(tipoParam ? (tipoParam as AxisDeskChamadoTipo) : undefined)
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status })
  return NextResponse.json({ data: result.data })
}
