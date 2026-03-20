/**
 * Supabase API — substitui FastAPI para MDM PRO-MAT.
 * Usa createClient() do browser. RLS filtra por tenant automaticamente.
 */

import { createClient } from '@/lib/supabase/client'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function handleError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err)
  throw new Error(msg)
}

async function getCurrentUserTenantId(): Promise<number> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) handleError(new Error('Não autenticado'))
  const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) handleError(new Error('Perfil sem tenant'))
  return profile.tenant_id
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export type DashboardStats = {
  total_requests: number
  by_status: { name: string; value: number }[]
  by_urgency: { name: string; value: number }[]
  recent_activities: {
    id: number
    requester: string
    cost_center: string | null
    urgency: string
    status: string
    generated_description: string | null
    pdm_id: number
    created_at: string | null
  }[]
  pdm_count?: number
  user_count?: number
  section_title?: string
  show_user_count?: boolean
  user_name?: string | null
}

const STATUS_LABELS: Record<string, string> = {
  cadastro: 'Central de Cadastro',
  compras: 'Compras',
  mrp: 'MRP',
  fiscal: 'Fiscal',
  contabilidade: 'Contabilidade',
  finalizado: 'Finalizado',
  rejected: 'Rejeitado',
  pending: 'Pendente',
}

const URGENCY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { total_requests: 0, by_status: [], by_urgency: [], recent_activities: [], pdm_count: 0, user_count: 0 }

  const { data: profile } = await supabase.from('users').select('tenant_id, name, roles(name, role_type)').eq('id', user.id).single()
  const tenantId = profile?.tenant_id
  const roleName = (profile?.roles as { name?: string })?.name?.toUpperCase() ?? ''
  const roleType = (profile?.roles as { role_type?: string })?.role_type ?? 'sistema'
  const isMaster = (user.app_metadata?.is_master as boolean) ?? false

  let reqQuery = supabase.from('material_requests').select('id, requester, cost_center, urgency, status, generated_description, pdm_id, created_at, user_id')
  if (tenantId) reqQuery = reqQuery.eq('tenant_id', tenantId)

  const { data: requests, error: reqErr } = await reqQuery
  if (reqErr) handleError(reqErr)

  const { count: pdmCount } = await supabase.from('pdm_templates').select('*', { count: 'exact', head: true })
  const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true)

  let filtered = requests ?? []
  if (!isMaster && roleName !== 'ADMIN') {
    if (roleName === 'SOLICITANTE' && user.id) {
      filtered = filtered.filter((r) => r.user_id === user.id)
    } else if (['etapa', 'operacional'].includes(roleType) && roleName) {
      filtered = filtered.filter((r) => (r.status ?? '').toLowerCase() === roleName.toLowerCase())
    }
  }

  const byStatus: Record<string, number> = {}
  filtered.forEach((r) => {
    const label = STATUS_LABELS[(r.status ?? '').toLowerCase()] ?? (r.status ?? 'Outro')
    byStatus[label] = (byStatus[label] ?? 0) + 1
  })

  const byUrgency: Record<string, number> = {}
  filtered.forEach((r) => {
    const label = URGENCY_LABELS[r.urgency ?? ''] ?? (r.urgency ?? '')
    byUrgency[label] = (byUrgency[label] ?? 0) + 1
  })

  const recent = [...filtered]
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      requester: r.requester ?? '',
      cost_center: r.cost_center ?? null,
      urgency: r.urgency ?? 'low',
      status: r.status ?? '',
      generated_description: r.generated_description ?? null,
      pdm_id: r.pdm_id ?? 0,
      created_at: r.created_at ?? null,
    }))

  return {
    total_requests: filtered.length,
    by_status: Object.entries(byStatus).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    by_urgency: Object.entries(byUrgency).map(([name, value]) => ({ name, value })),
    recent_activities: recent,
    pdm_count: pdmCount ?? 0,
    user_count: userCount ?? 0,
    section_title: isMaster || roleName === 'ADMIN' ? 'Atividade Recente' : roleName === 'SOLICITANTE' ? 'Minhas Solicitações' : 'Minha Fila',
    show_user_count: isMaster || roleName === 'ADMIN',
    user_name: profile?.name ?? null,
  }
}

// ─── Governance Stats ────────────────────────────────────────────────────────

export type GovernanceStats = {
  total: number
  em_andamento: number
  atrasadas: number
  taxa_rejeicao: number
  tempo_medio_ciclo: number
  sla_por_etapa: Record<string, number>
}

export async function getGovernanceStats(): Promise<GovernanceStats> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_governance_stats')
  if (error) handleError(error)
  return data as GovernanceStats
}

// ─── PDM ─────────────────────────────────────────────────────────────────────

