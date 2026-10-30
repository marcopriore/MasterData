/**
 * Motivos padrão de rejeição. O código fica no histórico (event_data.motivo); o banco aceita só estes
 * (reject_request, migration 036). Para incluir um motivo, mude aqui e na migration.
 */
export const REJECTION_REASONS = [
  { value: 'duplicado', label: 'Material já cadastrado (duplicado)' },
  { value: 'falta_informacao', label: 'Falta informação' },
  { value: 'pdm_incorreto', label: 'PDM errado' },
  { value: 'especificacao_incorreta', label: 'Especificação técnica incorreta' },
  { value: 'fora_escopo', label: 'Não é material de cadastro' },
  { value: 'outro', label: 'Outro' },
] as const

export type RejectionReason = (typeof REJECTION_REASONS)[number]['value']

export function rejectionReasonLabel(value: string | null | undefined): string {
  if (!value) return 'Não informado'
  return REJECTION_REASONS.find((r) => r.value === value)?.label ?? value
}
