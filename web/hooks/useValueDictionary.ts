'use client'

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getValueDictionary,
  updateValueDictionaryEntry,
  mergeDictionaryEntries,
  syncValueDictionary,
  getDuplicates,
  getSimilarValues,
  dismissSimilarPair,
  propagateValueToPdms,
  propagateValueToMaterials,
  logAction,
} from '@/lib/supabase-api'
import { createClient } from '@/lib/supabase/client'
import type { ValueDictionaryEntry, DuplicateGroup, SimilarValuePair } from '@/lib/supabase-api'

export type { ValueDictionaryEntry, DuplicateGroup, SimilarValuePair }

/** Lista por busca; similares e duplicatas são da empresa inteira. */
export const valueDictionaryKeys = {
  all: ['value-dictionary'] as const,
  entries: (search: string) => ['value-dictionary', 'entries', search] as const,
  similars: ['value-dictionary', 'similars'] as const,
  duplicates: ['value-dictionary', 'duplicates'] as const,
}

const NO_ENTRIES: ValueDictionaryEntry[] = []
const NO_SIMILARS: SimilarValuePair[] = []
const NO_DUPLICATES: DuplicateGroup[] = []

/**
 * Dicionário de valores: as listas são consultas com cache por busca. As gravações atualizam
 * o cache (ou o invalidam) em vez de manter cópias locais.
 */
export function useValueDictionary(search: string, enabled: boolean) {
  const queryClient = useQueryClient()

  // Mantém a lista anterior enquanto a busca nova carrega (cada letra digitada é uma busca).
  const entriesQ = useQuery({
    queryKey: valueDictionaryKeys.entries(search),
    queryFn: () => getValueDictionary(search || undefined),
    enabled,
    placeholderData: keepPreviousData,
  })
  const entries = entriesQ.data ?? NO_ENTRIES
  const hasEntries = entries.length > 0

  const similarsQ = useQuery({
    queryKey: valueDictionaryKeys.similars,
    queryFn: () => getSimilarValues(),
    enabled: enabled && hasEntries,
  })
  const duplicatesQ = useQuery({
    queryKey: valueDictionaryKeys.duplicates,
    queryFn: () => getDuplicates(),
    enabled: enabled && hasEntries,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: valueDictionaryKeys.all })
  const refreshDuplicates = () => queryClient.invalidateQueries({ queryKey: valueDictionaryKeys.duplicates })

  async function updateEntry(id: number, abbreviation: string, value?: string) {
    const body: { abbreviation: string; value?: string } = { abbreviation }
    if (value !== undefined) body.value = value

    const supabase = createClient()
    const { data: current } = await supabase
      .from('value_dictionary')
      .select('value, abbreviation')
      .eq('id', id)
      .single()
    const oldValue = (current?.value as string) ?? ''
    const oldAbbreviation = (current?.abbreviation as string) ?? ''

    const result = await updateValueDictionaryEntry(id, body)

    void logAction({
      category: 'fields',
      action: 'value_updated',
      description: 'Valor do dicionário atualizado',
      event_data: { id, abbreviation: body.abbreviation, value: body.value },
    })

    const valueChanged = body.value !== undefined && body.value !== oldValue
    if (valueChanged) {
      await propagateValueToPdms(oldValue, body.value!, body.abbreviation ?? oldAbbreviation ?? '')
      await propagateValueToMaterials(oldValue, body.value!)
    } else if (body.abbreviation !== undefined && body.abbreviation !== oldAbbreviation) {
      await propagateValueToPdms(oldValue, oldValue, body.abbreviation ?? '')
    }

    return result
  }

  async function mergeEntries(keepId: number, discardId: number) {
    return mergeDictionaryEntries(keepId, discardId)
  }

  async function syncWithPdms(): Promise<{ created: number; updated: number }> {
    const result = await syncValueDictionary()
    void logAction({
      category: 'fields',
      action: 'value_dict_synced',
      description: 'Dicionário de valores sincronizado com PDMs',
      event_data: { created: result.created, updated: result.updated },
    })
    return { created: result.created, updated: result.updated }
  }

  async function dismissSimilar(idA: number, idB: number) {
    try {
      await dismissSimilarPair(idA, idB)
      queryClient.setQueryData<SimilarValuePair[]>(valueDictionaryKeys.similars, (prev) =>
        prev?.filter((s) => !((s.id_a === idA && s.id_b === idB) || (s.id_a === idB && s.id_b === idA)))
      )
    } catch (e) {
      console.error('Erro ao dispensar similar:', e)
      throw e
    }
  }

  async function mergeSimilar(keepId: number, discardId: number) {
    const keepEntry = entries.find((x) => x.id === keepId)
    const discardEntry = entries.find((x) => x.id === discardId)
    const keepValue = keepEntry?.value ?? ''
    const keepAbbreviation = keepEntry?.abbreviation ?? ''
    const discardValue = discardEntry?.value ?? ''

    try {
      await mergeEntries(keepId, discardId)
      void logAction({
        category: 'fields',
        action: 'value_merged',
        description: 'Valores mesclados no dicionário',
        event_data: { keep_id: keepId, discard_id: discardId },
      })
      await propagateValueToPdms(discardValue, keepValue, keepAbbreviation)
      await propagateValueToMaterials(discardValue, keepValue)

      queryClient.setQueryData<SimilarValuePair[]>(valueDictionaryKeys.similars, (prev) =>
        prev?.filter((s) => s.id_a !== discardId && s.id_b !== discardId)
      )
      queryClient.setQueriesData<ValueDictionaryEntry[]>(
        { queryKey: ['value-dictionary', 'entries'] },
        (prev) => prev?.filter((x) => x.id !== discardId)
      )
    } catch (e) {
      console.error('Erro ao mesclar similar:', e)
      throw e
    }
  }

  return {
    entries,
    similars: similarsQ.data ?? NO_SIMILARS,
    duplicates: duplicatesQ.data ?? NO_DUPLICATES,
    duplicatesError: duplicatesQ.error,
    loading: entriesQ.isFetching,
    error: entriesQ.error ? ((entriesQ.error as Error).message ?? 'Erro ao carregar') : null,
    refresh,
    refreshDuplicates,
    updateEntry,
    mergeEntries,
    syncWithPdms,
    dismissSimilar,
    mergeSimilar,
  }
}