export type PDMTemplate = {
  id: number
  name: string
  internal_code: string
  is_active?: boolean
  attributes?: unknown[]
  materials_count?: number
}

export async function getPdms(): Promise<PDMTemplate[]> {
  const supabase = createClient()
  const { data: pdms, error } = await supabase.from('pdm_templates').select('*').order('name')
  if (error) handleError(error)

  const { data: counts } = await supabase.from('material_database').select('pdm_code')
  const countMap: Record<string, number> = {}
  ;(counts ?? []).forEach((c) => {
    const code = c.pdm_code as string
    if (code) countMap[code] = (countMap[code] ?? 0) + 1
  })

  return (pdms ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    internal_code: p.internal_code,
    is_active: p.is_active ?? true,
    attributes: p.attributes ?? [],
    materials_count: countMap[p.internal_code] ?? 0,
  }))
}

export async function getPdmById(id: number): Promise<PDMTemplate & { attributes: unknown[] }> {
  const supabase = createClient()
  const { data, error } = await supabase.from('pdm_templates').select('*').eq('id', id).single()
  if (error || !data) handleError(error ?? new Error('PDM não encontrado'))
  return { ...data, attributes: data.attributes ?? [] }
}

export async function createPdm(payload: {
  name: string
  internal_code: string
  is_active?: boolean
  attributes?: unknown[]
}): Promise<PDMTemplate> {
  const supabase = createClient()
  const tenantId = await getCurrentUserTenantId()
  const { data, error } = await supabase.from('pdm_templates').insert({ ...payload, tenant_id: tenantId }).select().single()
  if (error) handleError(error)
  return data
}

export async function updatePdm(id: number, payload: Partial<PDMTemplate>): Promise<PDMTemplate> {
  const supabase = createClient()
  const { data, error } = await supabase.from('pdm_templates').update(payload).eq('id', id).select().single()
  if (error) handleError(error)
  return data
}

export async function deletePdm(id: number): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('pdm_templates').delete().eq('id', id)
  if (error) handleError(error)
}

// ─── Requests ────────────────────────────────────────────────────────────────

export type ApiRequest = {
  id: number
  pdm_id: number
  pdm_name?: string
  status: string
  workflow_id?: number
  requester: string
  cost_center?: string | null
  urgency: string
  justification?: string | null
  generated_description?: string | null
  technical_attributes?: Record<string, unknown>
  attachments?: unknown[]
  date?: string | null
  values?: { attribute_id: string; label: string; value: string }[]
  assigned_to_id?: string | null
  assigned_to_name?: string | null
  pdm_attributes?: Record<string, { label: string; type: string; options: string[] }>
}

export async function getRequests(params?: {
  workflowId?: number
  status?: string
  limit?: number
}): Promise<ApiRequest[]> {
  const supabase = createClient()
  let q = supabase
    .from('material_requests')
    .select(`
      *,
      pdm_templates(id, name)
    `)
    .order('created_at', { ascending: false })

  if (params?.workflowId) q = q.eq('workflow_id', params.workflowId)
  if (params?.status) q = q.eq('status', params.status)
  if (params?.limit) q = q.limit(params.limit)

  const { data, error } = await q
  if (error) handleError(error)

  const result: ApiRequest[] = []
  for (const r of data ?? []) {
    const pdm = Array.isArray(r.pdm_templates) ? r.pdm_templates[0] : r.pdm_templates
    let assignedName: string | null = null
    if (r.assigned_to_id) {
      const { data: u } = await supabase.from('users').select('name').eq('id', r.assigned_to_id).single()
      assignedName = u?.name ?? null
    }
    result.push({
      id: r.id,
      pdm_id: r.pdm_id,
      pdm_name: pdm?.name,
      status: r.status,
      workflow_id: r.workflow_id,
      requester: r.requester,
      cost_center: r.cost_center,
      urgency: r.urgency,
      justification: r.justification,
      generated_description: r.generated_description,
      technical_attributes: r.technical_attributes,
      attachments: r.attachments,
      date: r.created_at,
      values: [],
      assigned_to_id: r.assigned_to_id,
      assigned_to_name: assignedName,
      pdm_attributes: {},
    })
  }
  return result
}

