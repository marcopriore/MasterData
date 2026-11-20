import 'server-only'
import type { QueryClient } from '@tanstack/react-query'
import type { CurrentUser } from '@/lib/current-user'
import { canOpenPath } from '@/lib/nav-access'
import { mergeRolePermissions } from '@/lib/permissions'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { duplicatesQuery, materialsQuery, pdmOptionsQuery } from '@/lib/queries/database'

/** Primeira página da Base de Dados (sem filtros) e os PDMs da empresa, buscados no servidor. */
export async function prefetchDatabase(qc: QueryClient, user: CurrentUser | null): Promise<void> {
  const tenantId = user?.tenant_id
  if (!user || user.is_active === false || tenantId == null) return
  const access = { isMaster: user.is_master === true, permissions: user.role_permissions ?? mergeRolePermissions([], []) }
  if (!canOpenPath('/database', access)) return

  try {
    const db = await createServerSupabaseClient()
    const [list] = await Promise.all([
      qc.fetchQuery(materialsQuery(db, { page: 1, limit: 50 })),
      qc.prefetchQuery(pdmOptionsQuery(db, tenantId)),
    ])
    // O selo de duplicidade depende dos IDs da lista: vai logo depois, no mesmo servidor, sem ida ao navegador.
    const ids = list.items.map((m) => Number(m.id))
    if (ids.length > 0) await qc.prefetchQuery(duplicatesQuery(db, ids))
  } catch {
    // O que não carregou fica para o navegador.
  }
}
