import { NextResponse } from 'next/server'
import { executeAction } from '@/lib/axisdesk/client'
import { getSupportContext } from '@/lib/axisdesk/support-context'
import { AXISDESK_MAX_TEXTO, parseAnexos } from '@/lib/axisdesk/support-form'
import type { AxisDeskChamadoAcao } from '@/lib/axisdesk/types'

const ACOES = new Set<AxisDeskChamadoAcao>([
  'usuario_respondeu',
  'usuario_aprovou',
  'usuario_reprovou',
  'usuario_cancelou',
  'usuario_reenviou',
])

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!id) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 })
  const ctx = await getSupportContext()
  if ('error' in ctx) return ctx.error

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const acao = body?.acao
  const mensagem = typeof body?.mensagem === 'string' ? body.mensagem.trim() : undefined
  if (!ACOES.has(acao as AxisDeskChamadoAcao)) {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  }
  if (acao === 'usuario_reprovou' && !mensagem) {
    return NextResponse.json({ error: 'Motivo é obrigatório para reprovar.' }, { status: 400 })
  }
  if (mensagem && mensagem.length > AXISDESK_MAX_TEXTO) {
    return NextResponse.json({ error: `Mensagem deve ter no máximo ${AXISDESK_MAX_TEXTO} caracteres.` }, { status: 400 })
  }

  const anexos = parseAnexos(body?.anexos)
  if ('error' in anexos) return NextResponse.json({ error: anexos.error }, { status: 400 })

  const result = await executeAction(id, acao as AxisDeskChamadoAcao, mensagem, anexos)
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status })
  return NextResponse.json({ data: result.data })
}
