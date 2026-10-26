import { supabaseAdmin } from '@/lib/supabase/admin'
import { buildErpDeletePayload, buildErpPayload, type DictionaryField } from './payload'
import { callErp } from './client'
import { classifyErpSyncAction } from './sync-action'
import { findDuplicateBlock } from './duplicate-guard'

export type IntegrateOutcome =
  | { result: 'mock' }
  | { result: 'skipped'; reason: string; duplicateOf?: string[] }
  | { result: 'integrated'; idErp: string }
  | { result: 'failed'; message: string }

export type EliminateOutcome =
  | { result: 'not_configured' }
  | { result: 'skipped'; reason: string }
  | { result: 'eliminated' }
  | { result: 'failed'; message: string }

export type SyncOutcome =
  | { result: 'mock'; plan: 'criar' | 'alterar' | 'eliminar' }
  | { result: 'skipped'; reason: string; plan: 'skip' | 'criar' | 'alterar' | 'eliminar'; duplicateOf?: string[] }
  | { result: 'integrated'; idErp: string; plan: 'criar' | 'alterar' }
  | { result: 'eliminated'; plan: 'eliminar' }
  | { result: 'failed'; message: string; plan: 'criar' | 'alterar' | 'eliminar' }
  | { result: 'not_configured'; plan: 'eliminar' }

const RETRYABLE = ['pendente_erp', 'erro_erp']

async function dictionaryFields(tenantId: number): Promise<DictionaryField[]> {
  const { data, error } = await supabaseAdmin
    .from('field_dictionary')
    .select('field_name, erp_field, erp_block')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .not('erp_field', 'is', null)
  if (!error) return (data ?? []) as DictionaryField[]
  const fallback = await supabaseAdmin
    .from('field_dictionary')
    .select('field_name, erp_field')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .not('erp_field', 'is', null)
  return (fallback.data ?? []) as DictionaryField[]
}

async function audit(tenantId: number, userId: string | null, action: string, description: string, eventData: Record<string, unknown>) {
  await supabaseAdmin.from('system_logs').insert({
    tenant_id: tenantId,
    user_id: userId,
    category: 'database',
    action,
    description,
    event_data: eventData,
  })
}

/**
 * Cria ou altera o material no ERP pela integração ativa do tenant.
 * Sem id_erp é criação; com id_erp é alteração. Sem integração ativa devolve 'mock'.
 * O status vai para 'integrando' antes da chamada, então duas chamadas ao mesmo material não saem juntas.
 * Obsoleto e Bloqueado não passam por aqui — use syncMaterial.
 */
export async function integrateMaterial(tenantId: number, materialId: number, userId: string | null): Promise<IntegrateOutcome> {
  const { data: material } = await supabaseAdmin
    .from('material_database')
    .select('*')
    .eq('id', materialId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!material) return { result: 'skipped', reason: 'material não encontrado' }
  if (material.status === 'Bloqueado') {
    return { result: 'skipped', reason: 'Bloqueado é só local; não sincroniza com o ERP' }
  }
  if (material.status === 'Obsoleto') {
    return { result: 'skipped', reason: 'Obsoleto sincroniza por eliminação; use Sincronizar com ERP' }
  }
  if (!RETRYABLE.includes(material.erp_status)) {
    return { result: 'skipped', reason: `status atual não permite integração: ${material.erp_status ?? 'sem status'}` }
  }

  const operation = material.id_erp ? 'alterar_material' : 'criar_material'

  // Antes do teste de integração ativa: a simulação no navegador também não pode passar por cima da trava.
  const duplicate = await findDuplicateBlock(tenantId, material)
  if (duplicate) {
    await audit(tenantId, userId, 'erp_blocked_duplicate', 'Integração ERP barrada por duplicidade', {
      material_id: materialId,
      operacao: operation,
      duplicado_de: duplicate.codes,
    })
    return { result: 'skipped', reason: duplicate.reason, duplicateOf: duplicate.codes }
  }
  const { data: conn } = await supabaseAdmin
    .from('tenant_erp_connections')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('operation', operation)
    .eq('is_active', true)
    .maybeSingle()
  if (!conn) return { result: 'mock' }

  const { data: claimed } = await supabaseAdmin
    .from('material_database')
    .update({ erp_status: 'integrando' })
    .eq('id', materialId)
    .eq('tenant_id', tenantId)
    .in('erp_status', RETRYABLE)
    .select('*')
    .maybeSingle()
  if (!claimed) return { result: 'skipped', reason: 'material já está em integração' }

  const payload = buildErpPayload(claimed, await dictionaryFields(tenantId))
  const call = await callErp({
    tenantId,
    operation,
    payload,
    codes: { idErp: claimed.id_erp, idSistema: claimed.id_sistema },
  })
  const now = new Date().toISOString()

  const fail = async (message: string): Promise<IntegrateOutcome> => {
    await supabaseAdmin
      .from('material_database')
      .update({ erp_status: 'erro_erp', erp_error_message: message.slice(0, 1000) })
      .eq('id', materialId)
    await audit(tenantId, userId, 'erp_integration_failed', 'Falha na integração ERP', { material_id: materialId, operacao: operation })
    return { result: 'failed', message }
  }

  if (call.status === 'not_configured') {
    await supabaseAdmin.from('material_database').update({ erp_status: material.erp_status }).eq('id', materialId)
    return { result: 'mock' }
  }
  if (call.status === 'error') return fail(call.message)

  const idErp = operation === 'criar_material' ? call.code : claimed.id_erp
  if (!idErp) return fail('ERP respondeu sem o código do material no campo configurado')

  const { error } = await supabaseAdmin
    .from('material_database')
    .update({ id_erp: idErp, erp_status: 'integrado_erp', erp_integrated_at: now, erp_error_message: null })
    .eq('id', materialId)
  if (error) {
    return fail(error.code === '23505' ? `código ${idErp} já pertence a outro material` : error.message)
  }

  await audit(tenantId, userId, 'erp_integrated', 'Material integrado ao ERP', { material_id: materialId, erp_code: idErp, operacao: operation })
  return { result: 'integrated', idErp }
}

