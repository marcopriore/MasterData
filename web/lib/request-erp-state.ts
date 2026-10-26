/**
 * Situação no ERP do material de uma solicitação finalizada, para a governança.
 * Vermelho = precisa de ação de alguém: o material não chegou ao ERP.
 */

export type RequestErpMaterial = {
  id: number
  id_sistema: string | null
  id_erp: string | null
  status: string | null
  erp_status: string | null
  erp_error_message: string | null
}

export type RequestErpInfo = {
  request_id: number
  material: RequestErpMaterial | null
  duplicate_codes: string[]
}

export type RequestErpState =
  | { kind: 'integrado'; tone: 'ok'; label: string }
  | { kind: 'integrando'; tone: 'info'; label: string }
  | { kind: 'obsoleto'; tone: 'neutral'; label: string }
  | { kind: 'duplicado' | 'erro' | 'pendente' | 'sem_material'; tone: 'alert'; label: string; detail: string }

const INTEGRATED = ['integrado', 'integrado_erp']

export function requestErpState(info: RequestErpInfo): RequestErpState {
  const m = info.material
  if (!m) {
    return {
      kind: 'sem_material',
      tone: 'alert',
      label: 'Sem material na base',
      detail: 'A solicitação foi finalizada sem gerar material na Base de Dados (por exemplo, arrastada no kanban). Cadastre o material na base ou reabra a solicitação.',
    }
  }
  if (m.status === 'Obsoleto') return { kind: 'obsoleto', tone: 'neutral', label: 'Material Obsoleto' }
  if (m.erp_status === 'integrando') return { kind: 'integrando', tone: 'info', label: 'Integrando com o ERP' }
  if (INTEGRATED.includes(m.erp_status ?? '')) {
    return { kind: 'integrado', tone: 'ok', label: m.id_erp ? `ERP ${m.id_erp}` : 'Integrado ERP' }
  }
  if (info.duplicate_codes.length > 0) {
    return {
      kind: 'duplicado',
      tone: 'alert',
      label: 'Duplicado — ERP bloqueado',
      detail: `Duplicado de ${info.duplicate_codes.join(', ')}. Altere a descrição ou os atributos, ou deixe o outro item Obsoleto, e sincronize com o ERP.`,
    }
  }
  if (m.erp_status === 'erro_erp') {
    return {
      kind: 'erro',
      tone: 'alert',
      label: 'Erro no ERP',
      detail: m.erp_error_message?.trim() || 'O ERP recusou a chamada. Corrija o material e sincronize de novo.',
    }
  }
  return {
    kind: 'pendente',
    tone: 'alert',
    label: 'Pendente ERP',
    detail: 'O material está na base, mas ainda não foi enviado ao ERP. Sincronize com o ERP.',
  }
}

/** Pode chamar Sincronizar a partir da solicitação. */
export function canSyncFromRequest(state: RequestErpState): boolean {
  return state.kind === 'erro' || state.kind === 'pendente'
}
