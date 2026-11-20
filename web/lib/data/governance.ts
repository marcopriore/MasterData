import type { SupabaseClient } from '@supabase/supabase-js'
import { isDoneStatus, statusGroup } from '@/lib/request-status'
import type { DefaultEntry } from '@/lib/field-defaults'
import type { ApiRequest, RequestType, WorkflowHeader, WorkflowStep } from '@/lib/supabase-api'

/**
 * Leituras da Governança. Recebem o cliente do Supabase (o do navegador ou o do servidor, com o
 * cookie do usuário): o RLS é o mesmo nos dois lados e não há estado de módulo.
 */

const PAGE_SIZE = 1000
/** Lotes de ids por consulta: a URL do PostgREST tem limite de tamanho. */
const ID_BATCH = 200

export type ActivePdm = { id: number; name: string; internal_code: string; is_active: boolean }

type PdmAttrDef = ApiRequest['pdm_attributes'] extends Record<string, infer T> | undefined ? T : never
type RawPdmAttr = {
  id?: string
  name?: string
  dataType?: string
  includeInDescription?: boolean
  abbreviation?: string
  allowedValues?: Array<{ value: string; abbreviation?: string }>
}

function fail(error: { message?: string } | null | undefined): never {
  throw new Error(error?.message ?? 'Falha ao consultar o banco')
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null
}

export async function listWorkflows(db: SupabaseClient): Promise<WorkflowHeader[]> {
  const { data, error } = await db.from('workflow_header').select('id, name, description, is_active, request_type').order('id')
  if (error) fail(error)
  return (data ?? []) as WorkflowHeader[]
}

/** PDMs ativos do tenant, sem atributos nem contagem de materiais (só o filtro da tela usa). */
export async function listActivePdms(db: SupabaseClient, tenantId: number): Promise<ActivePdm[]> {
  const { data, error } = await db
    .from('pdm_templates')
    .select('id, name, internal_code, is_active')
    .eq('tenant_id', tenantId)
    .order('name')
  if (error) fail(error)
  return (data ?? [])
    .filter((p) => p.is_active ?? true)
    .map((p) => ({ id: p.id, name: p.name, internal_code: p.internal_code, is_active: p.is_active ?? true }))
}

export async function listWorkflowSteps(db: SupabaseClient, workflowId: number): Promise<WorkflowStep[]> {
  const { data, error } = await db.from('workflow_config').select('*').eq('workflow_id', workflowId).order('order')
  if (error) fail(error)
  return (data ?? []) as WorkflowStep[]
}

/** Workflow ativo do tipo; sem ativo, o primeiro do tipo. `anyType`: sem nenhum do tipo, qualquer um. */
export function pickWorkflowId(workflows: WorkflowHeader[], type: RequestType, anyType = false): number | null {
  const ofType = workflows.filter((w) => (w.request_type ?? 'cadastro') === type)
  const chosen = ofType.find((w) => w.is_active) ?? ofType[0]
    ?? (anyType ? workflows.find((w) => w.is_active) ?? workflows[0] : undefined)
  return chosen?.id ?? null
}

/** Solicitações finalizadas: as que têm material e situação no ERP. */
export function finalizedRequestIds(requests: ApiRequest[]): number[] {
  return requests.filter((r) => isDoneStatus(r.status)).map((r) => r.id)
}

/** Concluídas, para o tempo médio de ciclo. */
export function doneRequestIds(requests: ApiRequest[]): number[] {
  return requests.filter((r) => statusGroup(r.status) === 'done').map((r) => r.id)
}

function toPdmAttrMap(attributes: unknown): Record<string, PdmAttrDef> {
  const map: Record<string, PdmAttrDef> = {}
  for (const a of (attributes ?? []) as RawPdmAttr[]) {
    const key = a.id ?? ''
    if (!key) continue
    map[key] = {
      label: a.name ?? key,
      type: a.dataType === 'lov' ? 'select' : (a.dataType ?? 'text'),
      options: (a.allowedValues ?? []).map((v) => (typeof v === 'object' ? v.value : String(v)) ?? ''),
      includeInDescription: a.includeInDescription,
      abbreviation: a.abbreviation,
      allowedValues: a.allowedValues ?? [],
    } as PdmAttrDef
  }
  return map
}

