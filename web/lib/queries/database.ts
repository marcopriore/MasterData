import { queryOptions } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SERVER_FRESH_MS } from '@/lib/query/client'
import { listDuplicateMaterials, listMaterials, listPdmOptions, type MaterialsParams } from '@/lib/data/database'

/**
 * Chaves da Base de Dados. Invalidar ['materials'] atualiza a lista e o selo de duplicidade
 * (depois de salvar, mudar status ou sincronizar com o ERP).
 */
export const databaseKeys = {
  list: (params: MaterialsParams) => ['materials', 'list', params] as const,
  duplicates: (ids: number[]) => ['materials', 'duplicates', ids] as const,
  pdmOptions: ['pdms', 'options'] as const,
}

export const materialsQuery = (db: SupabaseClient, params: MaterialsParams) => queryOptions({
  queryKey: databaseKeys.list(params),
  queryFn: () => listMaterials(db, params),
  staleTime: SERVER_FRESH_MS,
})

export const pdmOptionsQuery = (db: SupabaseClient, tenantId: number) => queryOptions({
  queryKey: databaseKeys.pdmOptions,
  queryFn: () => listPdmOptions(db, tenantId),
  staleTime: SERVER_FRESH_MS,
})

export const duplicatesQuery = (db: SupabaseClient, ids: number[]) => queryOptions({
  queryKey: databaseKeys.duplicates(ids),
  queryFn: () => listDuplicateMaterials(db, ids),
  staleTime: SERVER_FRESH_MS,
})
