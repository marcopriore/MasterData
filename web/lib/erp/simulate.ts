import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Simulação do ERP para tenant sem integração ativa. Roda no servidor, depois da permissão e da
 * trava de duplicidade de integrateMaterial: o navegador não grava id_erp nem erp_status.
 */

type SimIntegrate = { result: 'integrated'; idErp: string } | { result: 'failed'; message: string } | { result: 'skipped'; reason: string }
type SimEliminate = { result: 'eliminated' } | { result: 'skipped'; reason: string }

const SIM_ERROR = 'Erro simulado: Timeout na conexão com SAP'

async function audit(tenantId: number, userId: string | null, action: string, description: string, eventData: Record<string, unknown>) {
  await supabaseAdmin.from('system_logs').insert({ tenant_id: tenantId, user_id: userId, category: 'database', action, description, event_data: eventData })
}

async function nextSimulatedCode(tenantId: number): Promise<number> {
  const { count } = await supabaseAdmin
    .from('material_database')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .not('id_erp', 'is', null)
  return (count ?? 0) + 1
}

/** 90% integra com código MAT-000000; 10% falha, como a simulação antiga. */
export async function simulateIntegrate(tenantId: number, materialId: number, userId: string | null): Promise<SimIntegrate> {
  const { data: row } = await supabaseAdmin
    .from('material_database')
    .select('id, id_erp, erp_status')
    .eq('id', materialId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!row) return { result: 'skipped', reason: 'material não encontrado' }
  if (row.erp_status === 'integrado' || row.erp_status === 'integrado_erp') {
    return { result: 'skipped', reason: 'material já integrado' }
  }
  if (row.erp_status !== 'pendente_erp' && row.erp_status !== 'erro_erp') {
    return { result: 'skipped', reason: `status atual não permite integração: ${row.erp_status ?? 'sem status'}` }
  }

  if (Math.random() < 0.1) {
    await supabaseAdmin.from('material_database').update({ erp_status: 'erro_erp', erp_error_message: SIM_ERROR }).eq('id', materialId)
    await audit(tenantId, userId, 'erp_integration_failed', 'Falha na integração ERP (simulação)', { material_id: materialId })
    return { result: 'failed', message: SIM_ERROR }
  }

  const now = new Date().toISOString()
  let seq = await nextSimulatedCode(tenantId)
  for (let attempt = 0; attempt < 5; attempt++, seq++) {
    const idErp = row.id_erp ?? `MAT-${String(seq).padStart(6, '0')}`
    const { error } = await supabaseAdmin
      .from('material_database')
      .update({ id_erp: idErp, erp_status: 'integrado_erp', erp_integrated_at: now, erp_error_message: null })
      .eq('id', materialId)
    if (!error) {
      await audit(tenantId, userId, 'erp_integrated', 'Material integrado ao ERP (simulação)', { material_id: materialId, erp_code: idErp })
      return { result: 'integrated', idErp }
    }
    if (error.code !== '23505' || row.id_erp) return { result: 'failed', message: error.message }
  }
  return { result: 'failed', message: 'Não foi possível gerar o código simulado' }
}

/** Eliminação simulada: com id_erp, fica Obsoleto e integrado. */
export async function simulateEliminate(tenantId: number, materialId: number, userId: string | null): Promise<SimEliminate> {
  const { data: row } = await supabaseAdmin
    .from('material_database')
    .select('id, id_erp, erp_status')
    .eq('id', materialId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!row?.id_erp || row.erp_status === 'integrando') return { result: 'skipped', reason: 'simulação não eliminou o item' }
  await supabaseAdmin
    .from('material_database')
    .update({ status: 'Obsoleto', erp_status: 'integrado_erp', erp_error_message: null, updated_at: new Date().toISOString() })
    .eq('id', materialId)
  await audit(tenantId, userId, 'erp_eliminated', 'Material eliminado no ERP (simulação)', { material_id: materialId, erp_code: row.id_erp })
  return { result: 'eliminated' }
}
