'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  deleteFieldDefaultRule,
  getFieldDefaultRules,
  getFieldRules,
  getPdms,
  logAction,
  saveFieldDefaultRule,
} from '@/lib/supabase-api'
import { conditionFieldsOf, fieldOptionValues, type FieldRuleProfile } from '@/lib/field-rules'
import {
  PDM_CONDITION,
  overlappingTargets,
  validateDefaultRule,
  type FieldDefaultRule,
} from '@/lib/field-defaults'
import type { RuleField } from '@/components/fields/field-rules-panel'
import type { PDMTemplate } from '@/lib/supabase-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageLoading } from '@/components/ui/page-loading'

type Draft = {
  id?: number
  name: string
  is_active: boolean
  condition_field: string
  condition_value: string
  target_field: string
  target_value: string
  is_fixed: boolean
  priority: number
}

const selectClass = 'w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm'

const EMPTY_DRAFT: Draft = {
  name: '',
  is_active: true,
  condition_field: PDM_CONDITION,
  condition_value: '',
  target_field: '',
  target_value: '',
  is_fixed: false,
  priority: 100,
}

/**
 * Valores padrão por condição (migration 052). Uma regra preenche um campo da etapa que o cobra, quando o PDM
 * ou um campo de lista tem o valor da condição. Quem edita tem can_manage_fields (a página já exige).
 */
