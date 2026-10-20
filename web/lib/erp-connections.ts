/** Integrações de saída para o ERP, várias por tenant. Sem dependência de servidor, para validar igual na tela e na rota. */

export const ERP_OPERATIONS = ['criar_material', 'alterar_material', 'eliminar_material'] as const
export type ErpOperation = (typeof ERP_OPERATIONS)[number]

export const ERP_OPERATION_LABEL: Record<ErpOperation, string> = {
  criar_material: 'Criação de material',
  alterar_material: 'Alteração de material',
  eliminar_material: 'Eliminação de material',
}

export const ERP_METHODS = ['POST', 'PATCH', 'DELETE', 'GET'] as const
export type ErpMethod = (typeof ERP_METHODS)[number]

export const DEFAULT_METHOD: Record<ErpOperation, ErpMethod> = {
  criar_material: 'POST',
  alterar_material: 'PATCH',
  eliminar_material: 'DELETE',
}

export const ERP_AUTH_TYPES = ['none', 'api_key', 'bearer', 'basic', 'oauth2_client_credentials'] as const
export type ErpAuthType = (typeof ERP_AUTH_TYPES)[number]

export const ERP_AUTH_LABEL: Record<ErpAuthType, string> = {
  none: 'Sem autenticação',
  api_key: 'Chave no header (API key)',
  bearer: 'Bearer token',
  basic: 'Basic (usuário e senha)',
  oauth2_client_credentials: 'OAuth2 client credentials',
}

export const ERP_SECRET_LABEL: Record<ErpAuthType, string> = {
  none: '',
  api_key: 'Chave',
  bearer: 'Token',
  basic: 'Senha',
  oauth2_client_credentials: 'Client secret',
}

const URL_PLACEHOLDERS = new Set(['{id_erp}', '{id_sistema}'])

/** O que o browser vê. O segredo nunca sai do servidor. */
export type ErpConnectionView = {
  id: number
  name: string
  operation: ErpOperation
  http_method: ErpMethod
  endpoint_url: string
  timeout_ms: number
  auth_type: ErpAuthType
  auth_header_name: string
  auth_username: string
  auth_token_url: string
  auth_scope: string
  is_active: boolean
  has_secret: boolean
  secret_updated_at: string | null
  updated_at: string | null
}

export type ErpConnectionInput = {
  name?: unknown
  operation?: unknown
  http_method?: unknown
  endpoint_url?: unknown
  timeout_ms?: unknown
  auth_type?: unknown
  auth_header_name?: unknown
  auth_username?: unknown
  auth_token_url?: unknown
  auth_scope?: unknown
  /** Vazio mantém o segredo atual. */
  secret?: unknown
}

export type ErpConnectionChanges = {
  name: string
  operation: ErpOperation
  http_method: ErpMethod
  endpoint_url: string
  timeout_ms: number
  auth_type: ErpAuthType
  auth_header_name: string | null
  auth_username: string | null
  auth_token_url: string | null
  auth_scope: string | null
  secret: { action: 'keep' } | { action: 'clear' } | { action: 'set'; value: string }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function checkUrl(value: string, label: string, allowHttp: boolean, errors: string[], placeholders = false) {
  if (value.length > 500) errors.push(`${label} passa de 500 caracteres`)
  const braces = value.match(/\{[^}]*\}/g) ?? []
  if (!placeholders && braces.length) errors.push(`${label} não aceita {…}`)
  const unknown = braces.filter((item) => !URL_PLACEHOLDERS.has(item))
  if (placeholders && unknown.length) errors.push(`${label}: use só {id_erp} ou {id_sistema}`)
  let url: URL
  try {
    url = new URL(value.replace(/\{[^}]*\}/g, 'x'))
  } catch {
    errors.push(`${label} inválida`)
    return
  }
  if (url.protocol === 'https:') return
  if (url.protocol === 'http:' && allowHttp) return
  errors.push(`${label} precisa começar com https://`)
}

