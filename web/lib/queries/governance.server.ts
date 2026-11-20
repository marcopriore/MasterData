import 'server-only'
import type { QueryClient } from '@tanstack/react-query'
import type { CurrentUser } from '@/lib/current-user'
import { pickWorkflowId } from '@/lib/data/governance'
import { canOpenPath } from '@/lib/nav-access'
import { mergeRolePermissions } from '@/lib/permissions'
import { centersQuery, measurementUnitsQuery } from '@/lib/queries/reference'
import {
  activePdmsQuery,
  boardRequestsQuery,
  DEFAULT_CLOSED_DAYS,
  workflowsQuery,
  workflowStepsQuery,
} from '@/lib/queries/governance'
import { createServerSupabaseClient } from '@/lib/supabase/server'

/**
 * Dados iniciais do quadro, buscados no servidor (mesma região do banco) com o cookie do usuário.
 * Só para quem pode abrir a tela; qualquer falha deixa a consulta para o navegador.
 */
export async function prefetchGovernanceBoard(qc: QueryClient, user: CurrentUser | null): Promise<void> {
  const tenantId = user?.tenant_id
  if (!user || user.is_active === false || tenantId == null) return
  const access = { isMaster: user.is_master === true, permissions: user.role_permissions ?? mergeRolePermissions([], []) }
  if (!canOpenPath('/governance', access)) return

  try {
    const db = await createServerSupabaseClient()
    const [workflows] = await Promise.all([
      qc.fetchQuery(workflowsQuery(db)),
      qc.prefetchQuery(activePdmsQuery(db, tenantId)),
      qc.prefetchQuery(centersQuery(db)),
      qc.prefetchQuery(measurementUnitsQuery(db)),
    ])
    const workflowId = pickWorkflowId(workflows, 'cadastro', true)
    if (workflowId == null) return

    // Só o que a tela precisa para desenhar o quadro. A situação no ERP e as datas de conclusão
    // não bloqueiam a abertura: o navegador as busca logo depois que o quadro aparece.
    await Promise.all([
      qc.fetchQuery(boardRequestsQuery(db, workflowId, DEFAULT_CLOSED_DAYS)),
      qc.prefetchQuery(workflowStepsQuery(db, workflowId)),
    ])
  } catch {
    // O que já carregou vai para a tela; o resto o navegador busca.
  }
}