export async function createRequest(body: {
  pdm_id: number
  requester: string
  cost_center?: string
  urgency?: string
  justificativa?: string
  generated_description?: string
  values?: Record<string, string | { value: string; unit?: string }>
  attachments?: string[]
  workflow_id?: number
}): Promise<{ id: number }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const tenantId = await getCurrentUserTenantId()

  const { data: wf } = await supabase.from('workflow_header').select('id').eq('is_active', true).limit(1).single()
  const wfId = body.workflow_id ?? wf?.id
  if (!wfId) handleError(new Error('Nenhum workflow ativo configurado'))

  const { data: firstStep } = await supabase.from('workflow_config').select('status_key').eq('workflow_id', wfId).order('order').limit(1).single()
  const initialStatus = firstStep?.status_key ?? 'cadastro'

  const row = {
    tenant_id: tenantId,
    pdm_id: body.pdm_id,
    workflow_id: wfId,
    status: initialStatus,
    requester: body.requester,
    cost_center: body.cost_center ?? null,
    urgency: body.urgency ?? 'low',
    justification: body.justificativa ?? null,
    generated_description: body.generated_description ?? null,
    technical_attributes: body.values ?? null,
    user_id: user?.id ?? null,
  }

  const { data, error } = await supabase.from('material_requests').insert(row).select('id').single()
  if (error) handleError(error)
  return { id: data.id }
}

export async function assignRequest(id: number): Promise<ApiRequest> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('assign_request', { p_request_id: id })
  if (error) handleError(error)
  return data as ApiRequest
}

export async function advanceWorkflow(id: number): Promise<ApiRequest> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('advance_workflow', { p_request_id: id })
  if (error) handleError(error)
  return data as ApiRequest
}

export async function rejectRequest(id: number, reason?: string): Promise<ApiRequest> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('reject_request', { p_request_id: id, p_reason: reason ?? '' })
  if (error) handleError(error)
  return data as ApiRequest
}

export async function moveRequestToStatus(id: number, statusKey: string): Promise<ApiRequest> {
  const supabase = createClient()
  const { data, error } = await supabase.from('material_requests').update({ status: statusKey, assigned_to_id: null, assigned_at: null }).eq('id', id).select().single()
  if (error) handleError(error)
  return data as ApiRequest
}

export async function updateRequestAttributes(id: number, attributes: Record<string, string>): Promise<ApiRequest> {
  const supabase = createClient()
  const { data: req } = await supabase.from('material_requests').select('technical_attributes').eq('id', id).single()
  const merged = { ...(req?.technical_attributes ?? {}), ...attributes }
  const { data, error } = await supabase.from('material_requests').update({ technical_attributes: merged }).eq('id', id).select().single()
  if (error) handleError(error)
  return data as ApiRequest
}

export type HistoryEvent = {
  id: number
  event_type: string
  message: string
  event_data?: unknown
  stage?: string
  created_at: string | null
  user_name?: string | null
}

export async function getRequestHistory(requestId: number): Promise<HistoryEvent[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('request_history')
    .select('id, event_type, message, event_data, stage, created_at, user_id')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })
  if (error) handleError(error)

  const result: HistoryEvent[] = []
  for (const r of data ?? []) {
    let userName: string | null = null
    if (r.user_id) {
      const { data: u } = await supabase.from('users').select('name').eq('id', r.user_id).single()
      userName = u?.name ?? null
    }
    result.push({
      id: r.id,
      event_type: r.event_type,
      message: r.message,
      event_data: r.event_data,
      stage: r.stage,
      created_at: r.created_at,
      user_name: userName,
    })
  }
  return result
}

export async function getRequestById(id: number): Promise<ApiRequest | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('material_requests')
    .select(`
      *,
      pdm_templates(id, name)
    `)
    .eq('id', id)
    .single()
  if (error || !data) return null

  const pdm = Array.isArray(data.pdm_templates) ? data.pdm_templates[0] : data.pdm_templates
  let assignedName: string | null = null
  if (data.assigned_to_id) {
    const { data: u } = await supabase.from('users').select('name').eq('id', data.assigned_to_id).single()
    assignedName = u?.name ?? null
  }
  return {
    id: data.id,
    pdm_id: data.pdm_id,
    pdm_name: pdm?.name,
    status: data.status,
    workflow_id: data.workflow_id,
    requester: data.requester,
    cost_center: data.cost_center,
    urgency: data.urgency,
    justification: data.justification,
    generated_description: data.generated_description,
    technical_attributes: data.technical_attributes,
    attachments: data.attachments,
    date: data.created_at,
    values: [],
    assigned_to_id: data.assigned_to_id,
    assigned_to_name: assignedName,
    pdm_attributes: {},
  }
}

// ─── Workflows ───────────────────────────────────────────────────────────────

export type WorkflowHeader = { id: number; name: string; description?: string | null; is_active?: boolean }
export type WorkflowStep = { id: number; workflow_id: number; step_name: string; status_key: string; order: number; is_active: boolean }

export async function getWorkflows(): Promise<WorkflowHeader[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('workflow_header').select('id, name, description, is_active').order('id')
  if (error) handleError(error)
  return data ?? []
}

