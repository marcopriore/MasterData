import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { recordIntegrationLog } from '@/lib/integration-logs'
import { hashApiKey, looksLikeApiKey } from './api-key'

const MAX_BODY_BYTES = 1024 * 1024

export type ApiClient = { id: number; tenantId: number; name: string }

export type ApiOutcome = {
  status: number
  body: unknown
  detail?: string | null
  error?: string | null
}

export function apiError(status: number, message: string, details?: string[]): ApiOutcome {
  return {
    status,
    body: details?.length ? { erro: message, detalhes: details } : { erro: message },
    error: details?.length ? `${message}: ${details.slice(0, 5).join('; ')}` : message,
  }
}

async function authenticate(request: Request): Promise<ApiClient | null> {
  const key = request.headers.get('x-api-key')?.trim()
  if (!looksLikeApiKey(key)) return null

  const { data } = await supabaseAdmin
    .from('api_clients')
    .select('id, tenant_id, name, is_active, tenants(is_active)')
    .eq('key_hash', hashApiKey(key))
    .maybeSingle()
  if (!data || data.is_active !== true) return null
  const tenant = Array.isArray(data.tenants) ? data.tenants[0] : data.tenants
  if ((tenant as { is_active?: boolean } | null)?.is_active === false) return null

  void supabaseAdmin
    .from('api_clients')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => undefined)

  return { id: data.id as number, tenantId: data.tenant_id as number, name: data.name as string }
}

/** Lê o corpo JSON com limite de 1 MB. */
export async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; outcome: ApiOutcome }> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) return { ok: false, outcome: apiError(413, 'corpo passa de 1 MB') }
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return { ok: false, outcome: apiError(413, 'corpo passa de 1 MB') }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false, outcome: apiError(400, 'JSON inválido') }
  }
}

/**
 * Autentica pela x-api-key, executa a ação e grava uma linha em integration_logs.
 * O corpo da requisição e a chave não são gravados.
 */
export async function handleApiCall(
  request: Request,
  action: string,
  run: (client: ApiClient) => Promise<ApiOutcome>,
): Promise<NextResponse> {
  const started = Date.now()
  const path = new URL(request.url).pathname
  const client = await authenticate(request)

  let outcome: ApiOutcome
  if (!client) {
    outcome = apiError(401, 'x-api-key ausente ou inválida')
  } else {
    try {
      outcome = await run(client)
    } catch (err) {
      console.error(`material-api ${action}:`, err)
      outcome = apiError(500, 'erro interno')
    }
  }

  await recordIntegrationLog({
    tenantId: client?.tenantId ?? null,
    apiClientId: client?.id ?? null,
    direction: 'inbound',
    system: 'externo',
    action,
    method: request.method,
    path,
    statusCode: outcome.status,
    success: outcome.status < 400,
    durationMs: Date.now() - started,
    errorMessage: outcome.status >= 400 ? outcome.error ?? null : null,
    detail: outcome.detail ?? null,
  })

  return NextResponse.json(outcome.body, { status: outcome.status })
}

/** Busca o material da empresa pelo código interno e, se não achar, pelo código ERP. */
export async function findMaterialByCode(tenantId: number, code: string, columns: string) {
  for (const column of ['id_sistema', 'id_erp']) {
    const { data, error } = await supabaseAdmin
      .from('material_database')
      .select(columns)
      .eq('tenant_id', tenantId)
      .eq(column, code)
      .maybeSingle()
    if (error) throw error
    if (data) return data as unknown as Record<string, unknown>
  }
  return null
}

export function validCode(code: string | undefined): code is string {
  return typeof code === 'string' && /^[A-Za-z0-9._\-/]{1,50}$/.test(code)
}

export async function findPdm(tenantId: number, code: string) {
  const { data } = await supabaseAdmin
    .from('pdm_templates')
    .select('id, name, internal_code, is_active')
    .eq('tenant_id', tenantId)
    .eq('internal_code', code)
    .maybeSingle()
  return data as { id: number; name: string; internal_code: string; is_active: boolean } | null
}
