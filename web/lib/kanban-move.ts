/**
 * Arraste no kanban da governança. O arraste só troca a coluna; não cria material, não chama o ERP,
 * não pede justificativa nem grava a aprovação. Por isso entrar ou sair do fim do fluxo fica com os botões.
 */

const FINAL = ['finalizado', 'completed', 'concluído', 'concluido']
const REJECTED = ['rejected', 'rejeitado']

/** Motivo do bloqueio, ou null quando o arraste pode seguir. lastStepKey é a última etapa ativa do workflow. */
export function kanbanMoveBlock(fromStatus: string, toStatus: string, lastStepKey?: string | null): string | null {
  const from = fromStatus.trim().toLowerCase()
  const to = toStatus.trim().toLowerCase()
  const last = (lastStepKey ?? '').trim().toLowerCase()
  const isFinal = (s: string) => FINAL.includes(s) || (last !== '' && s === last)

  if (isFinal(from) || REJECTED.includes(from)) {
    return 'Solicitação finalizada ou rejeitada não volta para o fluxo pelo arraste.'
  }
  if (isFinal(to)) {
    return 'Para finalizar, abra a solicitação e use Aprovar: a última etapa cria o material na base e envia ao ERP.'
  }
  if (REJECTED.includes(to)) {
    return 'Para rejeitar, abra a solicitação e use Rejeitar: a justificativa é obrigatória.'
  }
  return null
}