export async function getWorkflowConfig(workflowId?: number): Promise<WorkflowStep[]> {
  const supabase = createClient()
  let wfId = workflowId
  if (wfId == null) {
    const { data: active } = await supabase.from('workflow_header').select('id').eq('is_active', true).limit(1).single()
    wfId = active?.id
  }
  if (!wfId) return []
  const { data, error } = await supabase.from('workflow_config').select('*').eq('workflow_id', wfId).order('order')
  if (error) handleError(error)
  return data ?? []
}

export async function createWorkflow(payload: { name: string; description?: string }): Promise<WorkflowHeader> {
  const supabase = createClient()
  const tenantId = await getCurrentUserTenantId()
  const { data, error } = await supabase.from('workflow_header').insert({ ...payload, tenant_id: tenantId, is_active: true }).select().single()
  if (error) handleError(error)
  return data
}

export async function updateWorkflow(id: number, payload: Partial<WorkflowHeader>): Promise<WorkflowHeader> {
  const supabase = createClient()
  const { data, error } = await supabase.from('workflow_header').update(payload).eq('id', id).select().single()
  if (error) handleError(error)
  return data
}

export async function bulkUpdateWorkflowConfig(payload: {
  workflow_id: number
  steps: { id?: number | null; step_name: string; status_key?: string; order: number; is_active?: boolean }[]
}): Promise<void> {
  const supabase = createClient()
  const tenantId = await getCurrentUserTenantId()
  for (let i = 0; i < payload.steps.length; i++) {
    const s = payload.steps[i]
    const row = {
      tenant_id: tenantId,
      workflow_id: payload.workflow_id,
      step_name: s.step_name,
      status_key: s.status_key ?? s.step_name.toLowerCase().replace(/\s+/g, '_'),
      order: s.order ?? i,
      is_active: s.is_active ?? true,
    }
    if (s.id) {
      await supabase.from('workflow_config').update(row).eq('id', s.id)
    } else {
      await supabase.from('workflow_config').insert(row)
    }
  }
}

// ─── Materials ───────────────────────────────────────────────────────────────

export type MaterialDetail = Record<string, unknown>
export type MaterialsResponse = { total: number; page: number; limit: number; items: MaterialDetail[] }

export async function getMaterials(params: {
  page?: number
  limit?: number
  q?: string
  status?: string
  pdm_code?: string
  erp_status?: string
  date_from?: string
  date_to?: string
}): Promise<MaterialsResponse> {
  const supabase = createClient()
  const page = params.page ?? 1
  const limit = params.limit ?? 50
  let q = supabase.from('material_database').select('*', { count: 'exact' })

  if (params.q) q = q.or(`id_sistema.ilike.%${params.q}%,description.ilike.%${params.q}%,id_erp.ilike.%${params.q}%`)
  if (params.status) q = q.eq('status', params.status)
  if (params.pdm_code) q = q.eq('pdm_code', params.pdm_code)
  if (params.erp_status) q = q.eq('erp_status', params.erp_status)
  if (params.date_from) q = q.gte('created_at', params.date_from)
  if (params.date_to) q = q.lte('created_at', `${params.date_to}T23:59:59.999Z`)

  const from = (page - 1) * limit
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, from + limit - 1)
  if (error) handleError(error)
  return { total: count ?? 0, page, limit, items: data ?? [] }
}

export async function getMaterialById(id: number): Promise<MaterialDetail> {
  const supabase = createClient()
  const { data, error } = await supabase.from('material_database').select('*').eq('id', id).single()
  if (error || !data) handleError(error ?? new Error('Material não encontrado'))
  return data
}

export async function searchMaterials(query: string): Promise<MaterialDetail[]> {
  const q = query?.trim()
  if (!q) return []

  const supabase = createClient()
  const { data, error } = await supabase
    .from('material_database')
    .select('*')
    .or(`description.ilike.%${q}%,id_sistema.ilike.%${q}%,id_erp.ilike.%${q}%`)
    .limit(10)
  if (error) handleError(error)
  return data ?? []
}

export async function updateMaterialStandardize(id: number, body: Record<string, unknown>): Promise<MaterialDetail> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('material_database')
    .update({
      ...body,
      standardized_at: new Date().toISOString(),
      erp_status: 'pendente_erp',
      standardized_by: user?.id ?? null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) handleError(error)
  return data
}

export async function updateMaterialAttributes(id: number, body: Record<string, unknown>): Promise<MaterialDetail> {
  const supabase = createClient()
  const { data: req } = await supabase.from('material_database').select('technical_attributes').eq('id', id).single()
  const attrs = body.technical_attributes ?? body
  const merged = typeof attrs === 'object' && attrs !== null
    ? { ...(req?.technical_attributes ?? {}), ...attrs }
    : (req?.technical_attributes ?? {})
  const updates: Record<string, unknown> = { technical_attributes: merged }
  if (body.description !== undefined) updates.description = body.description
  if (body.pdm_code !== undefined) updates.pdm_code = body.pdm_code
  if (body.pdm_name !== undefined) updates.pdm_name = body.pdm_name
  const { data, error } = await supabase.from('material_database').update(updates).eq('id', id).select().single()
  if (error) handleError(error)
  return data
}

