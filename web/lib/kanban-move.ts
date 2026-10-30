/**
 * Arraste no kanban da governança. O arraste só troca a coluna; não cria material, não chama o ERP,
 * não pede justificativa nem grava a aprovação. Por isso entrar ou sair do fim do fluxo fica com os botões.
 */
import { isCancelledStatus, isClosedStatus, isDoneStatus, isRejectedStatus } from '@/lib/request-status'

/** Motivo do bloqueio, ou null quando o arraste pode seguir. lastStepKey é a última etapa ativa do workflow. */
export function kanbanMoveBlock(fromStatus: string, toStatus: string, lastStepKey?: string | null): string | null {
  const from = fromStatus.trim().toLowerCase()
  const to = toStatus.trim().toLowerCase()
  const last = (lastStepKey ?? '').trim().toLowerCase()
  const isFinal = (s: string) => isDoneStatus(s) || (last !== '' && s === last)

  if (isFinal(from) || isClosedStatus(from)) {
    return 'Solicitação finalizada, rejeitada ou cancelada não volta para o fluxo pelo arraste.'
  }
  if (isFinal(to)) {
    return 'Para finalizar, abra a solicitação e use Aprovar: a última etapa cria o material na base e envia ao ERP.'
  }
  if (isRejectedStatus(to)) {
    return 'Para rejeitar, abra a solicitação e use Rejeitar: o motivo é obrigatório.'
  }
  if (isCancelledStatus(to)) {
    return 'Para cancelar, abra a solicitação e use Cancelar.'
  }
  return null
}
