import { randomBytes } from 'crypto'
import { createServer, type IncomingMessage, type Server } from 'http'
import type { AddressInfo } from 'net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.INTEGRATION_SECRET_KEY = randomBytes(32).toString('base64')

let connection: Record<string, unknown> | null = null
const logs: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/admin', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: connection, error: null }),
  }
  return { supabaseAdmin: { from: () => chain } }
})

vi.mock('@/lib/integration-logs', () => ({
  recordIntegrationLog: async (row: Record<string, unknown>) => { logs.push(row) },
}))

const { callErp } = await import('./client')
const { sealSecret } = await import('@/lib/secret-box')

type Seen = { method?: string; url?: string; headers: IncomingMessage['headers']; body: string }
const seen: Seen[] = []
let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body })
      if (req.url === '/token') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ access_token: 'tok-123', expires_in: 3600 }))
      } else if (req.url?.startsWith('/lento')) {
        setTimeout(() => res.end('{}'), 3000)
      } else if (req.url?.startsWith('/recusa')) {
        res.writeHead(422, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'NCM inválido' } }))
      } else {
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ data: { productId: 91 } }))
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => { server.close() })

beforeEach(() => {
  seen.length = 0
  logs.length = 0
})

function conn(extra: Record<string, unknown>) {
  return {
    id: Math.floor(Math.random() * 1e6),
    operation: 'criar_material',
    http_method: 'POST',
    endpoint_url: `${base}/materiais`,
    timeout_ms: 1000,
    auth_type: 'none',
    auth_header_name: null,
    auth_username: null,
    auth_token_url: null,
    auth_scope: null,
    response_code_field: 'data.productId',
    secret_ciphertext: null,
    ...extra,
  }
}

const call = (path = 'MDM-000001') => callErp({
  tenantId: 2,
  operation: 'criar_material',
  payload: { contentID: path, descriptions: { language: 'pt', name: 'X' } },
  codes: { idErp: '91', idSistema: path },
})

describe('chamada ao ERP', () => {
  it('sem integração ativa não chama nada', async () => {
    connection = null
    expect(await call()).toEqual({ status: 'not_configured' })
    expect(seen).toHaveLength(0)
  })

  it('envia o JSON com a chave no header e lê o código', async () => {
    connection = conn({ auth_type: 'api_key', auth_header_name: 'x-erp-key', secret_ciphertext: sealSecret('chave-erp') })
    const result = await call()
    expect(result).toMatchObject({ status: 'ok', statusCode: 201, code: '91' })
    expect(seen[0].headers['x-erp-key']).toBe('chave-erp')
    expect(JSON.parse(seen[0].body)).toMatchObject({ contentID: 'MDM-000001' })
    expect(logs[0]).toMatchObject({ direction: 'outbound', system: 'erp', action: 'criar_material', statusCode: 201, success: true })
    expect(JSON.stringify(logs[0])).not.toContain('chave-erp')
  })

  it('Basic usa usuário e senha', async () => {
    connection = conn({ auth_type: 'basic', auth_username: 'sap', secret_ciphertext: sealSecret('senha') })
    await call()
    expect(seen[0].headers.authorization).toBe(`Basic ${Buffer.from('sap:senha').toString('base64')}`)
  })

  it('OAuth2 pede o token e reaproveita na chamada seguinte', async () => {
    connection = conn({
      auth_type: 'oauth2_client_credentials',
      auth_username: 'cliente',
      auth_token_url: `${base}/token`,
      auth_scope: 'materiais',
      secret_ciphertext: sealSecret('segredo'),
    })
    await call()
    await call()
    const tokenCalls = seen.filter((item) => item.url === '/token')
    expect(tokenCalls).toHaveLength(1)
    expect(tokenCalls[0].body).toContain('grant_type=client_credentials')
    expect(seen.filter((item) => item.url === '/materiais').every((item) => item.headers.authorization === 'Bearer tok-123')).toBe(true)
  })

  it('troca {id_erp} na URL e manda DELETE com corpo', async () => {
    connection = conn({ http_method: 'DELETE', endpoint_url: `${base}/materiais/{id_erp}` })
    await call()
    expect(seen[0]).toMatchObject({ method: 'DELETE', url: '/materiais/91' })
  })

  it('recusa do ERP volta com a mensagem dele', async () => {
    connection = conn({ endpoint_url: `${base}/recusa` })
    expect(await call()).toEqual({ status: 'error', statusCode: 422, message: 'NCM inválido' })
    expect(logs[0]).toMatchObject({ success: false, statusCode: 422, errorMessage: 'NCM inválido' })
  })

  it('para no tempo limite', async () => {
    connection = conn({ endpoint_url: `${base}/lento`, timeout_ms: 1000 })
    expect(await call()).toEqual({ status: 'error', statusCode: null, message: 'ERP não respondeu em 1 s' })
  })
})
