'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useUser } from '@/contexts/user-context'
import { toast, Toaster } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  BookMarked,
  Loader2,
  RefreshCw,
  Save,
  AlertTriangle,
  X,
  Check,
} from 'lucide-react'
import { useValueDictionary, type ValueDictionaryEntry, type DuplicateGroup } from '@/hooks/useValueDictionary'

const LIMIT = 100

export default function ValueDictionaryPage() {
  const { accessToken, can } = useUser()
  const canAccess = can('can_manage_value_dictionary')
  const {
    entries,
    loading,
    error,
    fetchEntries,
    updateEntry,
    mergeEntries,
    syncWithPdms,
    getDuplicates,
  } = useValueDictionary(accessToken)

  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([])
  const [duplicatesOpen, setDuplicatesOpen] = useState(false)
  const [mergeKeepByGroup, setMergeKeepByGroup] = useState<Record<number, number>>({})
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editAbbr, setEditAbbr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (canAccess && accessToken) {
      fetchEntries(search || undefined)
      setOffset(0)
    }
  }, [canAccess, accessToken, search, fetchEntries])

  useEffect(() => {
    if (canAccess && accessToken && entries.length > 0) {
      getDuplicates().then((d) => setDuplicates(Array.isArray(d) ? d : []))
    }
  }, [canAccess, accessToken, entries.length, getDuplicates])

  const loadDuplicates = useCallback(async () => {
    if (!accessToken) return
    try {
      const d = await getDuplicates()
      setDuplicates(Array.isArray(d) ? d : [])
      setMergeKeepByGroup({})
      setDuplicatesOpen(true)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }, [accessToken, getDuplicates])

  useEffect(() => {
    if (duplicatesOpen && duplicates.length === 0 && accessToken) {
      getDuplicates().then((d) => setDuplicates(Array.isArray(d) ? d : []))
    }
  }, [duplicatesOpen, accessToken, getDuplicates])

  const handleSync = async () => {
    if (!accessToken) return
    setSyncing(true)
    try {
      const res = await syncWithPdms()
      toast.success(`Sincronizado: ${(res as { created?: number }).created ?? 0} entradas criadas`)
      fetchEntries(search || undefined)
      loadDuplicates()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  const startEdit = (e: ValueDictionaryEntry) => {
    setEditingId(e.id)
    setEditAbbr(e.abbreviation || '')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditAbbr('')
  }

  const saveEdit = async () => {
    if (editingId == null) return
    try {
      await updateEntry(editingId, editAbbr)
      toast.success('Abreviação salva')
      fetchEntries(search || undefined)
      cancelEdit()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  const handleMerge = async (keepId: number, discardId: number) => {
    try {
      await mergeEntries(keepId, discardId)
      toast.success('Merge realizado')
      fetchEntries(search || undefined)
      getDuplicates().then((d) => setDuplicates(Array.isArray(d) ? d : []))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (!canAccess) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-muted-foreground dark:text-slate-400">
          Sem permissão para acessar o Dicionário de Valores.
        </p>
      </div>
    )
  }

  const displayEntries = entries.slice(0, offset + LIMIT)
  const hasMore = entries.length > offset + LIMIT
  const dupCount = duplicates.length

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <Toaster richColors position="top-right" />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#0F1C38]/10 dark:bg-[#C69A46]/20">
            <BookMarked className="size-5 text-[#0F1C38] dark:text-[#C69A46]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground dark:text-zinc-100">
              Dicionário de Valores
            </h1>
            <p className="text-sm text-muted-foreground dark:text-zinc-400">
              Valores centralizados dos atributos tipo lista
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 dark:bg-zinc-700 px-3 py-1 text-sm font-medium text-slate-700 dark:text-zinc-300">
            {entries.length} entradas
          </span>
          <Button
            onClick={handleSync}
            disabled={syncing || loading}
            className="bg-[#0F1C38] hover:bg-[#162444] text-white dark:bg-[#C69A46] dark:hover:bg-[#B88935]"
          >
            {syncing ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="size-4 mr-2" />
            )}
            Sincronizar com PDMs
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <Input
          placeholder="Buscar por valor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-600"
        />
      </div>

      {/* Duplicates alert */}
      {dupCount > 0 && (
        <div
          className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3"
          role="alert"
        >
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="size-5 shrink-0" />
            <span>
              {dupCount} grupo(s) de valores duplicados detectados.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDuplicates}
            className="border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50"
          >
            Ver duplicatas
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground dark:text-zinc-400">
            <Loader2 className="size-5 animate-spin mr-2" />
            Carregando…
          </div>
        ) : error ? (
          <div className="py-16 text-center text-red-600 dark:text-red-400">{error}</div>
        ) : displayEntries.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground dark:text-zinc-400">
            Nenhuma entrada encontrada. Use &quot;Sincronizar com PDMs&quot; para popular.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-zinc-300">
                    Valor
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-zinc-300">
                    Abreviação
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-zinc-300">
                    PDMs que utilizam
                  </th>
                  <th className="w-24 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {displayEntries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-slate-100 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/30"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-zinc-100">
                      {e.value}
                    </td>
                    <td className="px-4 py-2">
                      {editingId === e.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            ref={inputRef}
                            value={editAbbr}
                            onChange={(ev) => setEditAbbr(ev.target.value)}
                            onKeyDown={(ev) => handleKeyDown(ev, e.id)}
                            onBlur={saveEdit}
                            className="h-8 max-w-[180px] bg-white dark:bg-zinc-800"
                          />
                          <button
                            onClick={saveEdit}
                            className="rounded p-1 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30"
                            title="Salvar"
                          >
                            <Check className="size-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-700"
                            title="Cancelar"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(e)}
                          className="text-left text-slate-700 dark:text-zinc-300 hover:underline flex items-center gap-1"
                        >
                          {e.abbreviation || '—'}
                          <Save className="size-3 opacity-50" />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-zinc-400">
                      {e.pdm_usage && e.pdm_usage.length > 0
                        ? e.pdm_usage.join(', ')
                        : '—'}
                    </td>
                    <td className="px-4 py-2" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && (
          <div className="border-t border-slate-200 dark:border-zinc-700 px-4 py-3 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOffset((o) => o + LIMIT)}
            >
              Carregar mais
            </Button>
          </div>
        )}
      </div>

      {/* Duplicates Modal */}
      {duplicatesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-700 px-6 py-4 sticky top-0 bg-white dark:bg-zinc-900">
              <h2 className="text-lg font-semibold text-foreground dark:text-zinc-100">
                Valores duplicados
              </h2>
              <button
                onClick={() => setDuplicatesOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800 dark:text-zinc-400"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {duplicates.length === 0 ? (
                <p className="text-muted-foreground dark:text-zinc-400">
                  Nenhuma duplicata encontrada.
                </p>
              ) : (
                duplicates.map((group, idx) => {
                  const entriesForGroup = entries.filter((x) =>
                    group.values.some((v) => v === x.value)
                  )
                  const defaultKeep = entriesForGroup[0]?.id ?? 0
                  const selectedKeep = mergeKeepByGroup[idx] ?? defaultKeep
                  return (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-200 dark:border-zinc-700 p-4 space-y-3"
                    >
                      <p className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                        Valores similares:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {group.values.map((v) => (
                          <span
                            key={v}
                            className="rounded-full bg-slate-100 dark:bg-zinc-700 px-3 py-1 text-sm"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground dark:text-zinc-400">
                        Sugestão canônica: {group.suggested_canonical}
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="text-sm">Manter:</span>
                        <select
                          className="rounded-lg border border-slate-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm"
                          value={selectedKeep}
                          onChange={(ev) =>
                            setMergeKeepByGroup((prev) => ({ ...prev, [idx]: Number(ev.target.value) }))
                          }
                        >
                          {entriesForGroup.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.value}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          onClick={() => {
                            const discard = entriesForGroup.find((x) => x.id !== selectedKeep)
                            if (discard) handleMerge(selectedKeep, discard.id)
                          }}
                        >
                          Fazer Merge
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
