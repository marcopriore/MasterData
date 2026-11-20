import { queryOptions } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SERVER_FRESH_MS } from '@/lib/query/client'
import {
  getMaterialRecord,
  getPdmTemplateByCode,
  listFieldDictionary,
  listFieldRuleProfiles,
} from '@/lib/data/material-detail'

/** Dicionário e regras mudam pouco: cinco minutos antes de buscar de novo. */
const FIELDS_STALE_MS = 5 * 60_000

/** Chaves da tela de detalhe. O cache é por usuário e empresa (components/query-provider). */
export const materialDetailKeys = {
  material: (id: number) => ['materials', 'detail', id] as const,
  dictionary: ['fields', 'dictionary'] as const,
  rules: (tenantId: number) => ['fields', 'rules', tenantId] as const,
  pdm: (tenantId: number, code: string) => ['pdms', 'template', tenantId, code] as const,
  duplicateBlock: (id: number, description: string | null, detailed: string | null, status: string | null) =>
    ['materials', 'duplicate-block', id, description ?? '', detailed ?? '', status ?? ''] as const,
}

export type DuplicateBlockResult = { duplicate: boolean; codes: string[]; reason: string | null }

/**
 * Material completo. Não atualiza ao voltar para a aba: a tela tem edição em andamento, e quem decide
 * quando recarregar é a própria tela (salvar, integrar, eliminar).
 */
export const materialQuery = (db: SupabaseClient, id: number) => queryOptions({
  queryKey: materialDetailKeys.material(id),
  queryFn: () => getMaterialRecord(db, id),
  staleTime: SERVER_FRESH_MS,
  refetchOnWindowFocus: false,
})

export const fieldDictionaryQuery = (db: SupabaseClient) => queryOptions({
  queryKey: materialDetailKeys.dictionary,
  queryFn: () => listFieldDictionary(db),
  staleTime: FIELDS_STALE_MS,
})

export const fieldRulesQuery = (db: SupabaseClient, tenantId: number) => queryOptions({
  queryKey: materialDetailKeys.rules(tenantId),
  queryFn: () => listFieldRuleProfiles(db, tenantId),
  staleTime: FIELDS_STALE_MS,
})

export const pdmTemplateQuery = (db: SupabaseClient, tenantId: number, code: string) => queryOptions({
  queryKey: materialDetailKeys.pdm(tenantId, code),
  queryFn: () => getPdmTemplateByCode(db, tenantId, code),
  staleTime: SERVER_FRESH_MS,
  refetchOnWindowFocus: false,
})

/**
 * Trava de duplicidade do material. Quem carrega muda de lado: a rota /api no navegador,
 * a mesma regra direto no servidor (ver material-detail.server).
 */
export const duplicateBlockQuery = (
  id: number,
  fields: { description: string | null; detailed_description?: string | null; status: string | null },
  load: () => Promise<DuplicateBlockResult>
) => queryOptions({
  queryKey: materialDetailKeys.duplicateBlock(id, fields.description, fields.detailed_description ?? null, fields.status),
  queryFn: load,
  staleTime: SERVER_FRESH_MS,
  refetchOnWindowFocus: false,
})
