'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, ChevronLeft, Loader2, PencilLine } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { useUser } from '@/contexts/user-context'
import {
  checkDuplicateRequest,
  createChangeRequest,
  getFieldDictionary,
  getFieldRules,
  getMaterialById,
  getPdmById,
  getPdms,
  getRequestById,
  getRequestHistory,
  resubmitChangeRequest,
} from '@/lib/supabase-api'
import { isRejectedStatus } from '@/lib/my-requests'
import { erpViewLabel } from '@/lib/erp-views'
import { changedAttributes, changeRows, touchesPdm, validateChanges, valueText, type ChangeDraft, type ChangeDictField } from '@/lib/change-request'
import { pdmShortDescription, type PdmDescTemplate } from '@/lib/pdm-description'
import { toErpText } from '@/lib/erp-text'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLoading } from '@/components/ui/page-loading'
import type { FieldRuleProfile } from '@/lib/field-rules'

type Material = Record<string, unknown> & { id: number; id_sistema?: string | null; id_erp?: string | null; description?: string; pdm_code?: string | null; status?: string }

const URGENCIES = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
]

/** Solicitação de Alteração de um material da base: escolhe os campos e os valores novos. */
export default function ChangeRequestPage() {
  const params = useParams()
  const router = useRouter()
  const { user, can, ready } = useUser()
  const materialId = Number(params.id)
  const searchParams = useSearchParams()
  const resubmitParam = Number(searchParams.get('reenviar'))
  const resubmitId = Number.isInteger(resubmitParam) && resubmitParam > 0 ? resubmitParam : null
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [material, setMaterial] = useState<Material | null>(null)
  const [pdm, setPdm] = useState<{ id: number; name: string; attributes: Array<Record<string, unknown>> } | null>(null)
  const [fields, setFields] = useState<ChangeDictField[]>([])
  const [profiles, setProfiles] = useState<FieldRuleProfile[]>([])
  const [draft, setDraft] = useState<ChangeDraft>({})
  const [urgency, setUrgency] = useState('low')
  const [justification, setJustification] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!Number.isInteger(materialId) || materialId <= 0) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [m, dict, rules, pdms] = await Promise.all([
          getMaterialById(materialId),
          getFieldDictionary(),
          getFieldRules().catch(() => [] as FieldRuleProfile[]),
          getPdms(),
        ])
        const mat = m as unknown as Material
        const found = pdms.find((p) => p.internal_code === mat.pdm_code)
        const full = found ? await getPdmById(found.id) : null
        if (cancelled) return
        setMaterial(mat)
        setPdm(full ? { id: full.id, name: full.name, attributes: (full.attributes ?? []) as Array<Record<string, unknown>> } : null)
        setFields(dict.map((f) => ({
          field_name: f.field_name as string,
          field_label: f.field_label as string,
          responsible_role: f.responsible_role as string,
          is_required: f.is_required === true,
          field_type: (f.field_type as string) ?? 'text',
          options: f.options,
          erp_view: (f.erp_view as string) ?? '',
        })))
        setProfiles(rules.filter((p) => p.is_active))
        if (!full) setLoadError('O PDM deste material não foi encontrado; a alteração precisa do PDM.')
        if (resubmitId != null) {
          // Reenvio: a rejeitada volta preenchida com os campos e valores que ela pediu.
          const [req, history] = await Promise.all([getRequestById(resubmitId), getRequestHistory(resubmitId).catch(() => [])])
          if (cancelled) return
          if (!req || req.request_type !== 'alteracao' || req.target_material_id !== materialId || !isRejectedStatus(req.status)) {
            setLoadError('Só uma alteração rejeitada deste material pode ser corrigida e reenviada aqui.')
            return
          }
          const attrs = (req.technical_attributes ?? {}) as Record<string, unknown>
          setDraft(Object.fromEntries((req.change_fields ?? []).map((k) => [k, valueText(attrs[k])])))
          setUrgency(req.urgency || 'low')
          setJustification(req.justification ?? '')
          const rejection = history.find((e) => e.event_type === 'rejected')
          setRejectionReason(((rejection?.event_data as { justification?: string } | null)?.justification ?? '').trim() || null)
        }
      } catch (err) {
        if (!cancelled) setLoadError((err as Error)?.message ?? 'Não foi possível carregar o material.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [materialId, resubmitId])

  const rows = useMemo(
    () => (material ? changeRows({ material, pdmAttributes: (pdm?.attributes ?? []) as never, fields, profiles, viewLabel: erpViewLabel }) : []),
    [material, pdm, fields, profiles]
  )
  const groups = useMemo(() => {
    const out = new Map<string, typeof rows>()
    for (const row of rows) out.set(row.group, [...(out.get(row.group) ?? []), row])
    return [...out.entries()]
  }, [rows])

  const newAttributes = useMemo(() => (material ? changedAttributes(material, draft) : {}), [material, draft])
  const pdmTouched = touchesPdm(rows, draft)
  const newDescription = pdmTouched && pdm ? pdmShortDescription(pdm as unknown as PdmDescTemplate, newAttributes) : null
  const blockedStatus = material?.status === 'Obsoleto'

  const toggle = (key: string, on: boolean) => {
    setDraft((prev) => {
      const next = { ...prev }
      if (on) next[key] = valueText(rows.find((r) => r.key === key)?.current)
      else delete next[key]
      return next
    })
  }

  async function handleSubmit() {
    if (!material || !pdm) return
    const errors = validateChanges(rows, draft)
    if (!justification.trim()) errors.push('Informe o motivo da alteração.')
    if (errors.length) {
      toast.error(errors[0], { description: errors.slice(1).join(' · ') || undefined })
      return
    }
    setSaving(true)
    try {
      if (pdmTouched) {
        const dup = await checkDuplicateRequest({ pdm_id: pdm.id, formData: newAttributes, excludeMaterialId: material.id, excludeRequestId: resubmitId })
        if (dup.isDuplicate) {
          toast.error(`Com esses atributos o material fica igual a ${dup.existingCode ?? 'outro cadastro'}.`)
          return
        }
      }
      if (resubmitId != null) {
        await resubmitChangeRequest(resubmitId, {
          change_fields: Object.keys(draft),
          technical_attributes: newAttributes,
          generated_description: newDescription,
          urgency,
          justificativa: justification.trim(),
        })
        toast.success(`Alteração REQ-${String(resubmitId).padStart(4, '0')} reenviada para a primeira etapa.`)
        router.push(`/requests?req=${resubmitId}`)
        return
      }
      const { id } = await createChangeRequest({
        material_id: material.id,
        pdm_id: pdm.id,
        requester: user?.name ?? '',
        change_fields: Object.keys(draft),
        technical_attributes: newAttributes,
        generated_description: newDescription,
        urgency,
        justificativa: justification.trim(),
      })
      toast.success('Solicitação de alteração aberta.')
      router.push(`/requests?req=${id}`)
    } catch (err) {
      toast.error('Não foi possível abrir a alteração', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  if (ready && !can('can_submit_request')) {
    return <p className="text-sm text-muted-foreground">Você não tem permissão para abrir solicitações.</p>
  }
  if (loading) return <PageLoading label="Carregando material…" />
  if (loadError || !material) {
    return (
      <div className="space-y-4">
        <Link href="/requests/new"><Button variant="ghost" size="sm" className="gap-1.5"><ChevronLeft className="size-4" />Voltar</Button></Link>
        <p className="text-sm text-muted-foreground">{loadError ?? 'Material não encontrado.'}</p>
      </div>
    )
  }

  const code = material.id_erp ?? material.id_sistema ?? `#${material.id}`

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <Toaster position="top-right" richColors />
      <Link href="/requests/new"><Button variant="ghost" size="sm" className="-ml-2 gap-1.5"><ChevronLeft className="size-4" />Voltar à pesquisa</Button></Link>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-foreground">
          <PencilLine className="size-6" />
          {resubmitId != null ? `Corrigir e reenviar REQ-${String(resubmitId).padStart(4, '0')}` : 'Alteração de material'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Marque os campos que mudam e informe o valor novo. Cada área revisa só os campos dela; na aprovação final o material é atualizado e volta para Pendente ERP.
        </p>
      </div>

      {resubmitId != null && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Motivo da rejeição</p>
            <p className="mt-0.5">{rejectionReason ?? 'Sem justificativa registrada.'}</p>
            <p className="mt-1 text-xs">Ajuste os campos e os valores. Ao reenviar, a alteração volta para a primeira etapa do fluxo de Alteração.</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-700/50 dark:bg-card">
        <p className="font-mono text-sm font-semibold text-[#0F1C38] dark:text-[#C69A46]">{code}</p>
        <p className="mt-1 font-mono text-sm font-bold">{String(material.description ?? '')}</p>
        {newDescription && newDescription !== material.description && (
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Descrição nova: </span>
            <span className="font-mono font-bold text-blue-700 dark:text-blue-300">{newDescription}</span>
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">O Tipo de Material não aparece aqui: o ERP não permite trocá-lo num material existente.</p>
        {blockedStatus && <p className="mt-2 text-sm font-medium text-red-700">Material obsoleto não pode ser alterado.</p>}
      </div>

      {groups.map(([group, list]) => (
        <section key={group} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-zinc-700/50 dark:bg-card">
          <h2 className="border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:border-zinc-700 dark:bg-muted/30 dark:text-muted-foreground">{group}</h2>
          <div className="divide-y divide-slate-100 dark:divide-zinc-700/50">
            {list.map((row) => {
              const on = row.key in draft
              return (
                <div key={row.key} className={`grid items-center gap-3 px-5 py-3 sm:grid-cols-[auto_1fr_1fr_1fr] ${on ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''}`}>
                  <input
                    type="checkbox"
                    aria-label={`Alterar ${row.label}`}
                    checked={on}
                    disabled={blockedStatus}
                    onChange={(e) => toggle(row.key, e.target.checked)}
                    className="size-4"
                  />
                  <span className="text-sm font-medium">{row.label}{row.required ? ' *' : ''}</span>
                  <span className="text-sm text-muted-foreground">{valueText(row.current) || '—'}</span>
                  {on ? (
                    row.type === 'select' && row.options.length > 0 ? (
                      <select
                        aria-label={`Novo valor de ${row.label}`}
                        value={draft[row.key]}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [row.key]: e.target.value }))}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Selecione…</option>
                        {row.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <Input
                        aria-label={`Novo valor de ${row.label}`}
                        type={row.type === 'number' ? 'number' : 'text'}
                        value={draft[row.key]}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [row.key]: row.type === 'number' ? e.target.value : toErpText(e.target.value.toUpperCase()) }))}
                        className={row.type === 'number' ? '' : 'uppercase'}
                      />
                    )
                  ) : <span className="text-xs text-muted-foreground">Sem alteração</span>}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-3 dark:border-zinc-700/50 dark:bg-card">
        <div>
          <label htmlFor="change-urgency" className="text-xs font-medium text-muted-foreground">Urgência</label>
          <select id="change-urgency" value={urgency} onChange={(e) => setUrgency(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            {URGENCIES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="change-reason" className="text-xs font-medium text-muted-foreground">Motivo da alteração *</label>
          <textarea
            id="change-reason"
            value={justification}
            maxLength={2000}
            onChange={(e) => setJustification(e.target.value.toUpperCase())}
            className="mt-1 min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <span className="text-sm text-muted-foreground">{Object.keys(draft).length} campo(s) marcado(s)</span>
        <Button onClick={() => void handleSubmit()} disabled={saving || blockedStatus || Object.keys(draft).length === 0} className="gap-2">
          {saving && <Loader2 className="size-4 animate-spin" />}
          {resubmitId != null ? 'Reenviar alteração' : 'Abrir solicitação de alteração'}
        </Button>
      </div>
    </div>
  )
}
