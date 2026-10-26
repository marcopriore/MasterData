import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from './env'

const opts = { auth: { autoRefreshToken: false, persistSession: false } }

/** Service role: só para montar e conferir dados do tenant de teste. */
export const admin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, opts)

async function must<T>(promise: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await promise
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

export { must }

/** Apaga tudo do tenant de teste (ordem respeita as FKs RESTRICT de solicitação → PDM/workflow). */
export async function deleteTenant(tenantId: number) {
  const { data: users } = await admin.from('users').select('id').eq('tenant_id', tenantId)
  const userIds = (users ?? []).map((u) => u.id as string)

  for (const table of ['request_history', 'notifications', 'material_database', 'material_requests']) {
    await admin.from(table).delete().eq('tenant_id', tenantId)
  }
  for (const table of ['pdm_templates', 'workflow_config', 'workflow_header', 'value_dictionary_dismissed', 'value_dictionary', 'field_dictionary', 'system_logs', 'integration_logs']) {
    await admin.from(table).delete().eq('tenant_id', tenantId)
  }
  if (userIds.length) {
    await admin.from('user_role_groups').delete().in('user_id', userIds)
    await admin.from('user_permission_grants').delete().in('user_id', userIds)
    await admin.from('user_notification_prefs').delete().in('user_id', userIds)
    await admin.from('users').delete().in('id', userIds)
    for (const id of userIds) await admin.auth.admin.deleteUser(id)
  }
  await admin.from('roles').delete().eq('tenant_id', tenantId)
  const { error } = await admin.from('tenants').delete().eq('id', tenantId)
  if (error) throw new Error(`não apagou o tenant ${tenantId}: ${error.message}`)
}
