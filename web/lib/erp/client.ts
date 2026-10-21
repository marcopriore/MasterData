import { supabaseAdmin } from '@/lib/supabase/admin'
import { recordIntegrationLog } from '@/lib/integration-logs'
import { openSecret } from '@/lib/secret-box'
import { resolveEndpointUrl, type ErpAuthType, type ErpMethod, type ErpOperation } from '@/lib/erp-connections'
import { readCode, readMessage, type ErpPayload } from './payload'

type Connection = {
  id: number
  operation: ErpOperation
  http_method: ErpMethod
  endpoint_url: string
  timeout_ms: number
  auth_type: ErpAuthType
  auth_header_name: string | null
  auth_username: string | null
  auth_token_url: string | null
  auth_scope: string | null
  response_code_field: string | null
  secret_ciphertext: string | null
}

export type ErpCallResult =
  | { status: 'not_configured' }
  | { status: 'ok'; statusCode: number; code: string | null; body: unknown }
  | { status: 'error'; statusCode: number | null; message: string }

const tokenCache = new Map<number, { token: string; expiresAt: number; fingerprint: string }>()

/** A integração ativa do tenant para a operação, ou null. */
export async function activeConnection(tenantId: number, operation: ErpOperation): Promise<Connection | null> {
  const { data, error } = await supabaseAdmin
    .from('tenant_erp_connections')
    .select('id, operation, http_method, endpoint_url, timeout_ms, auth_type, auth_header_name, auth_username, auth_token_url, auth_scope, response_code_field, secret_ciphertext')
    .eq('tenant_id', tenantId)
    .eq('operation', operation)
    .eq('is_active', true)
    .maybeSingle()
  if (error) {
    console.error('activeConnection:', error.message)
    return null
  }
  return data as Connection | null
}

async function oauthToken(conn: Connection, secret: string, signal: AbortSignal): Promise<string> {
  const fingerprint = `${conn.auth_token_url}|${conn.auth_username}|${conn.auth_scope}|${conn.secret_ciphertext}`
  const cached = tokenCache.get(conn.id)
  if (cached && cached.fingerprint === fingerprint && cached.expiresAt > Date.now()) return cached.token

  const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: conn.auth_username ?? '', client_secret: secret })
  if (conn.auth_scope) form.set('scope', conn.auth_scope)
  const res = await fetch(conn.auth_token_url!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form,
    signal,
  })
  const json = await res.json().catch(() => null) as { access_token?: string; expires_in?: number } | null
  if (!res.ok || !json?.access_token) throw new Error(`token OAuth2 recusado (${res.status})`)
  const ttl = Math.max(30, Number(json.expires_in ?? 300) - 30) * 1000
  tokenCache.set(conn.id, { token: json.access_token, expiresAt: Date.now() + ttl, fingerprint })
  return json.access_token
}

async function authHeaders(conn: Connection, signal: AbortSignal): Promise<Record<string, string>> {
  if (conn.auth_type === 'none') return {}
  if (!conn.secret_ciphertext) throw new Error('integração sem segredo gravado')
  const secret = openSecret(conn.secret_ciphertext)
  if (conn.auth_type === 'api_key') return { [conn.auth_header_name || 'x-api-key']: secret }
  if (conn.auth_type === 'bearer') return { Authorization: `Bearer ${secret}` }
  if (conn.auth_type === 'basic') {
    return { Authorization: `Basic ${Buffer.from(`${conn.auth_username ?? ''}:${secret}`).toString('base64')}` }
  }
  return { Authorization: `Bearer ${await oauthToken(conn, secret, signal)}` }
}

/**
 * Chama a integração ativa da operação e grava uma linha de saída no monitor.
 * O corpo, o segredo e o token não são gravados.
 */
export async function callErp(input: {
  tenantId: number
  operation: ErpOperation
  payload: ErpPayload
  codes: { idErp: string | null; idSistema: string | null }
}): Promise<ErpCallResult> {
  const conn = await activeConnection(input.tenantId, input.operation)
  if (!conn) return { status: 'not_configured' }

  const started = Date.now()
  const url = resolveEndpointUrl(conn.endpoint_url, input.codes)
  let path = url
  try {
    path = new URL(url).pathname
  } catch {
    // URL inválida cai no erro do fetch abaixo
  }

  let result: ErpCallResult
  try {
    const signal = AbortSignal.timeout(conn.timeout_ms)
    const headers = { Accept: 'application/json', ...(await authHeaders(conn, signal)) }
    const hasBody = conn.http_method !== 'GET'
    const res = await fetch(url, {
      method: conn.http_method,
      headers: hasBody ? { ...headers, 'Content-Type': 'application/json' } : headers,
      body: hasBody ? JSON.stringify(input.payload) : undefined,
      signal,
    })
    const raw = await res.text()
    let body: unknown = null
    try {
      body = raw ? JSON.parse(raw) : null
    } catch {
      body = null
    }
    result = res.ok
      ? { status: 'ok', statusCode: res.status, code: readCode(body, conn.response_code_field || 'productId'), body }
      : { status: 'error', statusCode: res.status, message: readMessage(body, raw) || `ERP respondeu ${res.status}` }
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    result = {
      status: 'error',
      statusCode: null,
      message: timedOut
        ? `ERP não respondeu em ${Math.round(conn.timeout_ms / 1000)} s`
        : `falha ao chamar o ERP: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500),
    }
  }

  await recordIntegrationLog({
    tenantId: input.tenantId,
    direction: 'outbound',
    system: 'erp',
    action: input.operation,
    method: conn.http_method,
    path,
    statusCode: result.statusCode,
    success: result.status === 'ok',
    durationMs: Date.now() - started,
    errorMessage: result.status === 'error' ? result.message : null,
    detail: input.codes.idSistema ?? input.codes.idErp,
  })
  return result
}
