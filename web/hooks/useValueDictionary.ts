'use client'

import { useCallback, useState } from 'react'
import {
  getValueDictionary,
  updateValueDictionaryEntry,
  mergeDictionaryEntries,
  syncValueDictionary,
  getDuplicates,
} from '@/lib/supabase-api'
import type { ValueDictionaryEntry, DuplicateGroup } from '@/lib/supabase-api'

export type { ValueDictionaryEntry, DuplicateGroup }

export function useValueDictionary(_accessToken?: string | null) {
  const [entries, setEntries] = useState<ValueDictionaryEntry[]>([])
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
      return updateValueDictionaryEntry(id, body)
    },
    []
  )

  const mergeEntries = useCallback(async (keepId: number, discardId: number) => {
    return mergeDictionaryEntries(keepId, discardId)
  }, [])

  const syncWithPdms = useCallback(async () => {
    return syncValueDictionary()
  }, [])

  const getDuplicatesList = useCallback(async (): Promise<DuplicateGroup[]> => {
    return getDuplicates()
  }, [])

  return {
    entries,
    loading,
    error,
    fetchEntries,
    updateEntry,
    mergeEntries,
    syncWithPdms,
    getDuplicates: getDuplicatesList,
  }
}