export async function erpIntegrateMaterials(materialIds: number[]): Promise<{ integrated: number[]; skipped: number[]; total: number }> {
  const supabase = createClient()
  const integrated: number[] = []
  const skipped: number[] = []
  const now = new Date().toISOString()
  for (const mid of materialIds) {
    const { data: row } = await supabase.from('material_database').select('erp_status').eq('id', mid).single()
    if (!row || row.erp_status === 'integrado') {
      skipped.push(mid)
      continue
    }
    if (row.erp_status !== 'pendente_erp') {
      skipped.push(mid)
      continue
    }
    const { data } = await supabase.from('material_database').update({ erp_status: 'integrado', erp_integrated_at: now }).eq('id', mid).select().single()
    if (data) integrated.push(mid)
    else skipped.push(mid)
  }
  return { integrated, skipped, total: materialIds.length }
}

// ─── Value Dictionary ────────────────────────────────────────────────────────

export type ValueDictionaryEntry = { id: number; value: string; abbreviation: string; pdm_usage?: string[] }

export async function getValueDictionary(search?: string): Promise<ValueDictionaryEntry[]> {
  const supabase = createClient()
  let q = supabase.from('value_dictionary').select('*').order('value')
  if (search?.trim()) q = q.ilike('value', `%${search.trim()}%`)
  const { data, error } = await q
  if (error) handleError(error)
  return (data ?? []).map((r) => ({ id: r.id, value: r.value, abbreviation: r.abbreviation ?? '', pdm_usage: [] }))
}

export async function updateValueDictionaryEntry(
  id: number,
  body: { value?: string; abbreviation?: string }
): Promise<{ id: number; value: string; abbreviation: string }> {
  const supabase = createClient()
  const { data, error } = await supabase.from('value_dictionary').update({ ...body, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) handleError(error)
  return { id: data.id, value: data.value, abbreviation: data.abbreviation ?? '' }
}

export async function syncValueDictionary(): Promise<{ created: number }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('sync_value_dictionary')
  if (error) handleError(error)
  return { created: (data?.created as number) ?? 0 }
}

export async function mergeDictionaryEntries(
  keepId: number,
  discardId: number
): Promise<{ merged: boolean; keep_id: number; discard_id: number }> {
  const supabase = createClient()
  const { error } = await supabase.rpc('merge_dictionary_entries', { p_keep_id: keepId, p_discard_id: discardId })
  if (error) handleError(error)
  return { merged: true, keep_id: keepId, discard_id: discardId }
}

export type DuplicateGroup = { values: string[]; suggested_canonical: string }

export async function getDuplicates(): Promise<DuplicateGroup[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('value_dictionary').select('value')
  if (error) handleError(error)
  const groups: Record<string, string[]> = {}
  ;(data ?? []).forEach((r) => {
    const key = (r.value ?? '').trim().toLowerCase()
    if (!key) return
    if (!groups[key]) groups[key] = []
    if (!groups[key].includes(r.value)) groups[key].push(r.value)
  })
  return Object.entries(groups)
    .filter(([, v]) => v.length > 1)
    .map(([, values]) => ({ values, suggested_canonical: values[0].charAt(0).toUpperCase() + values[0].slice(1).toLowerCase() }))
}

// ─── Field Dictionary ────────────────────────────────────────────────────────

export type FieldDictionary = Record<string, unknown>

export async function getFieldDictionary(sapView?: string): Promise<FieldDictionary[]> {
  const supabase = createClient()
  let q = supabase.from('field_dictionary').select('*').eq('is_active', true).order('display_order')
  if (sapView) q = q.eq('sap_view', sapView)
  const { data, error } = await q
  if (error) handleError(error)
  return data ?? []
}

/** Admin: all fields including inactive */
export async function getFieldDictionaryAll(sapView?: string): Promise<FieldDictionary[]> {
  const supabase = createClient()
  let q = supabase.from('field_dictionary').select('*').order('sap_view').order('display_order')
  if (sapView) q = q.eq('sap_view', sapView)
  const { data, error } = await q
  if (error) handleError(error)
  return data ?? []
}

export async function getFieldById(id: number): Promise<FieldDictionary> {
  const supabase = createClient()
  const { data, error } = await supabase.from('field_dictionary').select('*').eq('id', id).single()
  if (error || !data) handleError(error ?? new Error('Campo não encontrado'))
  return data
}

