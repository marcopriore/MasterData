'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Loader2, Pencil, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  deleteFieldRuleProfile,
  getFieldRules,
  logAction,
  saveFieldRuleProfile,
  updateField,
} from '@/lib/supabase-api'
import {
  baseOf,
  conditionFieldsOf,
  describeConditions,
  fieldOptionValues,
  ruleEntryFor,
  sameConditions,
  sameRole,
  type FieldRequirement,
  type FieldRuleProfile,
} from '@/lib/field-rules'
import { buildRuleSheets, parseRuleSheets } from '@/lib/field-rules-sheet'
import { exportSheetsToXlsx, readXlsxSheets } from '@/lib/export-xlsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageLoading } from '@/components/ui/page-loading'

export type RuleField = {
  id: number
  field_name: string
  field_label: string
  field_type: string
  options: unknown
  responsible_role: string
  is_required: boolean
  is_active: boolean
  display_order: number
}

/** Etapa e exigência na tela: etapa vazia = não aparece. */
type Cell = { role: string; required: boolean }
type Condition = { field: string; value: string }
type Draft = { id?: number; name: string; is_active: boolean; conditions: Condition[]; cells: Record<string, Cell> }

const HIDDEN = ''
const NOT_STAGE_ROLES = new Set(['ADMIN', 'MASTER', 'SOLICITANTE'])

const selectClass = 'w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm'

function cellOf(field: RuleField, profile?: FieldRuleProfile): Cell {
  const entry = profile?.rules[field.field_name]
  if (!entry) return { role: field.responsible_role, required: field.is_required }
  if (entry.requirement === 'hidden') return { role: HIDDEN, required: false }
  return { role: entry.role || field.responsible_role, required: entry.requirement === 'required' }
}

function requirementOf(cell: Cell): FieldRequirement {
  return cell.role === HIDDEN ? 'hidden' : cell.required ? 'required' : 'optional'
}