/** Elimina no ERP. Exige id_erp e integração de eliminação ativa. Com sucesso, o material fica Obsoleto. */
export async function eliminateMaterial(tenantId: number, materialId: number, userId: string | null): Promise<EliminateOutcome> {
  const { data: material } = await supabaseAdmin
    .from('material_database')
    .select('*')
    .eq('id', materialId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!material) return { result: 'skipped', reason: 'material não encontrado' }
  if (!material.id_erp) return { result: 'skipped', reason: 'material ainda não existe no ERP' }
  if (material.erp_status === 'integrando') return { result: 'skipped', reason: 'material em integração' }

  const call = await callErp({
    tenantId,
    operation: 'eliminar_material',
    payload: buildErpDeletePayload(material),
    codes: { idErp: material.id_erp, idSistema: material.id_sistema },
  })
  if (call.status === 'not_configured') return { result: 'not_configured' }
  if (call.status === 'error') {
    await supabaseAdmin.from('material_database').update({ erp_error_message: call.message.slice(0, 1000) }).eq('id', materialId)
    await audit(tenantId, userId, 'erp_elimination_failed', 'Falha ao eliminar no ERP', { material_id: materialId })
    return { result: 'failed', message: call.message }
  }

  await supabaseAdmin
    .from('material_database')
    .update({
      status: 'Obsoleto',
      erp_status: 'integrado_erp',
      erp_error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', materialId)
  await audit(tenantId, userId, 'erp_eliminated', 'Material eliminado no ERP', { material_id: materialId, erp_code: material.id_erp })
  return { result: 'eliminated' }
}

/**
 * Sincroniza um material com o ERP conforme o status de negócio:
 * Ativo → criar/alterar; Obsoleto+id_erp → eliminar; Bloqueado → skip.
 */
export async function syncMaterial(tenantId: number, materialId: number, userId: string | null): Promise<SyncOutcome> {
  const { data: material } = await supabaseAdmin
    .from('material_database')
    .select('id, status, id_erp, erp_status')
    .eq('id', materialId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!material) return { result: 'skipped', reason: 'material não encontrado', plan: 'skip' }

  const plan = classifyErpSyncAction(material)
  if (plan.action === 'skip') return { result: 'skipped', reason: plan.reason, plan: 'skip' }

  if (plan.action === 'eliminar') {
    const out = await eliminateMaterial(tenantId, materialId, userId)
    if (out.result === 'eliminated') return { result: 'eliminated', plan: 'eliminar' }
    if (out.result === 'not_configured') return { result: 'not_configured', plan: 'eliminar' }
    if (out.result === 'skipped') return { result: 'skipped', reason: out.reason, plan: 'eliminar' }
    return { result: 'failed', message: out.message, plan: 'eliminar' }
  }

  const out = await integrateMaterial(tenantId, materialId, userId)
  if (out.result === 'integrated') return { result: 'integrated', idErp: out.idErp, plan: plan.action }
  if (out.result === 'mock') return { result: 'mock', plan: plan.action }
  if (out.result === 'skipped') return { result: 'skipped', reason: out.reason, plan: plan.action, duplicateOf: out.duplicateOf }
  return { result: 'failed', message: out.message, plan: plan.action }
}

/** Disparo da última etapa: cria no ERP o material nascido da solicitação, se houver integração ativa. */
export async function integrateRequestMaterial(tenantId: number, requestId: number, userId: string | null) {
  const { data: material } = await supabaseAdmin
    .from('material_database')
    .select('id, id_erp, erp_status')
    .eq('tenant_id', tenantId)
    .eq('request_id', requestId)
    .maybeSingle()
  if (!material) return { result: 'skipped' as const, reason: 'solicitação sem material criado' }
  if (material.id_erp) return { result: 'skipped' as const, reason: 'material já tem código ERP' }
  return integrateMaterial(tenantId, material.id, userId)
}