export function DefaultValuesPanel({ fields, onChanged }: { fields: RuleField[]; onChanged: () => void }) {
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<FieldDefaultRule[]>([])
  const [profiles, setProfiles] = useState<FieldRuleProfile[]>([])
  const [pdms, setPdms] = useState<PDMTemplate[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)

  const activeFields = useMemo(
    () => fields.filter((f) => f.is_active && f.field_name !== 'descricao_basica').sort((a, b) => a.display_order - b.display_order),
    [fields]
  )
  const labelOf = useCallback((name: string) => fields.find((f) => f.field_name === name)?.field_label ?? name, [fields])
  const pdmName = useCallback(
    (code: string) => pdms.find((p) => p.internal_code.toUpperCase() === code.toUpperCase())?.name ?? code,
    [pdms]
  )

  /** Campos que são condição de regra por material não recebem valor padrão (migration 052). */
  const blockedTargets = useMemo(() => new Set(conditionFieldsOf(profiles)), [profiles])
  const listFields = useMemo(() => activeFields.filter((f) => f.field_type === 'select'), [activeFields])
  const targetFields = useMemo(() => activeFields.filter((f) => !blockedTargets.has(f.field_name)), [activeFields, blockedTargets])
  const overlaps = useMemo(() => overlappingTargets(rules), [rules])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, p, pd] = await Promise.all([getFieldDefaultRules(), getFieldRules(), getPdms()])
      setRules(r)
      setProfiles(p)
      setPdms(pd)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function openNew() {
    setShowErrors(false)
    setDraft({ ...EMPTY_DRAFT, target_field: targetFields[0]?.field_name ?? '' })
  }

  function openEdit(rule: FieldDefaultRule) {
    setShowErrors(false)
    setDraft({
      id: rule.id,
      name: rule.name,
      is_active: rule.is_active,
      condition_field: rule.condition_field,
      condition_value: rule.condition_value,
      target_field: rule.target_field,
      target_value: rule.target_value,
      is_fixed: rule.is_fixed,
      priority: rule.priority,
    })
  }

  const conditionOptions = useMemo(() => {
    if (!draft) return []
    if (draft.condition_field === PDM_CONDITION) {
      return pdms.filter((p) => p.is_active).map((p) => ({ value: p.internal_code, label: `${p.name} (${p.internal_code})` }))
    }
    return fieldOptionValues(listFields.find((f) => f.field_name === draft.condition_field)?.options)
  }, [draft, pdms, listFields])

  const targetOptions = useMemo(() => {
    if (!draft) return []
    return fieldOptionValues(targetFields.find((f) => f.field_name === draft.target_field)?.options)
  }, [draft, targetFields])

  const draftErrors = useMemo(() => {
    if (!draft) return []
    return validateDefaultRule(
      {
        name: draft.name,
        condition_field: draft.condition_field,
        condition_value: draft.condition_value,
        target_field: draft.target_field,
        target_value: draft.target_value,
        priority: draft.priority,
      },
      {
        targetOptions: targetOptions.map((o) => o.value),
        conditionOptions: draft.condition_field === PDM_CONDITION ? undefined : conditionOptions.map((o) => o.value),
      }
    )
  }, [draft, targetOptions, conditionOptions])

  async function handleSave() {
    if (!draft) return
    setShowErrors(true)
    if (draftErrors.length > 0) return
    setSaving(true)
    try {
      await saveFieldDefaultRule({
        id: draft.id,
        name: draft.name.trim(),
        condition_field: draft.condition_field,
        condition_value: draft.condition_value,
        target_field: draft.target_field,
        target_value: draft.target_value,
        is_fixed: draft.is_fixed,
        priority: draft.priority,
        is_active: draft.is_active,
      })
      void logAction({
        category: 'fields',
        action: draft.id ? 'field_default_updated' : 'field_default_created',
        description: `Valor padrão "${draft.name.trim()}" ${draft.id ? 'atualizado' : 'criado'}: ${labelOf(draft.target_field)} = ${draft.target_value}`,
      })
      toast.success('Valor padrão salvo.')
      setDraft(null)
      await load()
      onChanged()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(rule: FieldDefaultRule) {
    if (!window.confirm(`Excluir o valor padrão ${rule.name}? Solicitações em andamento mantêm o valor já preenchido.`)) return
    try {
      await deleteFieldDefaultRule(rule.id)
      void logAction({ category: 'fields', action: 'field_default_deleted', description: `Valor padrão "${rule.name}" excluído` })
      toast.success('Valor padrão excluído.')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (loading) return <PageLoading label="Carregando valores padrão…" minHeight="min-h-[30vh]" />

  const conditionText = (rule: FieldDefaultRule) =>
    rule.condition_field === PDM_CONDITION
      ? `PDM = ${pdmName(rule.condition_value)}`
      : `${labelOf(rule.condition_field)} = ${rule.condition_value}`

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white dark:border-zinc-700/50 dark:bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-zinc-700">
          <div>
            <h2 className="text-base font-semibold">Valores padrão por condição</h2>
            <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
              Quando o PDM ou um campo de lista tem o valor da condição, o campo recebe o valor padrão na etapa que o cobra.
              Só preenche campo vazio; o que já foi digitado não muda. Campo fixo só muda pela regra. Se a condição for
              preenchida depois da etapa do campo, a regra não é aceita.
            </p>
          </div>
          <Button size="sm" className="gap-2" onClick={openNew} disabled={targetFields.length === 0}>
            <Plus className="size-4" />
            Nova regra
          </Button>
        </div>

        {overlaps.length > 0 && (
          <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            {overlaps.map((o) => (
              <p key={o.target_field}>
                <span className="font-semibold">{labelOf(o.target_field)}</span> tem {o.rules.length} regras ativas. Vale a de menor prioridade
                ({o.rules.map((r) => `${r.name} ${r.priority}`).join(', ')}).
              </p>
            ))}
          </div>
        )}

        {rules.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum valor padrão ainda. Os campos são preenchidos à mão, como sempre.</p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-muted/30">
              <tr className="text-left">
                <th className="px-5 py-3 font-semibold">Regra</th>
                <th className="px-5 py-3 font-semibold">Quando</th>
                <th className="px-5 py-3 font-semibold">Preenche</th>
                <th className="px-5 py-3 font-semibold">Tipo</th>
                <th className="px-5 py-3 text-center font-semibold">Prioridade</th>
                <th className="px-5 py-3 font-semibold">Situação</th>
                <th className="px-5 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-slate-100 last:border-b-0 dark:border-zinc-700/40">
                  <td className="px-5 py-3 font-medium">{rule.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{conditionText(rule)}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {labelOf(rule.target_field)} = {rule.target_value}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{rule.is_fixed ? 'Fixo' : 'Sugestão'}</td>
                  <td className="px-5 py-3 text-center text-muted-foreground">{rule.priority}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${rule.is_active ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                      {rule.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" title="Editar" onClick={() => openEdit(rule)} className="rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" title="Excluir" onClick={() => void handleDelete(rule)} className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-700">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Dialog open={draft != null} onOpenChange={(open) => { if (!open) setDraft(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? `Valor padrão ${draft.name}` : 'Novo valor padrão'}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <Label htmlFor="default-name">Nome da regra</Label>
                  <Input
                    id="default-name"
                    value={draft.name}
                    maxLength={100}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value.toUpperCase() })}
                    placeholder="Ex.: GRUPO DO PDM PARA001"
                    className="mt-1 uppercase"
                  />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
                  Regra ativa
                </label>
              </div>

              <div>
                <p className="text-sm font-semibold">Quando</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <select
                    aria-label="Campo da condição"
                    value={draft.condition_field}
                    onChange={(e) => setDraft({ ...draft, condition_field: e.target.value, condition_value: '' })}
                    className={selectClass}
                  >
                    <option value={PDM_CONDITION}>PDM</option>
                    {listFields.map((f) => <option key={f.field_name} value={f.field_name}>{f.field_label}</option>)}
                  </select>
                  <select
                    aria-label="Valor da condição"
                    value={draft.condition_value}
                    onChange={(e) => setDraft({ ...draft, condition_value: e.target.value })}
                    className={selectClass}
                  >
                    <option value="">Valor…</option>
                    {conditionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold">Preenche</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <select
                    aria-label="Campo que recebe o valor"
                    value={draft.target_field}
                    onChange={(e) => setDraft({ ...draft, target_field: e.target.value, target_value: '' })}
                    className={selectClass}
                  >
                    <option value="">Campo…</option>
                    {targetFields.map((f) => <option key={f.field_name} value={f.field_name}>{f.field_label}</option>)}
                  </select>
                  {targetOptions.length > 0 ? (
                    <select
                      aria-label="Valor preenchido"
                      value={draft.target_value}
                      onChange={(e) => setDraft({ ...draft, target_value: e.target.value })}
                      className={selectClass}
                    >
                      <option value="">Valor…</option>
                      {targetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <Input
                      aria-label="Valor preenchido"
                      value={draft.target_value}
                      onChange={(e) => setDraft({ ...draft, target_value: e.target.value.toUpperCase() })}
                      maxLength={500}
                      placeholder="Valor"
                      className="uppercase"
                    />
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-6 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.is_fixed} onChange={(e) => setDraft({ ...draft, is_fixed: e.target.checked })} />
                    Fixo (só muda pela regra; a tela trava o campo)
                  </label>
                  <label className="flex items-center gap-2">
                    Prioridade
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      aria-label="Prioridade"
                      value={draft.priority}
                      onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                      className="w-24"
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">Menor número vence quando duas regras servem ao mesmo campo.</span>
                </div>
              </div>

              {showErrors && draftErrors.length > 0 && (
                <ul className="list-disc space-y-1 rounded-lg border border-red-200 bg-red-50 py-2 pl-8 pr-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                  {draftErrors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  Salvar valor padrão
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
