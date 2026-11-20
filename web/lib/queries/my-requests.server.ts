import 'server-only'
import type { QueryClient } from '@tanstack/react-query'
import type { CurrentUser } from '@/lib/current-user'
import { canOpenPath } from '@/lib/nav-access'
import { mergeRolePermissions } from '@/lib/permissions'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { myRequestsQuery } from '@/lib/queries/my-requests'

/**
 * Lista "Minhas Solicitações" buscada no servidor (mesma região do banco) com o cookie do usuário.
 * A situação no ERP não entra aqui: a tela a busca depois que a lista aparece.
 */
export async function prefetchMyRequests(qc: QueryClient, user: CurrentUser | null): Promise<void> {
  const tenantId = user?.tenant_id
  if (!user || user.is_active === false || tenantId == null) return
  const access = { isMaster: user.is_master === true, permissions: user.role_permissions ?? mergeRolePermissions([], []) }
  if (!canOpenPath('/requests', access)) return

  try {
    const db = await createServerSupabaseClient()
    await qc.prefetchQuery(myRequestsQuery(db, user.id, tenantId))
  } catch {
    // O navegador busca a lista se o servidor não conseguiu.
  }
}
