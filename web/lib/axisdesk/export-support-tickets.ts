import type { AxisDeskChamado } from '@/lib/axisdesk/types'
import { AXISDESK_TIPO_OPTIONS, getAxisDeskPrioridadeLabel, getAxisDeskStatusLabel } from '@/lib/axisdesk/types'

function formatWhen(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR')
}

/** Planilha dos chamados filtrados, gerada no navegador. */
export async function exportSupportTicketsExcel(tickets: AxisDeskChamado[]): Promise<void> {
  const XLSX = await import('xlsx')
  const rows = tickets.map((ticket) => ({
    Título: ticket.titulo,
    Tipo: AXISDESK_TIPO_OPTIONS.find((o) => o.value === ticket.tipo)?.label ?? ticket.tipo,
    Status: getAxisDeskStatusLabel(ticket.status),
    Prioridade: getAxisDeskPrioridadeLabel(ticket.prioridade),
    Categoria: ticket.categoria?.nome ?? '—',
    Subcategoria: ticket.subcategoria?.nome ?? '—',
    Solicitante: ticket.solicitante?.nome ?? '—',
    SLA: formatWhen(ticket.sla_prazo),
    'Criado em': formatWhen(ticket.created_at),
  }))
  const sheet = XLSX.utils.json_to_sheet(rows)
  sheet['!cols'] = [{ wch: 40 }, { wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 26 }, { wch: 26 }, { wch: 26 }, { wch: 20 }, { wch: 20 }]
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Chamados')
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  XLSX.writeFile(book, `chamados_suporte_${stamp}.xlsx`)
}