/** Regras por material: padrão do dicionário e regras específicas por condição. Grava com can_manage_fields (RLS). */
export function FieldRulesPanel({ fields, roles, onFieldsChanged }: { fields: RuleField[]; roles: string[]; onFieldsChanged: () => void }) {
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<FieldRuleProfile[]>([])
  const [defaults, setDefaults] = useState<Record<string, Cell>>({})
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const activeFields = useMemo(
    () => fields.filter((f) => f.is_active && f.field_name !== 'descricao_basica').sort((a, b) => a.display_order - b.display_order),
    [fields]
  )
  const selectFields = useMemo(() => activeFields.filter((f) => f.field_type === 'select'), [activeFields])
  const labelOf = useCallback((name: string) => fields.find((f) => f.field_name === name)?.field_label ?? name, [fields])
  const stageRoles = useMemo(() => {
    const names = new Set(roles.map((r) => r.trim().toUpperCase()).filter((r) => r && !NOT_STAGE_ROLES.has(r)))
    for (const f of activeFields) if (f.responsible_role) names.add(f.responsible_role.trim().toUpperCase())
    return [...names]
  }, [roles, activeFields])
  const conditionFields = useMemo(() => conditionFieldsOf(profiles), [profiles])
  /** Na tela, os campos vêm agrupados pela etapa padrão (ordem dos papéis) e depois pela ordem do dicionário. */
  const fieldsByStage = useMemo(() => {
    const order = (f: RuleField) => {
      const i = stageRoles.indexOf(f.responsible_role.trim().toUpperCase())
      return i < 0 ? stageRoles.length : i
    }
    return [...activeFields].sort((a, b) => order(a) - order(b) || a.display_order - b.display_order)
  }, [activeFields, stageRoles])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setProfiles(await getFieldRules())
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    setDefaults(Object.fromEntries(activeFields.map((f) => [f.field_name, { role: f.responsible_role, required: f.is_required }])))
  }, [activeFields])

  // ─── Regra padrão ──────────────────────────────────────────────────────────
  const changedDefaults = activeFields.filter((f) => {
    const cell = defaults[f.field_name]
    return cell && (!sameRole(cell.role, f.responsible_role) || cell.required !== f.is_required)
  })

  async function handleSaveDefaults() {
    setSavingDefaults(true)
    try {
      for (const f of changedDefaults) {
        const cell = defaults[f.field_name]
        await updateField(f.id, { responsible_role: cell.role.trim().toUpperCase(), is_required: cell.required })
      }
      void logAction({ category: 'fields', action: 'field_updated', description: `Regra padrão alterada (${changedDefaults.length} campo(s))` })
      toast.success('Regra padrão salva.')
      onFieldsChanged()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSavingDefaults(false)
    }
  }

  // ─── Regras específicas ────────────────────────────────────────────────────
  function openNew() {
    setDraft({
      name: '',
      is_active: true,
      conditions: [{ field: selectFields.find((f) => f.field_name === 'tipo_material')?.field_name ?? selectFields[0]?.field_name ?? '', value: '' }],
      cells: Object.fromEntries(activeFields.map((f) => [f.field_name, cellOf(f)])),
    })
  }

  function openEdit(profile: FieldRuleProfile) {
    setDraft({
      id: profile.id,
      name: profile.name,
      is_active: profile.is_active,
      conditions: Object.entries(profile.conditions).map(([field, value]) => ({ field, value })),
      cells: Object.fromEntries(activeFields.map((f) => [f.field_name, cellOf(f, profile)])),
    })
  }

  const draftConditionFields = draft ? draft.conditions.map((c) => c.field).filter(Boolean) : []

  async function handleSaveRule() {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) return toast.error('Dê um nome à regra.')
    const filled = draft.conditions.filter((c) => c.field && c.value)
    if (filled.length === 0) return toast.error('Informe ao menos a condição principal (campo e valor).')
    if (new Set(filled.map((c) => c.field)).size !== filled.length) return toast.error('O mesmo campo aparece em duas condições.')
    const conditions = Object.fromEntries(filled.map((c) => [c.field, c.value]))
    const twin = profiles.find((p) => p.id !== draft.id && sameConditions(p.conditions, conditions))
    if (twin) return toast.error(`A regra ${twin.name} já usa essas mesmas condições.`)

    const rules: FieldRuleProfile['rules'] = {}
    for (const f of activeFields) {
      if (conditions[f.field_name] !== undefined) continue
      const cell = draft.cells[f.field_name]
      if (!cell) continue
      const entry = ruleEntryFor(f, cell.role || f.responsible_role, requirementOf(cell))
      if (entry) rules[f.field_name] = entry
    }
    setSaving(true)
    try {
      await saveFieldRuleProfile({ id: draft.id, name, conditions, rules, is_active: draft.is_active })
      void logAction({ category: 'fields', action: draft.id ? 'field_rule_updated' : 'field_rule_created', description: `Regra de campos "${name}" ${draft.id ? 'atualizada' : 'criada'}` })
      toast.success('Regra salva.')
      setDraft(null)
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(profile: FieldRuleProfile) {
    if (!window.confirm(`Excluir a regra ${profile.name}? Esses materiais voltam a seguir a regra padrão.`)) return
    try {
      await deleteFieldRuleProfile(profile.id)
      void logAction({ category: 'fields', action: 'field_rule_deleted', description: `Regra de campos "${profile.name}" excluída` })
      toast.success('Regra excluída.')
      await load()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function handleExport() {
    try {
      await exportSheetsToXlsx(buildRuleSheets(activeFields, profiles), 'regras_por_material')
    } catch {
      toast.error('Não foi possível exportar a planilha.')
    }
  }

  async function handleImport(file: File) {
    setImporting(true)
    setImportErrors([])
    try {
      const parsed = parseRuleSheets(await readXlsxSheets(file), activeFields, stageRoles)
      if (parsed.errors.length > 0) {
        setImportErrors(parsed.errors)
        toast.error('A planilha tem erros; nada foi gravado.')
        return
      }
      for (const p of parsed.profiles) {
        const existing = profiles.find((e) => e.name.toUpperCase() === p.name)
        await saveFieldRuleProfile({ ...p, id: existing?.id })
      }
      void logAction({ category: 'fields', action: 'field_rules_imported', description: `Regras por material importadas (${parsed.profiles.length})` })
      toast.success(`${parsed.profiles.length} regra(s) importada(s).`)
      await load()
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível ler a planilha.')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (loading) return <PageLoading label="Carregando regras…" minHeight="min-h-[30vh]" />

  const stageSelect = (value: string, onChange: (v: string) => void, opts: { allowHidden: boolean; id: string; label: string }) => (
    <select id={opts.id} aria-label={opts.label} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      {stageRoles.map((r) => <option key={r} value={r}>{r}</option>)}
      {opts.allowHidden && <option value={HIDDEN}>Não aparece</option>}
    </select>
  )

  return (
    <div className="space-y-6">
      {/* Regras específicas */}
      <section className="rounded-2xl border border-slate-200 bg-white dark:border-zinc-700/50 dark:bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-zinc-700">
          <div>
            <h2 className="text-base font-semibold">Regras por condição</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Ex.: se Tipo de Material = FERT, cada campo aparece na etapa e com a obrigatoriedade definidas na regra. Materiais sem regra seguem a regra padrão.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
              <Download className="size-4" />
              Exportar Excel
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Importar Excel
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleImport(file) }}
            />
            <Button size="sm" className="gap-2" onClick={openNew} disabled={selectFields.length === 0}>
              <Plus className="size-4" />
              Nova regra
            </Button>
          </div>
        </div>

        {importErrors.length > 0 && (
          <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            <p className="font-semibold">A planilha não foi importada:</p>
            <ul className="mt-1 list-disc pl-5">
              {importErrors.slice(0, 20).map((e) => <li key={e}>{e}</li>)}
            </ul>
            {importErrors.length > 20 && <p className="mt-1">e mais {importErrors.length - 20}.</p>}
          </div>
        )}

        {profiles.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma regra ainda. Todos os materiais seguem a regra padrão.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-muted/30">
              <tr className="text-left">
                <th className="px-5 py-3 font-semibold">Regra</th>
                <th className="px-5 py-3 font-semibold">Quando</th>
                <th className="px-5 py-3 font-semibold">Campos diferentes do padrão</th>
                <th className="px-5 py-3 font-semibold">Situação</th>
                <th className="px-5 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-b-0 dark:border-zinc-700/40">
                  <td className="px-5 py-3 font-medium">{p.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{describeConditions(p.conditions, labelOf)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{Object.keys(p.rules).length}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${p.is_active ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                      {p.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" title="Editar" onClick={() => openEdit(p)} className="rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" title="Excluir" onClick={() => void handleDelete(p)} className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-700">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Regra padrão */}
      <section className="rounded-2xl border border-slate-200 bg-white dark:border-zinc-700/50 dark:bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-zinc-700">
          <div>
            <h2 className="text-base font-semibold">Regra padrão</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Vale para todo material sem regra por condição: em que etapa cada campo é preenchido e se é obrigatório.</p>
          </div>
          {changedDefaults.length > 0 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDefaults(Object.fromEntries(activeFields.map((f) => [f.field_name, { role: f.responsible_role, required: f.is_required }])))}>
                Descartar
              </Button>
              <Button size="sm" onClick={handleSaveDefaults} disabled={savingDefaults}>
                {savingDefaults && <Loader2 className="size-4 animate-spin" />}
                Salvar {changedDefaults.length} alteração(ões)
              </Button>
            </div>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-muted/30">
            <tr className="text-left">
              <th className="px-5 py-3 font-semibold">Campo</th>
              <th className="w-56 px-5 py-3 font-semibold">Etapa</th>
              <th className="w-32 px-5 py-3 text-center font-semibold">Obrigatório</th>
            </tr>
          </thead>
          <tbody>
            {fieldsByStage.map((f) => {
              const cell = defaults[f.field_name] ?? { role: f.responsible_role, required: f.is_required }
              const isCondition = conditionFields.includes(f.field_name)
              return (
                <tr key={f.field_name} className="border-b border-slate-100 last:border-b-0 dark:border-zinc-700/40">
                  <td className="px-5 py-2.5">
                    <p className="font-medium">{f.field_label}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {f.field_name}
                      {isCondition && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase text-amber-800">condição</span>}
                    </p>
                  </td>
                  <td className="px-5 py-2.5">
                    {stageSelect(cell.role, (role) => setDefaults((d) => ({ ...d, [f.field_name]: { ...cell, role } })), { allowHidden: false, id: `def-role-${f.field_name}`, label: `Etapa de ${f.field_label}` })}
                  </td>
                  <td className="px-5 py-2.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${f.field_label} obrigatório`}
                      checked={cell.required}
                      onChange={(e) => setDefaults((d) => ({ ...d, [f.field_name]: { ...cell, required: e.target.checked } }))}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <Dialog open={draft != null} onOpenChange={(open) => { if (!open) setDraft(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? `Regra ${draft.name}` : 'Nova regra'}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <Label htmlFor="rule-name">Nome da regra</Label>
                  <Input
                    id="rule-name"
                    value={draft.name}
                    maxLength={100}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value.toUpperCase() })}
                    placeholder="Ex.: PRODUTO ACABADO (FERT)"
                    className="mt-1 uppercase"
                  />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
                  Regra ativa
                </label>
              </div>

              <div>
                <p className="text-sm font-semibold">Quando o material tiver</p>
                <div className="mt-2 space-y-2">
                  {draft.conditions.map((c, i) => {
                    const field = selectFields.find((f) => f.field_name === c.field)
                    return (
                      <div key={i} className="grid items-end gap-2 sm:grid-cols-[9rem_1fr_1fr_auto]">
                        <p className="pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i === 0 ? 'Condição principal' : 'E também'}</p>
                        <select
                          aria-label={`Campo da condição ${i + 1}`}
                          value={c.field}
                          onChange={(e) => setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? { field: e.target.value, value: '' } : x)) })}
                          className={selectClass}
                        >
                          <option value="">Campo…</option>
                          {selectFields.map((f) => <option key={f.field_name} value={f.field_name}>{f.field_label}</option>)}
                        </select>
                        <select
                          aria-label={`Valor da condição ${i + 1}`}
                          value={c.value}
                          onChange={(e) => setDraft({ ...draft, conditions: draft.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                          className={selectClass}
                          disabled={!field}
                        >
                          <option value="">Valor…</option>
                          {fieldOptionValues(field?.options).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <button
                          type="button"
                          title="Remover condição"
                          disabled={draft.conditions.length === 1}
                          onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, j) => j !== i) })}
                          className="rounded p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    )
                  })}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, { field: '', value: '' }] })}
                  >
                    <Plus className="size-4" />
                    Adicionar condição
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold">Campos para esse material</p>
                <p className="text-xs text-muted-foreground">Vem preenchido com a regra padrão; o que você mudar fica destacado.</p>
                <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 dark:border-zinc-700">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-muted/30">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-semibold">Campo</th>
                        <th className="w-52 px-3 py-2 font-semibold">Etapa</th>
                        <th className="w-28 px-3 py-2 text-center font-semibold">Obrigatório</th>
                        <th className="w-10 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {fieldsByStage.map((f) => {
                        const isCondition = draftConditionFields.includes(f.field_name)
                        const cell = draft.cells[f.field_name] ?? cellOf(f)
                        const base = baseOf(f)
                        const changed = !isCondition && (requirementOf(cell) !== base.requirement || (cell.role !== HIDDEN && !sameRole(cell.role, base.role)))
                        const setCell = (next: Cell) => setDraft({ ...draft, cells: { ...draft.cells, [f.field_name]: next } })
                        return (
                          <tr key={f.field_name} className={`border-b border-slate-100 last:border-b-0 dark:border-zinc-700/40 ${changed ? 'bg-amber-50/70 dark:bg-amber-950/20' : ''}`}>
                            <td className="px-3 py-2">
                              <p className="font-medium">{f.field_label}</p>
                              <p className="text-xs text-muted-foreground">
                                Padrão: {f.responsible_role} · {f.is_required ? 'obrigatório' : 'opcional'}
                              </p>
                            </td>
                            <td className="px-3 py-2">
                              {isCondition ? (
                                <span className="text-xs text-muted-foreground">Campo da condição (segue o padrão)</span>
                              ) : (
                                stageSelect(cell.role, (role) => setCell({ role, required: role === HIDDEN ? false : cell.required }), { allowHidden: true, id: `rule-role-${f.field_name}`, label: `Etapa de ${f.field_label}` })
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {!isCondition && (
                                <input
                                  type="checkbox"
                                  aria-label={`${f.field_label} obrigatório`}
                                  checked={cell.required}
                                  disabled={cell.role === HIDDEN}
                                  onChange={(e) => setCell({ ...cell, required: e.target.checked })}
                                />
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {changed && (
                                <button type="button" title="Voltar ao padrão" onClick={() => setCell(cellOf(f))} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                                  <RotateCcw className="size-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancelar</Button>
                <Button onClick={handleSaveRule} disabled={saving}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  Salvar regra
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
