import { supabaseAdmin } from '@/lib/supabase/admin'

export { integrationStatusTone } from '@/lib/integration-log-status'

export type IntegrationDirection = 'outbound' | 'inbound'

export type IntegrationLogInput = {
  tenantId?: number | null
  apiClientId?: number | null
  direction: IntegrationDirection
  system: string
  action: string
  method: string
  path: string
  statusCode?: number | null
  success: boolean
  durationMs?: number | null
  errorMessage?: string | null
  detail?: string | null
}

export async function recordIntegrationLog(input: IntegrationLogInput): Promise<void> {
  const tenantId = Number.isFinite(input.tenantId) ? input.tenantId : null
  const { error } = await supabaseAdmin.from('integration_logs').insert({
    tenant_id: tenantId,
    ...(input.apiClientId != null ? { api_client_id: input.apiClientId } : {}),
    direction: input.direction,
    system: input.system,
    action: input.action,
    method: input.method,
    path: input.path.slice(0, 300),
    status_code: input.statusCode ?? null,
    success: input.success,
    duration_ms: input.durationMs ?? null,
    error_message: input.errorMessage ? input.errorMessage.slice(0, 500) : null,
    detail: input.detail ? input.detail.slice(0, 200) : null,
  })
  if (error) console.error('recordIntegrationLog:', error.message)
}
