import type { SupabaseClient } from '@supabase/supabase-js'
import type { MyRequestRow } from '@/lib/my-requests'
import { isCancelledStatus, isRejectedStatus, requestStatusLabel } from '@/lib/request-status'

/**
 * Leitura de "Minhas Solicitações". Recebe o cliente do Supabase (do servidor, com o cookie do usuário,
 * ou do navegador): o RLS é o mesmo nos dois lados. O filtro por empresa e por autor é explícito.
 */

const PAGE_SIZE = 1000

function fail(error: { message?: string } | null | undefined): never {
  throw new Error(error?.message ?? 'Falha ao consultar o banco')
}

/** Todas as linhas, em páginas: o PostgREST devolve no máximo 1000 por consulta. A consulta precisa de ordem estável. */
async function allPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) fail(error)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return out
}

type RequestRow = {
  id: number
  status: string | null
  urgency: string | null
  generated_description: string | null
  created_at: string | null
  assigned_to_id: string | null
  workflow_id: number | null
  request_type: string | null
  target_material_id: number | null
  pdm_templates: { name?: string; internal_code?: string } | Array<{ name?: string; internal_code?: string }> | null
}

type StepRow = { workflow_id: number; status_key: string; step_name: string; order: number; is_active: boolean }

/** Solicitações abertas pelo usuário, com etapa, atendente e motivo da rejeição. Sem a situação do ERP (rota própria). */
export async function listMyRequests(db: SupabaseClient, params: { userId: string; tenantId: number }): Promise<MyRequestRow[]> {
  const rows = await allPages<RequestRow>((from, to) =>
    db
      .from('material_requests')
      .select('id, status, urgency, generated_description, created_at, assigned_to_id, workflow_id, request_type, target_material_id, pdm_templates(name, internal_code)')
      .eq('tenant_id', params.tenantId)
      .eq('user_id', params.userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
  )

  const assigneeIds = [...new Set(rows.map((r) => r.assigned_to_id).filter(Boolean))] as string[]
  const workflowIds = [...new Set(rows.map((r) => r.workflow_id).filter(Boolean))] as number[]
  const rejectedIds = rows.filter((r) => isRejectedStatus(r.status)).map((r) => r.id)

  // Três consultas independentes, em paralelo. Só sobe a consulta que tem o que buscar.
  const [usersRes, stepsRes, rejectionsRes] = await Promise.all([
    assigneeIds.length ? db.from('users').select('id, name').in('id', assigneeIds) : null,
    workflowIds.length
      ? db.from('workflow_config').select('workflow_id, status_key, step_name, "order", is_active').in('workflow_id', workflowIds)
      : null,
    rejectedIds.length
      ? db
          .from('request_history')
          .select('request_id, event_data, created_at')
          .in('request_id', rejectedIds)
          .eq('event_type', 'rejected')
          .order('created_at', { ascending: false })
      : null,
  ])
  for (const res of [usersRes, stepsRes, rejectionsRes]) if (res?.error) fail(res.error)

  const names = new Map(((usersRes?.data ?? []) as Array<{ id: string; name: string | null }>).map((u) => [u.id, u.name ?? '']))
  const stepRows = (stepsRes?.data ?? []) as StepRow[]
  const steps = new Map(stepRows.map((s) => [`${s.workflow_id}:${s.status_key.toLowerCase()}`, s.step_name]))
  // Primeira etapa ativa de cada workflow: enquanto a solicitação está nela sem atendente, o autor cancela.
  const firstStep = new Map<number, string>()
  for (const s of [...stepRows].filter((s) => s.is_active).sort((a, b) => a.order - b.order)) {
    if (!firstStep.has(s.workflow_id)) firstStep.set(s.workflow_id, s.status_key.toLowerCase())
  }
  const reasons = new Map<number, string>()
  for (const h of (rejectionsRes?.data ?? []) as Array<{ request_id: number; event_data: { justification?: string | null } | null }>) {
    if (!reasons.has(h.request_id)) reasons.set(h.request_id, h.event_data?.justification?.trim() ?? '')
  }

  return rows.map((r) => {
    const pdm = (Array.isArray(r.pdm_templates) ? r.pdm_templates[0] : r.pdm_templates) ?? null
    const status = String(r.status ?? '')
    return {
      id: r.id,
      code: `REQ-${String(r.id).padStart(4, '0')}`,
      pdm_name: pdm?.name ?? '—',
      pdm_code: pdm?.internal_code ?? '',
      description: r.generated_description ?? '',
      status,
      step_label: isRejectedStatus(status)
        ? 'Rejeitada'
        : isCancelledStatus(status)
          ? 'Cancelada'
          : steps.get(`${r.workflow_id}:${status.toLowerCase()}`) ?? requestStatusLabel(status),
      urgency: (r.urgency ?? 'low') as MyRequestRow['urgency'],
      created_at: r.created_at ?? null,
      assigned_to_name: r.assigned_to_id ? names.get(r.assigned_to_id) ?? null : null,
      rejection_reason: reasons.get(r.id) || null,
      can_cancel: !r.assigned_to_id && firstStep.get(r.workflow_id ?? -1) === status.toLowerCase(),
      request_type: (r.request_type ?? 'cadastro') as MyRequestRow['request_type'],
      target_material_id: r.target_material_id ?? null,
    }
  })
}