/**
 * Valida o formulário. `hasSecret` diz se a integração já tem segredo gravado.
 * `allowHttp` só fora de produção.
 */
export function parseErpConnection(
  body: ErpConnectionInput,
  options: { hasSecret: boolean; allowHttp: boolean },
): { ok: true; value: ErpConnectionChanges } | { ok: false; errors: string[] } {
  const errors: string[] = []

  const name = str(body.name)
  if (!name) errors.push('nome é obrigatório')
  if (name.length > 100) errors.push('nome passa de 100 caracteres')

  const operation = str(body.operation)
  if (!(ERP_OPERATIONS as readonly string[]).includes(operation)) errors.push('operação inválida')

  const method = str(body.http_method).toUpperCase()
  if (!(ERP_METHODS as readonly string[]).includes(method)) errors.push('tipo de integração deve ser POST, PATCH, DELETE ou GET')

  const endpointUrl = str(body.endpoint_url)
  if (!endpointUrl) errors.push('URL do endpoint é obrigatória')
  else checkUrl(endpointUrl, 'URL do endpoint', options.allowHttp, errors, true)

  const timeoutMs = Math.round(Number(body.timeout_ms ?? 15000) / 1000) * 1000
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) {
    errors.push('tempo limite deve ficar entre 1 e 60 segundos')
  }

  const authType = str(body.auth_type) || 'none'
  if (!(ERP_AUTH_TYPES as readonly string[]).includes(authType)) errors.push('tipo de autenticação inválido')
  const type = authType as ErpAuthType

  const headerName = str(body.auth_header_name)
  const username = str(body.auth_username)
  const tokenUrl = str(body.auth_token_url)
  const scope = str(body.auth_scope)

  if (type === 'api_key' && !/^[A-Za-z0-9-]{1,100}$/.test(headerName)) {
    errors.push('nome do header inválido (letras, números e hífen)')
  }
  if (type === 'basic' && !username) errors.push('usuário é obrigatório')
  if (type === 'oauth2_client_credentials') {
    if (!username) errors.push('client ID é obrigatório')
    if (!tokenUrl) errors.push('URL do token é obrigatória')
    else checkUrl(tokenUrl, 'URL do token', options.allowHttp, errors)
  }
  if (username.length > 200) errors.push('usuário / client ID passa de 200 caracteres')
  if (scope.length > 500) errors.push('scope passa de 500 caracteres')

  const newSecret = typeof body.secret === 'string' ? body.secret.trim() : ''
  if (newSecret.length > 4000) errors.push('segredo passa de 4000 caracteres')
  const secret: ErpConnectionChanges['secret'] = type === 'none'
    ? { action: 'clear' }
    : newSecret ? { action: 'set', value: newSecret } : { action: 'keep' }
  if (type !== 'none' && (ERP_AUTH_TYPES as readonly string[]).includes(type) && secret.action === 'keep' && !options.hasSecret) {
    errors.push(`campo "${ERP_SECRET_LABEL[type]}" é obrigatório`)
  }

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    value: {
      name,
      operation: operation as ErpOperation,
      http_method: method as ErpMethod,
      endpoint_url: endpointUrl,
      timeout_ms: timeoutMs,
      auth_type: type,
      auth_header_name: type === 'api_key' ? headerName : null,
      auth_username: type === 'basic' || type === 'oauth2_client_credentials' ? username : null,
      auth_token_url: type === 'oauth2_client_credentials' ? tokenUrl : null,
      auth_scope: type === 'oauth2_client_credentials' ? scope || null : null,
      secret,
    },
  }
}

/** Troca {id_erp} e {id_sistema} pelo código do material. */
export function resolveEndpointUrl(template: string, codes: { idErp?: string | null; idSistema?: string | null }): string {
  return template
    .replace(/\{id_erp\}/g, encodeURIComponent(codes.idErp ?? ''))
    .replace(/\{id_sistema\}/g, encodeURIComponent(codes.idSistema ?? ''))
}
