import { queryOptions } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SERVER_FRESH_MS } from '@/lib/query/client'
import { listMyRequests } from '@/lib/data/my-requests'

/**
 * "Minhas Solicitações". A chave fica sob ['requests'], então invalidar isso (cancelamento, nova
 * solicitação, ação no quadro) também atualiza a lista. O cache é por usuário e empresa.
 */
export const myRequestsQuery = (db: SupabaseClient, userId: string, tenantId: number) => queryOptions({
  queryKey: ['requests', 'mine', userId, tenantId] as const,
  queryFn: () => listMyRequests(db, { userId, tenantId }),
  staleTime: SERVER_FRESH_MS,
})
