/**
 * Quem é de uma etapa (Cadastro, Compras, MRP, Fiscal, Contabilidade) vê na Governança só a coluna dela.
 * Kanban, lista, contador e indicadores usam a mesma regra. Sem banco.
 */
import { statusGroup } from '@/lib/request-status'

export const STAGE_OF_ROLE: Record<string, string> = {
  CADASTRO: 'cadastro',
  COMPRAS: 'compras',
  MRP: 'mrp',
  FISCAL: 'fiscal',
  CONTABILIDADE: 'contabilidade',
}

/** ADMIN, Master, papel de sistema e quem gerencia todas as etapas veem tudo. */
export function seesAllStages(input: { canManageAllStages: boolean; roleName: string | null | undefined; roleType: string | null | undefined }): boolean {
  const role = (input.roleName ?? '').trim().toUpperCase()
  return input.canManageAllStages || role === 'ADMIN' || role === 'MASTER' || input.roleType === 'sistema'
}

/** Etapa a que o usuário fica restrito; null = vê todas. Papel sem etapa conhecida vê todas. */
export function stageScope(roleName: string | null | undefined, seesAll: boolean): string | null {
  if (seesAll) return null
  return STAGE_OF_ROLE[(roleName ?? '').trim().toUpperCase()] ?? null
}

/** Coluna do cartão: rejeitada → Rejeitadas; cancelada → Canceladas; finalizada → última etapa. */
export function kanbanColumnKey(status: string | null | undefined, columnIds: string[]): string {
  const group = statusGroup(status)
  if (group === 'rejected') return 'rejeitado'
  if (group === 'cancelled') return 'cancelado'
  if (group === 'done' && columnIds.length > 0) return columnIds[columnIds.length - 1].toLowerCase()
  return (status ?? '').toLowerCase()
}

/**
 * Solicitações que o usuário vê: as da coluna da etapa dele (status fora do workflow cai na
 * primeira coluna, como no kanban). Etapa que não existe no workflow: nenhuma.
 */
export function requestsInStageScope<T extends { status: string | null | undefined }>(
  requests: T[],
  columnIds: string[],
  scope: string | null
): T[] {
  if (scope == null) return requests
  const ids = columnIds.map((c) => c.toLowerCase())
  if (!ids.includes(scope)) return []
  const known = new Set([...ids, 'rejeitado', 'cancelado'])
  return requests.filter((r) => {
    const key = kanbanColumnKey(r.status, ids)
    return key === scope || (scope === ids[0] && !known.has(key))
  })
}
