import 'server-only'
import type { QueryClient } from '@tanstack/react-query'
import type { CurrentUser } from '@/lib/current-user'
import type { MaterialRecord } from '@/lib/data/material-detail'
import { findDuplicateBlock, type GuardMaterial } from '@/lib/erp/duplicate-guard'
import { canOpenPath } from '@/lib/nav-access'
import { mergeRolePermissions } from '@/lib/permissions'
import {
  duplicateBlockQuery,
  fieldDictionaryQuery,
  fieldRulesQuery,
  materialQuery,
  pdmTemplateQuery,
  type DuplicateBlockResult,
} from '@/lib/queries/material-detail'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Tela de detalhe do material, carregada no servidor (mesma região do banco) com o cookie do usuário:
 * o material primeiro (o PDM e a trava dependem dele) e, em paralelo, o resto.
 * Qualquer falha deixa o que faltou para o navegador.
 */
export async function prefetchMaterialDetail(qc: QueryClient, user: CurrentUser | null, id: number): Promise<void> {
  const tenantId = user?.tenant_id
  if (!user || user.is_active === false || tenantId == null) return
  const access = { isMaster: user.is_master === true, permissions: user.role_permissions ?? mergeRolePermissions([], []) }
  if (!canOpenPath('/database', access)) return

  try {
    const db = await createServerSupabaseClient()
    // Dicionário e regras não dependem do material: saem junto com ele.
    const [material] = await Promise.all([
      qc.fetchQuery(materialQuery(db, id)),
      qc.prefetchQuery(fieldDictionaryQuery(db)),
      qc.prefetchQuery(fieldRulesQuery(db, tenantId)),
    ])
    // PDM e trava dependem do material (código do PDM e campos de duplicidade).
    const pdmCode = typeof material.pdm_code === 'string' && material.pdm_code ? material.pdm_code : null
    await Promise.all([
      pdmCode ? qc.prefetchQuery(pdmTemplateQuery(db, tenantId, pdmCode)) : undefined,
      qc.prefetchQuery(duplicateBlockQuery(material.id, material, () => duplicateBlockOnServer(tenantId, material))),
    ])
  } catch {
    // O que não carregou fica para o navegador.
  }
}

/** Mesma resposta da rota /api/database/materials/[id]/duplicates, sem a ida HTTP. */
async function duplicateBlockOnServer(tenantId: number, material: MaterialRecord): Promise<DuplicateBlockResult> {
  // Material de outra empresa (o Master enxerga todas pela RLS): sem trava, como a rota responde 404.
  if (Number(material.tenant_id) !== tenantId) return { duplicate: false, codes: [], reason: null }
  const block = await findDuplicateBlock(tenantId, material as unknown as GuardMaterial)
  return { duplicate: block != null, codes: block?.codes ?? [], reason: block?.reason ?? null }
}
