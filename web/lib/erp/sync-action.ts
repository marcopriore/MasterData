/**
 * Roteamento da sincronização PRO-MAT → ERP a partir do status de negócio.
 *
 * - Ativo + sem id_erp → criar
 * - Ativo + com id_erp → alterar
 * - Obsoleto + com id_erp → eliminar (DELETE)
 * - Obsoleto sem id_erp → só local (nada no ERP)
 * - Bloqueado → só local (nunca DELETE)
 */

export type ErpSyncPlan =
  | { action: 'criar' }
  | { action: 'alterar' }
  | { action: 'eliminar' }
  | { action: 'skip'; reason: string }

export type ErpSyncMaterial = {
  status?: string | null
  id_erp?: string | null
  erp_status?: string | null
}

const RETRYABLE = new Set(['pendente_erp', 'erro_erp'])

export function classifyErpSyncAction(material: ErpSyncMaterial): ErpSyncPlan {
  const status = (material.status ?? '').trim()
  const erpStatus = material.erp_status ?? null
  const idErp = typeof material.id_erp === 'string' ? material.id_erp.trim() : ''

  if (erpStatus === 'integrando') {
    return { action: 'skip', reason: 'material em integração com o ERP' }
  }

  if (status === 'Bloqueado') {
    return { action: 'skip', reason: 'Bloqueado é só local; não sincroniza com o ERP' }
  }

  if (status === 'Obsoleto') {
    if (!idErp) {
      return { action: 'skip', reason: 'Obsoleto sem código ERP — nada a eliminar' }
    }
    if (!RETRYABLE.has(erpStatus ?? '')) {
      return { action: 'skip', reason: `eliminação exige Pendente ERP ou Erro ERP (atual: ${erpStatus ?? 'sem status'})` }
    }
    return { action: 'eliminar' }
  }

  // Ativo e demais: create/update
  if (!RETRYABLE.has(erpStatus ?? '')) {
    return { action: 'skip', reason: `status ERP não permite sincronização: ${erpStatus ?? 'sem status'}` }
  }
  if (!idErp) return { action: 'criar' }
  return { action: 'alterar' }
}

export function summarizeErpSyncPlans(plans: ErpSyncPlan[]) {
  return {
    criar: plans.filter((p) => p.action === 'criar').length,
    alterar: plans.filter((p) => p.action === 'alterar').length,
    eliminar: plans.filter((p) => p.action === 'eliminar').length,
    skip: plans.filter((p) => p.action === 'skip').length,
  }
}