export type RequestListParams = {
  workflowId?: number
  status?: string
  limit?: number
  /** Abertas sempre; fechadas só as que fecharam nos últimos N dias (is_closed, migration 037). */
  closedSinceDays?: number | null
}

/**
 * Solicitações com o nome do responsável (na mesma consulta) e os atributos de cada PDM
 * (uma consulta só para os PDMs da lista, em vez de repetir o JSON em cada linha).
 */
export async function listRequests(db: SupabaseClient, params: RequestListParams = {}): Promise<ApiRequest[]> {
  const closedSince = params.closedSinceDays
    ? new Date(Date.now() - params.closedSinceDays * 24 * 3600 * 1000).toISOString()
    : null
  const query = () => {
    let q = db
      .from('material_requests')
      .select('*, pdm_templates(id, name), assignee:users!assigned_to_id(name)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    if (params.workflowId) q = q.eq('workflow_id', params.workflowId)
    if (params.status) q = q.eq('status', params.status)
    if (closedSince) q = q.or(`is_closed.eq.false,stage_entered_at.gte.${closedSince}`)
    return q
  }

  const rows: Record<string, unknown>[] = []
  if (params.limit) {
    const { data, error } = await query().limit(params.limit)
    if (error) fail(error)
    rows.push(...(data ?? []))
  } else {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await query().range(from, from + PAGE_SIZE - 1)
      if (error) fail(error)
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE_SIZE) break
    }
  }

  const pdmIds = [...new Set(rows.map((r) => one(r.pdm_templates as { id: number } | null)?.id).filter(Boolean))] as number[]
  const pdmAttrMap: Record<number, Record<string, PdmAttrDef>> = {}
  if (pdmIds.length) {
    const { data } = await db.from('pdm_templates').select('id, attributes').in('id', pdmIds)
    for (const p of data ?? []) pdmAttrMap[p.id as number] = toPdmAttrMap(p.attributes)
  }

  return rows.map((r) => {
    const pdm = one(r.pdm_templates as { id: number; name: string } | null)
    const assignee = one(r.assignee as { name: string | null } | null)
    return {
      id: r.id as number,
      user_id: (r.user_id as string | null) ?? null,
      pdm_id: r.pdm_id as number,
      pdm_name: pdm?.name,
      status: r.status as string,
      workflow_id: r.workflow_id as number,
      requester: r.requester as string,
      cost_center: r.cost_center as string | null,
      urgency: r.urgency as string,
      justification: r.justification as string | null,
      generated_description: r.generated_description as string | null,
      technical_attributes: r.technical_attributes as Record<string, unknown>,
      attachments: r.attachments as unknown[],
      date: r.created_at as string,
      values: [],
      assigned_to_id: r.assigned_to_id as string | null,
      assigned_to_name: r.assigned_to_id && assignee ? (assignee.name ?? '') : null,
      pdm_attributes: (pdm?.id ? pdmAttrMap[pdm.id] : {}) ?? {},
      stage_entered_at: (r.stage_entered_at as string | null) ?? null,
      request_type: ((r.request_type as RequestType | null) ?? 'cadastro'),
      target_material_id: (r.target_material_id as number | null) ?? null,
      change_fields: (r.change_fields ?? []) as string[],
      change_previous: (r.change_previous ?? {}) as Record<string, unknown>,
      center_id: (r.center_id as number | null) ?? null,
      skipped_stages: (r.skipped_stages ?? []) as string[],
      default_fields: (r.default_fields ?? {}) as Record<string, DefaultEntry>,
    }
  })
}

/** Quando cada solicitação foi finalizada: último "approved" que levou à etapa final. Lotes em paralelo. */
export async function requestsFinishedAt(db: SupabaseClient, requestIds: number[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const batches: number[][] = []
  for (let i = 0; i < requestIds.length; i += ID_BATCH) batches.push(requestIds.slice(i, i + ID_BATCH))
  const results = await Promise.all(batches.map((ids) => db
    .from('request_history')
    .select('request_id, created_at')
    .in('request_id', ids)
    .eq('event_type', 'approved')
    .in('stage', ['finalizado', 'completed'])))
  for (const { data, error } of results) {
    if (error) fail(error)
    for (const row of data ?? []) {
      const key = String(row.request_id)
      if (!out[key] || row.created_at > out[key]) out[key] = row.created_at as string
    }
  }
  return out
}
