import { NextResponse } from 'next/server'
import { ERP_OPERATION_LABEL, type ErpConnectionChanges, type ErpConnectionView } from '@/lib/erp-connections'
import { sealSecret, secretBoxReady } from '@/lib/secret-box'

export const CONNECTION_COLUMNS =
  'id, name, operation, http_method, endpoint_url, timeout_ms, auth_type, auth_header_name, auth_username, auth_token_url, auth_scope, is_active, secret_ciphertext, secret_updated_at, updated_at'

export function toConnectionView(row: Record<string, unknown>): ErpConnectionView {
  return {
    id: row.id as number,
    name: String(row.name ?? ''),
    operation: row.operation as ErpConnectionView['operation'],
    http_method: row.http_method as ErpConnectionView['http_method'],
    endpoint_url: String(row.endpoint_url ?? ''),
    timeout_ms: Number(row.timeout_ms ?? 15000),
    auth_type: (row.auth_type as ErpConnectionView['auth_type']) ?? 'none',
    auth_header_name: (row.auth_header_name as string | null) ?? 'x-api-key',
    auth_username: (row.auth_username as string | null) ?? '',
    auth_token_url: (row.auth_token_url as string | null) ?? '',
    auth_scope: (row.auth_scope as string | null) ?? '',
    is_active: row.is_active === true,
    has_secret: typeof row.secret_ciphertext === 'string' && row.secret_ciphertext.length > 0,
    secret_updated_at: (row.secret_updated_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  }
}

/** Colunas a gravar. Devolve erro se precisar cifrar e o servidor estiver sem chave. */
export function connectionRow(
  changes: ErpConnectionChanges,
  userId: string,
  hadSecret: boolean,
): { ok: true; row: Record<string, unknown> } | { ok: false; response: NextResponse } {
  const { secret, ...fields } = changes
  const now = new Date().toISOString()
  const row: Record<string, unknown> = { ...fields, updated_at: now, updated_by: userId }
  if (secret.action === 'set') {
    if (!secretBoxReady()) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'INTEGRATION_SECRET_KEY não configurada no servidor. Sem ela o segredo não é gravado.' },
          { status: 503 },
        ),
      }
    }
    row.secret_ciphertext = sealSecret(secret.value)
    row.secret_updated_at = now
  }
  if (secret.action === 'clear') {
    row.secret_ciphertext = null
    row.secret_updated_at = hadSecret ? now : null
  }
  return { ok: true, row }
}

export function secretAudit(changes: ErpConnectionChanges) {
  return changes.secret.action === 'set' ? 'trocado' : changes.secret.action === 'clear' ? 'removido' : 'mantido'
}

export function activeConflict(operation: string) {
  const label = ERP_OPERATION_LABEL[operation as keyof typeof ERP_OPERATION_LABEL] ?? operation
  return NextResponse.json(
    { error: `Já existe uma integração ativa de ${label.toLowerCase()}. Desative-a antes.` },
    { status: 409 },
  )
}
