import { queryOptions } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SERVER_FRESH_MS } from '@/lib/query/client'
import {
  listActivePdms,
  listRequests,
  listWorkflows,
  listWorkflowSteps,
  requestsFinishedAt,
} from '@/lib/data/governance'
import type { RequestErpInfo } from '@/lib/request-erp-state'

/** Janela padrão das fechadas no quadro (o filtro da tela começa nela). */
export const DEFAULT_CLOSED_DAYS = 90

/**
 * Chaves por domínio: invalidar ['requests'] atualiza o quadro, a situação no ERP e as datas de conclusão.
 * O cache é por usuário e empresa (components/query-provider), então as chaves não repetem o escopo.
 */
export const governanceKeys = {
  workflows: ['workflows'] as const,
  workflowSteps: (workflowId: number) => ['workflows', workflowId, 'steps'] as const,
  activePdms: ['pdms', 'active'] as const,
  board: (workflowId: number, closedDays: number | null) => ['requests', 'board', workflowId, closedDays] as const,
  erpStatus: (requestIds: number[]) => ['requests', 'erp-status', requestIds] as const,
  finishedAt: (requestIds: number[]) => ['requests', 'finished-at', requestIds] as const,
}

export const workflowsQuery = (db: SupabaseClient) => queryOptions({
  queryKey: governanceKeys.workflows,
  queryFn: () => listWorkflows(db),
  staleTime: SERVER_FRESH_MS,
})

export const workflowStepsQuery = (db: SupabaseClient, workflowId: number) => queryOptions({
  queryKey: governanceKeys.workflowSteps(workflowId),
  queryFn: () => listWorkflowSteps(db, workflowId),
  staleTime: SERVER_FRESH_MS,
})

export const activePdmsQuery = (db: SupabaseClient, tenantId: number) => queryOptions({
  queryKey: governanceKeys.activePdms,
  queryFn: () => listActivePdms(db, tenantId),
  staleTime: SERVER_FRESH_MS,
})

export const boardRequestsQuery = (db: SupabaseClient, workflowId: number, closedDays: number | null) => queryOptions({
  queryKey: governanceKeys.board(workflowId, closedDays),
  queryFn: () => listRequests(db, { workflowId, closedSinceDays: closedDays }),
  staleTime: SERVER_FRESH_MS,
})

/** Quem carrega a situação muda de lado: rota /api no navegador, função direta no servidor. */
export const erpStatusQuery = (requestIds: number[], load: (ids: number[]) => Promise<RequestErpInfo[]>) => queryOptions({
  queryKey: governanceKeys.erpStatus(requestIds),
  queryFn: () => (requestIds.length ? load(requestIds) : Promise.resolve([])),
  staleTime: SERVER_FRESH_MS,
})

export const finishedAtQuery = (db: SupabaseClient, requestIds: number[]) => queryOptions({
  queryKey: governanceKeys.finishedAt(requestIds),
  queryFn: () => requestsFinishedAt(db, requestIds),
  staleTime: SERVER_FRESH_MS,
})