export async function createField(body: Record<string, unknown>): Promise<FieldDictionary> {
  const supabase = createClient()
  const tenantId = await getCurrentUserTenantId()
  const { data, error } = await supabase.from('field_dictionary').insert({ ...body, tenant_id: tenantId }).select().single()
  if (error) handleError(error)
  return data
}

export async function updateField(id: number, body: Record<string, unknown>): Promise<FieldDictionary> {
  const supabase = createClient()
  const { data, error } = await supabase.from('field_dictionary').update(body).eq('id', id).select().single()
  if (error) handleError(error)
  return data
}

export async function deleteField(id: number): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('field_dictionary').update({ is_active: false }).eq('id', id)
  if (error) handleError(error)
}

/** Fields where responsible_role matches current user's role (for request form). */
export async function getMyFields(): Promise<MyField[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase.from('users').select('roles(name)').eq('id', user.id).single()
  const roleName = ((profile?.roles as { name?: string })?.name ?? '').trim().toUpperCase()
  if (!roleName) return []

  const { data, error } = await supabase
    .from('field_dictionary')
    .select('*')
    .eq('is_active', true)
    .eq('responsible_role', roleName)
    .order('display_order')
  if (error) handleError(error)

  return (data ?? []).map((r) => ({
    id: r.id,
    field_name: r.field_name,
    field_label: r.field_label,
    sap_field: r.sap_field,
    sap_view: r.sap_view,
    field_type: r.field_type,
    options: r.options,
    responsible_role: r.responsible_role,
    is_required: r.is_required,
    is_active: r.is_active,
    display_order: r.display_order,
    created_at: r.created_at,
  }))
}

export type MyField = {
  id: number
  field_name: string
  field_label: string
  sap_field: string | null
  sap_view: string
  field_type: 'text' | 'number' | 'date' | 'select'
  options: string[] | Record<string, unknown> | null
  responsible_role: string
  is_required: boolean
  is_active: boolean
  display_order: number
  created_at: string | null
}

export type FieldLabelItem = { field_name: string; field_label: string }

/** Field labels for displaying Dados Preenchidos. */
export async function getFieldLabels(): Promise<FieldLabelItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('field_dictionary')
    .select('field_name, field_label')
    .eq('is_active', true)
  if (error) handleError(error)
  return (data ?? []).map((r) => ({ field_name: r.field_name, field_label: r.field_label }))
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export type Role = { id: number; name: string; role_type?: string; permissions?: Record<string, boolean>; user_count?: number }

export async function getRoles(): Promise<Role[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('roles').select('*').order('id')
  if (error) handleError(error)
  const roles = data ?? []
  const result: Role[] = []
  for (const r of roles) {
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role_id', r.id)
    result.push({ ...r, user_count: count ?? 0 })
  }
  return result
}

export async function createRole(body: { name: string; role_type?: string; permissions?: Record<string, boolean> }): Promise<Role> {
  const supabase = createClient()
  const tenantId = await getCurrentUserTenantId()
  const { data, error } = await supabase.from('roles').insert({ ...body, tenant_id: tenantId }).select().single()
  if (error) handleError(error)
  return data
}

export async function updateRole(id: number, body: Partial<Role>): Promise<Role> {
  const supabase = createClient()
  const { data, error } = await supabase.from('roles').update(body).eq('id', id).select().single()
  if (error) handleError(error)
  return data
}

export async function deleteRole(id: number): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('roles').delete().eq('id', id)
  if (error) handleError(error)
}

// ─── Tenants ─────────────────────────────────────────────────────────────────

export type Tenant = { id: number; name: string; slug: string; is_active: boolean; users_count?: number; materials_count?: number }

export async function getTenants(): Promise<Tenant[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('tenants').select('*').order('name')
  if (error) handleError(error)
  const result: Tenant[] = []
  for (const t of data ?? []) {
    const { count: uc } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id)
    const { count: mc } = await supabase.from('material_database').select('*', { count: 'exact', head: true }).eq('tenant_id', t.id)
    result.push({ ...t, users_count: uc ?? 0, materials_count: mc ?? 0 })
  }
  return result
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type Notification = {
  id: number
  event_type: string
  title: string
  message: string
  is_read: boolean
  created_at: string | null
  request_id?: number | null
}

export type NotificationsResponse = { unread_count: number; notifications: Notification[] }

export async function getNotifications(unreadOnly?: boolean): Promise<NotificationsResponse> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { unread_count: 0, notifications: [] }

  let q = supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
  if (unreadOnly) q = q.eq('is_read', false)
  const { data, error } = await q
  if (error) handleError(error)

  const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false)
  return { unread_count: count ?? 0, notifications: data ?? [] }
}

