'use client'

import { useCallback, useState } from 'react'
import { apiGetWithAuth, apiPutWithAuth, apiPostWithAuth } from '@/lib/api'

export type ValueDictionaryEntry = {
  id: number
  value: string
  abbreviation: string
  pdm_usage: string[]
}

export type DuplicateGroup = {
  values: string[]
  suggested_canonical: string
}

export function useValueDictionary(accessToken: string | null) {
  const [entries, setEntries] = useState<ValueDictionaryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEntries = useCallback(
    async (search?: string) => {
      if (!accessToken) return
      setLoading(true)
      setError(null)
      try {
        const params = search ? `?search=${encodeURIComponent(search)}` : ''
        const data = await apiGetWithAuth<ValueDictionaryEntry[]>(
          `/api/value-dictionary${params}`,
          accessToken
        )
        setEntries(Array.isArray(data) ? data : [])
      } catch (e) {
        setError((e as Error)?.message ?? 'Erro ao carregar')
        setEntries([])
      } finally {
        setLoading(false)
      }
    },
    [accessToken]
  )

  const updateEntry = useCallback(
    async (id: number, abbreviation: string, value?: string) => {
      if (!accessToken) throw new Error('Sem token')
      const body: { abbreviation: string; value?: string } = { abbreviation }
      if (value !== undefined) body.value = value
      return apiPutWithAuth<{ id: number; value: string; abbreviation: string }>(
        `/api/value-dictionary/${id}`,
        body,
        accessToken
      )
    },
    [accessToken]
  )

  const mergeEntries = useCallback(
    async (keepId: number, discardId: number) => {
      if (!accessToken) throw new Error('Sem token')
      return apiPostWithAuth<{ merged: boolean; keep_id: number; discard_id: number }>(
        '/api/value-dictionary/merge',
        { keep_id: keepId, discard_id: discardId },
        accessToken
      )
    },
    [accessToken]
  )

  const syncWithPdms = useCallback(async () => {
    if (!accessToken) throw new Error('Sem token')
    return apiPostWithAuth<{ created: number }>('/api/value-dictionary/sync', {}, accessToken)
  }, [accessToken])

  const getDuplicates = useCallback(async (): Promise<DuplicateGroup[]> => {
    if (!accessToken) return []
    return apiGetWithAuth<DuplicateGroup[]>('/api/value-dictionary/duplicates', accessToken)
  }, [accessToken])

  return {
    entries,
    loading,
    error,
    fetchEntries,
    updateEntry,
    mergeEntries,
    syncWithPdms,
    getDuplicates,
  }
}
