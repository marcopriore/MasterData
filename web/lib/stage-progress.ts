/** Andamento da solicitação pelas etapas do workflow (visão lista da governança). Sem banco. */
import { statusGroup } from '@/lib/request-status'

export type WorkflowStepLite = { status_key: string; step_name: string; order: number; is_active: boolean }

export type StageState = 'done' | 'current' | 'pending' | 'stopped'

export type StageProgressItem = { key: string; label: string; state: StageState }

export const STAGE_STATE_LABEL: Record<StageState, string> = {
  done: 'Concluída',
  current: 'Em andamento',
  pending: 'Pendente',
  stopped: 'Interrompida',
}

/** Etapas de trabalho, na ordem; a etapa final (finalizado) é o destino, não uma etapa a cumprir. */
export function workStages(steps: WorkflowStepLite[]): WorkflowStepLite[] {
  return steps
    .filter((s) => s.is_active && statusGroup(s.status_key) === 'open')
    .sort((a, b) => a.order - b.order)
}

export function stageProgress(steps: WorkflowStepLite[], status: string | null | undefined): StageProgressItem[] {
  const stages = workStages(steps)
  const group = statusGroup(status)
  const current = (status ?? '').trim().toLowerCase()
  const index = stages.findIndex((s) => s.status_key.trim().toLowerCase() === current)
  return stages.map((s, i) => ({
    key: s.status_key,
    label: s.step_name,
    state:
      group === 'done' ? 'done'
      : group !== 'open' ? 'stopped'
      : index < 0 ? 'pending'
      : i < index ? 'done'
      : i === index ? 'current'
      : 'pending',
  }))
}

/** Percentual de etapas concluídas (a atual conta meia). */
export function progressPercent(items: StageProgressItem[]): number {
  if (items.length === 0) return 0
  const score = items.reduce((acc, item) => acc + (item.state === 'done' ? 1 : item.state === 'current' ? 0.5 : 0), 0)
  return Math.round((score / items.length) * 100)
}
