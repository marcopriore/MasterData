'use client'

import { useCallback, useState } from 'react'
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
} from '@/lib/supabase-api'
import { createClient } from '@/lib/supabase/client'
import type { ValueDictionaryEntry, DuplicateGroup, SimilarValuePair } from '@/lib/supabase-api'

export type { ValueDictionaryEntry, DuplicateGroup, SimilarValuePair }

export function useValueDictionary(_accessToken?: string | null) {
  const [entries, setEntries] = useState<ValueDictionaryEntry[]>([])
  const [similars, setSimilars] = useState<SimilarValuePair[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEntries = useCallback(async (search?: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await getValueDictionary(search)
      setEntries(Array.isArray(data) ? data : [])
    } catch (e) {
      setError((e as Error)?.message ?? 'Erro ao carregar')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  const updateEntry = useCallback(
    async (id: number, abbreviation: string, value?: string) => {
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

      const valueChanged = body.value !== undefined && body.value !== oldValue
      if (valueChanged) {
        await propagateValueToPdms(oldValue, body.value!, body.abbreviation ?? oldAbbreviation ?? '')
        await propagateValueToMaterials(oldValue, body.value!)
      } else if (body.abbreviation !== undefined && body.abbreviation !== oldAbbreviation) {
        await propagateValueToPdms(oldValue, oldValue, body.abbreviation ?? '')
      }

      return result
    },
    []
  )

  const mergeEntries = useCallback(async (keepId: number, discardId: number) => {
    return mergeDictionaryEntries(keepId, discardId)
  }, [])

  const syncWithPdms = useCallback(async (): Promise<{ created: number; updated: number }> => {
    const { created, updated } = await syncValueDictionary()
    return { created, updated }
  }, [])

  const getSimilars = useCallback(async (): Promise<SimilarValuePair[]> => {
    try {
      const data = await getSimilarValues()
      setSimilars(data)
      return data
    } catch (e) {
      console.error('Erro ao carregar similares:', e)
      return []
    }
  }, [])

  const dismissSimilar = useCallback(async (idA: number, idB: number) => {
    try {
      await dismissSimilarPair(idA, idB)
      setSimilars((prev) =>
        prev.filter(
          (s) => !((s.id_a === idA && s.id_b === idB) || (s.id_a === idB && s.id_b === idA))
        )
      )
    } catch (e) {
      console.error('Erro ao dispensar similar:', e)
      throw e
    }
  }, [])

  const mergeSimilar = useCallback(
    async (keepId: number, discardId: number) => {
      const keepEntry = entries.find((x) => x.id === keepId)
      const discardEntry = entries.find((x) => x.id === discardId)
      const keepValue = keepEntry?.value ?? ''
      const keepAbbreviation = keepEntry?.abbreviation ?? ''
      const discardValue = discardEntry?.value ?? ''

      try {
        await mergeEntries(keepId, discardId)
        await propagateValueToPdms(discardValue, keepValue, keepAbbreviation)
        await propagateValueToMaterials(discardValue, keepValue)

        setSimilars((prev) =>
          prev.filter((s) => s.id_a !== discardId && s.id_b !== discardId)
        )
        setEntries((prev) => prev.filter((x) => x.id !== discardId))
      } catch (e) {
        console.error('Erro ao mesclar similar:', e)
        throw e
      }
    },
    [entries, mergeEntries]
  )

  const getDuplicatesList = useCallback(async (): Promise<DuplicateGroup[]> => {
    return getDuplicates()
  }, [])

  return {
    entries,
    similars,
    loading,
    error,
    fetchEntries,
    updateEntry,
    mergeEntries,
    syncWithPdms,
    getDuplicates: getDuplicatesList,
    getSimilars,
    dismissSimilar,
    mergeSimilar,
  }
}