export async function markNotificationRead(id: number): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  if (error) handleError(error)
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id)
}

export type NotificationPrefs = Record<string, boolean>

export async function getUserNotificationPrefs(): Promise<NotificationPrefs> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}
  const { data } = await supabase.from('user_notification_prefs').select('*').eq('user_id', user.id).single()
  if (!data) {
    return {
      notify_request_created: true,
      notify_request_assigned: true,
      notify_request_approved: true,
      notify_request_rejected: true,
      notify_request_completed: true,
      email_request_created: true,
      email_request_assigned: true,
      email_request_approved: true,
      email_request_rejected: true,
      email_request_completed: true,
    }
  }
  return data
}

export async function updateUserNotificationPrefs(prefs: Partial<NotificationPrefs>): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const tenantId = await getCurrentUserTenantId()
  await supabase.from('user_notification_prefs').upsert(
    { user_id: user.id, tenant_id: tenantId, ...prefs },
    { onConflict: 'user_id' }
  )
}

// ─── Measurement Units ───────────────────────────────────────────────────────

export type MeasurementUnit = { id: number; name: string; abbreviation: string; category?: string | null }

export async function getMeasurementUnits(): Promise<MeasurementUnit[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('measurement_units').select('*').eq('is_active', true).order('category')
  if (error) handleError(error)
  return data ?? []
}

// ─── Products ────────────────────────────────────────────────────────────────

export type Product = { id: string; name: string; description?: string | null }

export async function getProducts(): Promise<Product[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('products').select('*')
  if (error) handleError(error)
  return data ?? []
}

export async function getProductById(id: string): Promise<Product | null> {
  const supabase = createClient()
  const { data } = await supabase.from('products').select('*').eq('id', id).single()
  return data
}

export async function createProduct(payload: { name: string; description?: string | null }): Promise<Product> {
  const supabase = createClient()
  const { data, error } = await supabase.from('products').insert(payload).select().single()
  if (error) handleError(error)
  return data
}

export async function deleteProduct(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) handleError(error)
}

// ─── Storage: upload attachment ───────────────────────────────────────────────

export async function uploadRequestAttachment(
  requestId: number,
  file: File
): Promise<{ path: string }> {
  const supabase = createClient()
  const tenantId = await getCurrentUserTenantId()
  const safeName = `${crypto.randomUUID().slice(0, 8)}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const path = `${tenantId}/${requestId}/${safeName}`

  const { error } = await supabase.storage.from('request-attachments').upload(path, file, { upsert: false })
  if (error) handleError(error)

  await supabase.from('request_attachments').insert({
    request_id: requestId,
    file_name: file.name,
    file_path: path,
    mime_type: file.type || 'application/octet-stream',
    file_size: file.size,
  })
  return { path }
}

// ─── System Logs ──────────────────────────────────────────────────────────────

export type SystemLogItem = {
  id: number
  user_id: string | null
  user_name: string | null
  category: string
  action: string
  description: string
  event_data: Record<string, unknown> | null
  ip_address: string | null
  created_at: string | null
}

export async function getSystemLogs(params: {
  page?: number
  limit?: number
  category?: string
  user_id?: string
  from?: string
  to?: string
}): Promise<{ total: number; page: number; limit: number; items: SystemLogItem[] }> {
  const supabase = createClient()
  const page = params.page ?? 1
  const limit = params.limit ?? 50
  let q = supabase.from('system_logs').select('*', { count: 'exact' })
  if (params.category) q = q.eq('category', params.category)
  if (params.user_id) q = q.eq('user_id', params.user_id)
  if (params.from) q = q.gte('created_at', params.from)
  if (params.to) q = q.lte('created_at', params.to)

  const from = (page - 1) * limit
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, from + limit - 1)
  if (error) handleError(error)

  const items: SystemLogItem[] = []
  const userIds = [...new Set((data ?? []).map((r) => r.user_id).filter(Boolean))] as string[]
  const userMap: Record<string, string> = {}
  for (const uid of userIds) {
    const { data: u } = await supabase.from('users').select('name').eq('id', uid).single()
    userMap[uid] = u?.name ?? ''
  }
  for (const r of data ?? []) {
    items.push({
      id: r.id,
      user_id: r.user_id,
      user_name: r.user_id ? userMap[r.user_id] ?? null : null,
      category: r.category,
      action: r.action,
      description: r.description,
      event_data: r.event_data,
      ip_address: r.ip_address,
      created_at: r.created_at,
    })
  }
  return { total: count ?? 0, page, limit, items }
}

// ─── API Route helpers (admin operations needing service_role) ─────────────────

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? res.statusText)
  }
  return res.json()
}

export async function createUserApi(body: {
  email: string
  password: string
  name: string
  tenant_id?: number
  role_id: number
}): Promise<{ id: string; name: string; email: string }> {
  return apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(body) })
}

export async function updateUserApi(
  id: string,
  body: { name?: string; role_id?: number; is_active?: boolean }
): Promise<{ id: string; name: string; email: string }> {
  return apiFetch(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) })
}

export async function createTenantOnboardingApi(body: {
  tenant_name: string
  admin_email: string
  admin_password: string
  admin_name: string
}): Promise<{ tenant_id: number; admin_user_id: string }> {
  return apiFetch('/api/admin/onboarding', { method: 'POST', body: JSON.stringify(body) })
}

export async function updateTenantApi(id: number, body: { name?: string; slug?: string; is_active?: boolean; max_description_length?: number }): Promise<Tenant> {
  return apiFetch(`/api/admin/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export async function switchTenantApi(tenantId: number): Promise<{ success: boolean }> {
  return apiFetch('/api/admin/switch-tenant', { method: 'POST', body: JSON.stringify({ tenant_id: tenantId }) })
}

export async function switchTenantBackApi(): Promise<{ success: boolean; tenant_id: number; tenant_name: string }> {
  return apiFetch('/api/admin/switch-tenant/back', { method: 'GET' })
}

export type UserWithRole = {
  id: string
  name: string
  email: string
  tenant_id: number
  role_id: number
  is_active: boolean
  roles?: { id: number; name: string }
  tenants?: { id: number; name: string }
}

export async function getUsersApi(): Promise<UserWithRole[]> {
  return apiFetch('/api/admin/users')
}

export async function updateMyPassword(currentPassword: string, newPassword: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')
  const res = await fetch(`/api/admin/users/${user.id}/password`, {
    method: 'PUT',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? res.statusText)
  }
}

export async function updateMyPreferences(prefs: { theme?: string; language?: string }): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')
  const res = await fetch(`/api/admin/users/${user.id}/preferences`, {
    method: 'PATCH',
    body: JSON.stringify(prefs),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? res.statusText)
  }
}

