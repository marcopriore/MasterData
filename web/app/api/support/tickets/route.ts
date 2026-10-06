import { NextResponse } from 'next/server'
import { createTicket, listTickets } from '@/lib/axisdesk/client'
import { getSupportContext } from '@/lib/axisdesk/support-context'
import { AXISDESK_MAX_TEXTO, AXISDESK_MAX_TITULO, parseAnexos } from '@/lib/axisdesk/support-form'
import type { AxisDeskChamadoPrioridade, AxisDeskChamadoTipo } from '@/lib/axisdesk/types'

const TIPOS = new Set<AxisDeskChamadoTipo>(['incidente', 'melhoria'])
const PRIORIDADES = new Set<AxisDeskChamadoPrioridade>(['baixa', 'media', 'alta', 'critica'])

export async function GET() {
  const ctx = await getSupportContext()
  if ('error' in ctx) return ctx.error
  const result = await listTickets(ctx.tenantIdExterno)
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status })
  return NextResponse.json({ data: result.data })
}

export async function POST(request: Request) {
  const ctx = await getSupportContext()
  if ('error' in ctx) return ctx.error

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })

  const tipo = body.tipo
  const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : ''
  const descricao = typeof body.descricao === 'string' ? body.descricao.trim() : ''
  const categoriaId = typeof body.categoria_id === 'string' ? body.categoria_id.trim() : ''
  const subcategoriaId = typeof body.subcategoria_id === 'string' ? body.subcategoria_id.trim() : ''
  const prioridade = body.prioridade

  if (!TIPOS.has(tipo as AxisDeskChamadoTipo)) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 })
  if (!titulo) return NextResponse.json({ error: 'Título é obrigatório.' }, { status: 400 })
  if (titulo.length > AXISDESK_MAX_TITULO) {
    return NextResponse.json({ error: `Título deve ter no máximo ${AXISDESK_MAX_TITULO} caracteres.` }, { status: 400 })
  }
  if (!descricao) return NextResponse.json({ error: 'Descrição é obrigatória.' }, { status: 400 })
  if (descricao.length > AXISDESK_MAX_TEXTO) {
    return NextResponse.json({ error: `Descrição deve ter no máximo ${AXISDESK_MAX_TEXTO} caracteres.` }, { status: 400 })
  }
  if (!categoriaId) return NextResponse.json({ error: 'Categoria é obrigatória.' }, { status: 400 })
  if (!subcategoriaId) return NextResponse.json({ error: 'Subcategoria é obrigatória.' }, { status: 400 })
  if (prioridade != null && prioridade !== '' && !PRIORIDADES.has(prioridade as AxisDeskChamadoPrioridade)) {
    return NextResponse.json({ error: 'Prioridade inválida.' }, { status: 400 })
  }

  const anexos = parseAnexos(body.anexos)
  if ('error' in anexos) return NextResponse.json({ error: anexos.error }, { status: 400 })

  const result = await createTicket({
    tenant_id_externo: ctx.tenantIdExterno,
    nome_empresa: ctx.nomeEmpresa,
    solicitante: {
      id_externo: ctx.solicitante.idExterno,
      nome: ctx.solicitante.nome,
      email: ctx.solicitante.email,
    },
    tipo: tipo as AxisDeskChamadoTipo,
    titulo,
    descricao,
    categoria_id: categoriaId,
    subcategoria_id: subcategoriaId,
    contexto_origem: 'PRO-MAT',
    ...(prioridade ? { prioridade: prioridade as AxisDeskChamadoPrioridade } : {}),
    ...(anexos.length > 0 ? { anexos } : {}),
  })

  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status })
  return NextResponse.json({ data: result.data }, { status: 201 })
}
