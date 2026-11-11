'use client'

import { useCallback, useEffect, useState } from 'react'
import { Factory, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { getCenters, getMaterialCenters, setMaterialOriginCenter, type Center, type MaterialCenter } from '@/lib/supabase-api'
import { centerLabel } from '@/lib/expansion-request'
import { requestCode } from '@/lib/material-timeline'
import { formatAttrValue } from '@/lib/format-attr-value'
import { Button } from '@/components/ui/button'

/** Centros do material (migration 045). Material antigo sem centro pode receber o centro inicial. */
export function MaterialCenters({
  materialId,
  canEdit,
  obsolete,
  labelOf,
  onChanged,
}: {
  materialId: number
  canEdit: boolean
  obsolete: boolean
  labelOf: (fieldName: string) => string | undefined
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<MaterialCenter[]>([])
  const [centers, setCenters] = useState<Center[]>([])
  const [loading, setLoading] = useState(true)
  const [choice, setChoice] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [mine, all] = await Promise.all([getMaterialCenters(materialId), getCenters({ activeOnly: true })])
      setRows(mine)
      setCenters(all)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [materialId])

  useEffect(() => { void load() }, [load])

  async function handleSetOrigin() {
    if (choice == null) {
      toast.error('Escolha o centro inicial.')
      return
    }
    setSaving(true)
    try {
      await setMaterialOriginCenter(materialId, choice)
      toast.success('Centro inicial informado. O material volta para Pendente ERP.')
      setChoice(null)
      await load()
      onChanged?.()
    } catch (err) {
      toast.error((err as Error)?.message ?? 'Não foi possível informar o centro.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 sm:col-span-2 dark:border-zinc-700/50 dark:bg-card">
      <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-muted-foreground">
        <Factory className="size-4" />
        Centros
      </h3>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando centros…</p>
      ) : rows.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Nenhum centro registrado para este material.</p>
          {canEdit && !obsolete && centers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Centro inicial"
                value={choice ?? ''}
                onChange={(e) => setChoice(e.target.value ? Number(e.target.value) : null)}
                className="min-w-[220px] rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Selecione o centro inicial…</option>
                {centers.map((c) => <option key={c.id} value={c.id}>{centerLabel(c)}</option>)}
              </select>
              <Button size="sm" onClick={() => void handleSetOrigin()} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="size-4 animate-spin" />}
                Informar centro inicial
              </Button>
            </div>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const values = Object.entries(row.attributes).filter(([, v]) => v != null && v !== '')
            return (
              <li key={row.id} className="rounded-lg border border-slate-200 px-4 py-3 text-sm dark:border-zinc-700/50" data-testid={`material-center-${row.code}`}>
                <p className="font-mono font-semibold">
                  {centerLabel(row)}
                  {row.is_origin && <span className="ml-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-sans text-[11px] font-medium text-slate-600 dark:border-zinc-700 dark:bg-muted/30">Centro inicial</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.is_origin
                    ? 'Usa os campos do material.'
                    : row.request_id
                      ? `Ampliado pela solicitação ${requestCode(row.request_id)}.`
                      : 'Ampliado.'}
                </p>
                {!row.is_origin && values.length > 0 && (
                  <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    {values.map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-3 border-b border-slate-100 py-1 last:border-0 dark:border-zinc-700/50">
                        <dt className="text-muted-foreground">{labelOf(key) ?? key}</dt>
                        <dd className="font-medium">{formatAttrValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
