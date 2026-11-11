import { describe, expect, it } from 'vitest'
import { buildTimeline, originAttendants } from './material-timeline'

const labelOf = (name: string) => ({ tipo_mrp: 'Tipo MRP' } as Record<string, string>)[name]

describe('histórico do material', () => {
  it('monta os momentos do mais recente para o mais antigo e pula o "integrando"', () => {
    const items = buildTimeline(
      [
        { id: 1, event_type: 'created', event_data: { request_id: 30 }, user_name: null, created_at: '2026-10-01T10:00:00Z' },
        { id: 2, event_type: 'erp', event_data: { from: 'pendente_erp', to: 'integrando' }, user_name: 'Ana', created_at: '2026-10-02T10:00:00Z' },
        { id: 3, event_type: 'erp', event_data: { from: 'integrando', to: 'integrado_erp', id_erp: 'MAT-000002' }, user_name: 'Ana', created_at: '2026-10-02T10:00:01Z' },
        { id: 4, event_type: 'status', event_data: { from: 'Ativo', to: 'Bloqueado' }, user_name: 'Bia', created_at: '2026-10-03T10:00:00Z' },
        { id: 5, event_type: 'edited', event_data: { fields: ['tipo_mrp', 'description'] }, user_name: 'Bia', created_at: '2026-10-04T10:00:00Z' },
      ],
      [{ id: 9, event_type: 'created', message: 'Solicitação criada', user_name: 'Carlos', created_at: '2026-09-30T10:00:00Z' }],
      { requestId: 30, labelOf }
    )
    expect(items.map((i) => i.title)).toEqual([
      'Cadastro alterado',
      'Status: Ativo → Bloqueado',
      'Integrado ao ERP (código MAT-000002)',
      'Material criado a partir da solicitação REQ-0030',
      'Solicitação: Solicitação criada',
    ])
    expect(items[0].detail).toBe('Tipo MRP, Descrição')
    expect(items.find((i) => i.title.startsWith('Integrado'))?.tone).toBe('ok')
  })

  it('falha no ERP mostra a mensagem; material sem solicitação diz a origem', () => {
    const items = buildTimeline(
      [
        { id: 1, event_type: 'created', event_data: { source: 'api' }, user_name: null, created_at: '2026-10-01T10:00:00Z' },
        { id: 2, event_type: 'erp', event_data: { to: 'erro_erp', message: 'Timeout', simulated: true }, user_name: null, created_at: '2026-10-02T10:00:00Z' },
      ],
      [],
      { labelOf }
    )
    expect(items[0]).toMatchObject({ title: 'Falha na integração com o ERP', detail: 'Timeout · Simulação', tone: 'alert' })
    expect(items[1].title).toBe('Material criado pela API de integração')
  })

  it('centro inicial, ampliação e alteração por solicitação', () => {
    const items = buildTimeline(
      [
        { id: 1, event_type: 'center', event_data: { code: '1001', name: 'SAO PAULO', origin: true }, user_name: 'Ana', created_at: '2026-10-01T10:00:00Z' },
        { id: 2, event_type: 'center', event_data: { code: '1002', name: 'MANAUS', request_id: 41 }, user_name: 'Bia', created_at: '2026-10-02T10:00:00Z' },
        { id: 3, event_type: 'edited', event_data: { fields: ['tipo_mrp'], request_id: 42 }, user_name: 'Bia', created_at: '2026-10-03T10:00:00Z' },
      ],
      [],
      { labelOf }
    )
    expect(items.map((i) => i.title)).toEqual([
      'Cadastro alterado pela solicitação REQ-0042',
      'Ampliado para o centro 1002 · MANAUS pela solicitação REQ-0041',
      'Centro inicial: 1001 · SAO PAULO',
    ])
  })

  it('atendentes: o último atendimento de cada etapa, na ordem', () => {
    expect(originAttendants([
      { id: 1, event_type: 'assigned', stage: 'cadastro', user_name: 'Ana', created_at: '2026-10-01T10:00:00Z', message: '' },
      { id: 2, event_type: 'approved', stage: 'compras', user_name: 'Ana', created_at: '2026-10-01T11:00:00Z', message: '' },
      { id: 3, event_type: 'assigned', stage: 'compras', user_name: 'Bia', created_at: '2026-10-02T10:00:00Z', message: '' },
      { id: 4, event_type: 'assigned', stage: 'cadastro', user_name: 'Caio', created_at: '2026-10-03T10:00:00Z', message: '' },
    ])).toEqual([
      { stage: 'compras', name: 'Bia', at: '2026-10-02T10:00:00Z' },
      { stage: 'cadastro', name: 'Caio', at: '2026-10-03T10:00:00Z' },
    ])
  })
})
