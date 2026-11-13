'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, ChevronLeft, Factory, Loader2 } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { useUser } from '@/contexts/user-context'
import {
  createExpansionRequest,
  getCenters,
  getFieldDictionary,
  getFieldRules,
  getMaterialById,
  getMaterialCenters,
  getPdms,
  getRequestById,
  getRequestHistory,
  resubmitExpansionRequest,
  type Center,
  type MaterialCenter,
} from '@/lib/supabase-api'
import { isRejectedStatus } from '@/lib/my-requests'
import { erpViewLabel } from '@/lib/erp-views'
import { valueText } from '@/lib/change-request'
import {
  availableCenters,
  centerLabel,
  expansionAttributes,
  expansionRows,
  initialExpansionDraft,
  validateExpansion,
  type ExpansionDictField,
  type ExpansionDraft,
} from '@/lib/expansion-request'
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

/** Solicitação de Ampliação: o material passa a valer em outro centro, com os campos por centro dele. */
export default function ExpansionRequestPage() {
  const params = useParams()
  const router = useRouter()
  const { user, can, ready } = useUser()
  const materialId = Number(params.id)
  const searchParams = useSearchParams()
  const resubmitParam = Number(searchParams.get('reenviar'))
  const resubmitId = Number.isInteger(resubmitParam) && resubmitParam > 0 ? resubmitParam : null
  const [rejectionReason, setRejectionReason] = useState<string | null>(null)
  const [resubmitDraft, setResubmitDraft] = useState<ExpansionDraft | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [material, setMaterial] = useState<Material | null>(null)
  const [pdmId, setPdmId] = useState<number | null>(null)
  const [fields, setFields] = useState<ExpansionDictField[]>([])
  const [profiles, setProfiles] = useState<FieldRuleProfile[]>([])
  const [centers, setCenters] = useState<Center[]>([])
  const [materialCenters, setMaterialCenters] = useState<MaterialCenter[]>([])
  const [centerId, setCenterId] = useState<number | null>(null)
  const [draft, setDraft] = useState<ExpansionDraft>({})
  const [urgency, setUrgency] = useState('low')
  const [justification, setJustification] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!Number.isInteger(materialId) || materialId <= 0) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [m, dict, rules, pdms, allCenters, mine] = await Promise.all([
          getMaterialById(materialId),
          getFieldDictionary(),
          getFieldRules().catch(() => [] as FieldRuleProfile[]),
          getPdms(),
          getCenters({ activeOnly: true }),
          getMaterialCenters(materialId),
        ])
        if (cancelled) return
        const mat = m as unknown as Material
        const pdm = pdms.find((p) => p.internal_code === mat.pdm_code)
        setMaterial(mat)
        setPdmId(pdm?.id ?? null)
        setFields(dict.map((f) => ({
          field_name: f.field_name as string,
          field_label: f.field_label as string,
          responsible_role: f.responsible_role as string,
          is_required: f.is_required === true,
          field_type: (f.field_type as string) ?? 'text',
          options: f.options,
          erp_view: (f.erp_view as string) ?? '',
          per_center: f.per_center === true,
        })))
        setProfiles(rules.filter((p) => p.is_active))
        setCenters(allCenters)
        setMaterialCenters(mine)
        if (!pdm) setLoadError('O PDM deste material não foi encontrado; a ampliação precisa do PDM.')
        if (resubmitId != null) {
          // Reenvio: mesmo centro; os valores voltam como a rejeitada pediu.
          const [req, history] = await Promise.all([getRequestById(resubmitId), getRequestHistory(resubmitId).catch(() => [])])
          if (cancelled) return
          if (!req || req.request_type !== 'ampliacao' || req.target_material_id !== materialId || !isRejectedStatus(req.status)) {
            setLoadError('Só uma ampliação rejeitada deste material pode ser corrigida e reenviada aqui.')
            return
          }
          const attrs = (req.technical_attributes ?? {}) as Record<string, unknown>
          setCenterId(req.center_id ?? null)
          setResubmitDraft(Object.fromEntries((req.change_fields ?? []).map((k) => [k, valueText(attrs[k])])))
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
    () => (material ? expansionRows({ material, fields, profiles, viewLabel: erpViewLabel }) : []),
    [material, fields, profiles]
  )
  useEffect(() => {
    const initial = initialExpansionDraft(rows)
    setDraft(resubmitDraft ? { ...initial, ...resubmitDraft } : initial)
  }, [rows, resubmitDraft])

  const groups = useMemo(() => {
    const out = new Map<string, typeof rows>()
    for (const row of rows) out.set(row.group, [...(out.get(row.group) ?? []), row])
    return [...out.entries()]
  }, [rows])

  const available = useMemo(() => availableCenters(centers, materialCenters.map((c) => c.center_id)), [centers, materialCenters])
  const blockedStatus = material?.status === 'Obsoleto'

  async function handleSubmit() {
    if (!material || pdmId == null) return
    const errors = validateExpansion(centerId, available, justification)
    if (errors.length) {
      toast.error(errors[0], { description: errors.slice(1).join(' · ') || undefined })
      return
    }
    setSaving(true)
    try {
      if (resubmitId != null) {
        await resubmitExpansionRequest(resubmitId, {
          technical_attributes: expansionAttributes(material, draft),
          urgency,
          justificativa: justification.trim(),
        })
        toast.success(`Ampliação REQ-${String(resubmitId).padStart(4, '0')} reenviada para a primeira etapa.`)
        router.push(`/requests?req=${resubmitId}`)
        return
      }
      const { id } = await createExpansionRequest({
        material_id: material.id,
        pdm_id: pdmId,
        center_id: centerId!,
        requester: user?.name ?? '',
        technical_attributes: expansionAttributes(material, draft),
        urgency,
        justificativa: justification.trim(),
      })
      toast.success('Solicitação de ampliação aberta.')
      router.push(`/requests?req=${id}`)
    } catch (err) {
      toast.error('Não foi possível abrir a ampliação', { description: err instanceof Error ? err.message : undefined })
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
          <Factory className="size-6" />
          {resubmitId != null ? `Corrigir e reenviar REQ-${String(resubmitId).padStart(4, '0')}` : 'Ampliação de material'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha o centro novo e proponha os valores dos campos por centro (já vêm com os do material). Cada área revisa os campos dela; na aprovação final o centro entra no material, que volta para Pendente ERP.
        </p>
      </div>

      {resubmitId != null && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Motivo da rejeição</p>
            <p className="mt-0.5">{rejectionReason ?? 'Sem justificativa registrada.'}</p>
            <p className="mt-1 text-xs">Ajuste os valores do centro. O centro não muda; para outro centro, abra outra ampliação. Ao reenviar, volta para a primeira etapa do fluxo de Ampliação.</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-700/50 dark:bg-card">
        <p className="font-mono text-sm font-semibold text-[#0F1C38] dark:text-[#C69A46]">{code}</p>
        <p className="mt-1 font-mono text-sm font-bold">{String(material.description ?? '')}</p>
        <p className="mt-3 text-xs font-medium text-muted-foreground">Centros do material</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {materialCenters.length === 0 ? (
            <span className="text-sm text-muted-foreground">Nenhum centro registrado.</span>
          ) : materialCenters.map((c) => (
            <span key={c.id} className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-xs dark:border-zinc-700 dark:bg-muted/30">
              {centerLabel(c)}{c.is_origin ? ' (inicial)' : ''}
            </span>
          ))}
        </div>
        {blockedStatus && <p className="mt-2 text-sm font-medium text-red-700">Material obsoleto não pode ser ampliado.</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-700/50 dark:bg-card">
        <label htmlFor="expansion-center" className="text-xs font-medium text-muted-foreground">Centro novo *</label>
        <select
          id="expansion-center"
          value={centerId ?? ''}
          disabled={blockedStatus || available.length === 0 || resubmitId != null}
          onChange={(e) => setCenterId(e.target.value ? Number(e.target.value) : null)}
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Selecione o centro…</option>
          {available.map((c) => <option key={c.id} value={c.id}>{centerLabel(c)}</option>)}
        </select>
        {available.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            {centers.length === 0
              ? 'Nenhum centro cadastrado. Peça ao administrador para cadastrar em Administração → Centros.'
              : 'O material já está em todos os centros ativos.'}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-5 py-4 text-sm text-muted-foreground">
          Nenhum campo marcado &quot;Por centro&quot; no Dicionário de Campos. A ampliação só acrescenta o centro.
        </p>
      ) : groups.map(([group, list]) => (
        <section key={group} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-zinc-700/50 dark:bg-card">
          <h2 className="border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:border-zinc-700 dark:bg-muted/30 dark:text-muted-foreground">{group}</h2>
          <div className="divide-y divide-slate-100 dark:divide-zinc-700/50">
            {list.map((row) => (
              <div key={row.key} className="grid items-center gap-3 px-5 py-3 sm:grid-cols-[1fr_1fr_1fr]">
                <span className="text-sm font-medium">{row.label}{row.required ? ' *' : ''}</span>
                <span className="text-sm text-muted-foreground">No material: {valueText(row.current) || '—'}</span>
                {row.type === 'select' && row.options.length > 0 ? (
                  <select
                    aria-label={`Valor no centro novo de ${row.label}`}
                    value={draft[row.key] ?? ''}
                    disabled={blockedStatus}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [row.key]: e.target.value }))}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Selecione…</option>
                    {row.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <Input
                    aria-label={`Valor no centro novo de ${row.label}`}
                    type={row.type === 'number' ? 'number' : 'text'}
                    value={draft[row.key] ?? ''}
                    disabled={blockedStatus}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [row.key]: row.type === 'number' ? e.target.value : toErpText(e.target.value.toUpperCase()) }))}
                    className={row.type === 'number' ? '' : 'uppercase'}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-3 dark:border-zinc-700/50 dark:bg-card">
        <div>
          <label htmlFor="expansion-urgency" className="text-xs font-medium text-muted-foreground">Urgência</label>
          <select id="expansion-urgency" value={urgency} onChange={(e) => setUrgency(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            {URGENCIES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="expansion-reason" className="text-xs font-medium text-muted-foreground">Motivo da ampliação *</label>
          <textarea
            id="expansion-reason"
            value={justification}
            maxLength={2000}
            onChange={(e) => setJustification(e.target.value.toUpperCase())}
            className="mt-1 min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
          />
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Button onClick={() => void handleSubmit()} disabled={saving || blockedStatus || available.length === 0} className="gap-2">
          {saving && <Loader2 className="size-4 animate-spin" />}
          {resubmitId != null ? 'Reenviar ampliação' : 'Abrir solicitação de ampliação'}
        </Button>
      </div>
    </div>
  )
}