export async function uploadUsersImport(
  file: File,
  dryRun: boolean
): Promise<{ dry_run: boolean; users?: { total_rows: number; valid_rows: number; error_rows: number; warning_rows: number; rows: unknown[] }; created?: number; updated?: number }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`/api/admin/users/import?dry_run=${dryRun}`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? res.statusText)
  }
  return res.json()
}

// ─── Database export/import (file downloads and uploads) ────────────────────────

export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(path, { credentials: 'include' })
  if (!res.ok) throw new Error(res.statusText)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function uploadMaterialsImport(
  file: File,
  dryRun: boolean
): Promise<{
  dry_run?: boolean
  total_rows: number
  valid_rows: number
  error_rows: number
  warning_rows: number
  rows: Array<{
    row_number: number
    operacao: string
    codigo_material: string | null
    descricao: string | null
    status: 'ok' | 'warning' | 'error'
    errors: string[]
    warnings: string[]
    data: Record<string, unknown>
  }>
  created?: number
  updated?: number
}> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`/api/database/materials/import?dry_run=${dryRun}`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? res.statusText)
  }
  return res.json()
}

// ─── PDM import/export ─────────────────────────────────────────────────────────

export type PdmsImportValidation = {
  dry_run: boolean
  pdm: {
    total_rows: number
    valid_rows: number
    error_rows: number
    warning_rows: number
    rows: Array<{
      row_number: number
      operacao: string
      pdm_code: string | null
      nome: string | null
      status: string
      errors: string[]
      warnings: string[]
      data: Record<string, unknown>
    }>
  }
  attributes: {
    total_rows: number
    valid_rows: number
    error_rows: number
    warning_rows: number
    rows: Array<{
      row_number: number
      operacao: string
      pdm_code: string | null
      atributo_key: string | null
      status: string
      errors: string[]
      warnings: string[]
    }>
  }
}

export type PdmsImportResult = {
  dry_run: false
  pdm_created: number
  pdm_updated: number
  attr_created: number
  attr_updated: number
  attr_deleted: number
}

export async function downloadPdmImportTemplate(): Promise<void> {
  return downloadFile('/api/admin/pdm/import-template', 'template_importacao_pdm.xlsx')
}

export async function downloadPdmsExport(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return downloadFile(`/api/admin/pdm/export`, `pdm_export_${today}.xlsx`)
}

export async function uploadPdmsImport(
  file: File,
  dryRun: boolean
): Promise<PdmsImportValidation | PdmsImportResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`/api/admin/pdm/import?dry_run=${dryRun}`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string; message?: string }).error ?? (err as { message?: string }).message ?? res.statusText)
  }
  return res.json()
}
