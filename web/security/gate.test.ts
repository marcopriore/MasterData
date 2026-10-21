/**
 * Gate de segurança: roda com `npm test` e no CI. Lê o código e quebra quando uma regra de proteção some.
 * Exceções precisam de motivo aqui mesmo.
 */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyPath, safeRedirectTarget } from '@/lib/route-guard'

const WEB = path.resolve(__dirname, '..')
const REPO = path.resolve(WEB, '..')

function walk(dir: string, match: (file: string) => boolean): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, match))
    else if (match(full)) out.push(full)
  }
  return out
}

const rel = (file: string) => path.relative(WEB, file).split(path.sep).join('/')
const read = (file: string) => readFileSync(file, 'utf8')

function routePath(file: string) {
  return '/' + rel(file).replace(/^app\//, '').replace(/\/route\.ts$/, '')
}

const SESSION_GUARDS = /auth\.getUser\(|getCallerAccess\(|requireMasterTenant\(|getSupportContext\(/

describe('rotas de API', () => {
  const routes = walk(path.join(WEB, 'app', 'api'), (file) => file.endsWith(`${path.sep}route.ts`))

  it('existem rotas para checar', () => {
    expect(routes.length).toBeGreaterThan(20)
  })

  it('toda rota tem a guarda do seu tipo', () => {
    const missing: string[] = []
    for (const file of routes) {
      const source = read(file)
      const kind = classifyPath(routePath(file))
      const ok =
        kind === 'api-key' ? source.includes('handleApiCall(')
        : kind === 'api-webhook' ? source.includes('verifyWebhookSecret(')
        : SESSION_GUARDS.test(source)
      if (!ok) missing.push(`${rel(file)} (${kind})`)
    }
    expect(missing, 'rota sem autenticação').toEqual([])
  })

  it('rotas /api/v1 não aceitam sessão no lugar da chave', () => {
    const v1 = routes.filter((file) => classifyPath(routePath(file)) === 'api-key')
    for (const file of v1) expect(read(file), rel(file)).not.toMatch(SESSION_GUARDS)
  })
})

describe('proxy (middleware)', () => {
  it('classifica cada caminho', () => {
    expect(classifyPath('/admin/users')).toBe('page')
    expect(classifyPath('/')).toBe('page')
    expect(classifyPath('/login')).toBe('login')
    expect(classifyPath('/api/admin/users')).toBe('api-session')
    expect(classifyPath('/api/v1/materials')).toBe('api-key')
    expect(classifyPath('/api/v1')).toBe('api-key')
    expect(classifyPath('/api/v10/x')).toBe('api-session')
    expect(classifyPath('/api/support/webhook')).toBe('api-webhook')
    expect(classifyPath('/api/support/webhook/x')).toBe('api-session')
    expect(classifyPath('/loginx')).toBe('page')
  })

  it('o matcher cobre /admin e /api e deixa só arquivos estáticos de fora', async () => {
    const { config } = await import('@/proxy')
    const matcher = new RegExp(`^${config.matcher[0]}$`)
    for (const covered of ['/', '/admin/users', '/admin/tenants/2', '/api/admin/users', '/api/v1/materials', '/database']) {
      expect(matcher.test(covered), covered).toBe(true)
    }
    for (const skipped of ['/_next/static/chunk.js', '/_next/image', '/favicon.ico', '/logo.png']) {
      expect(matcher.test(skipped), skipped).toBe(false)
    }
  })

  it('depois do login só volta para página interna', () => {
    expect(safeRedirectTarget('/governance')).toBe('/governance')
    expect(safeRedirectTarget('https://site-falso.com')).toBe('/')
    expect(safeRedirectTarget('//site-falso.com')).toBe('/')
    expect(safeRedirectTarget('/\\site-falso.com')).toBe('/')
    expect(safeRedirectTarget('/api/admin/users')).toBe('/')
    expect(safeRedirectTarget(null)).toBe('/')
  })
})

describe('segredos fora do browser', () => {
  const sources = ['app', 'components', 'contexts', 'hooks', 'lib']
    .flatMap((dir) => walk(path.join(WEB, dir), (file) => /\.(ts|tsx)$/.test(file) && !/\.test\.ts$/.test(file)))
  const isClient = (source: string) => /^\s*['"]use client['"]/.test(source)
  const SERVER_ONLY_IMPORT = /from\s+['"]@\/lib\/(supabase\/admin|secret-box|material-api\/server|erp\/client|erp\/integrate|master-access|server-access|dispatch-request-notice|email\/send-email|axisdesk\/client)['"]/

  it('arquivo de browser não importa módulo com chave de serviço ou segredo', () => {
    const leaks = sources.filter((file) => {
      const source = read(file)
      return isClient(source) && SERVER_ONLY_IMPORT.test(source)
    })
    expect(leaks.map(rel)).toEqual([])
  })

  it('arquivo de browser só lê variável NEXT_PUBLIC_', () => {
    const leaks = sources.filter((file) => {
      const source = read(file)
      return isClient(source) && /process\.env\.(?!NEXT_PUBLIC_|NODE_ENV\b)[A-Z_]+/.test(source)
    })
    expect(leaks.map(rel)).toEqual([])
  })

  it('a chave de serviço só aparece no cliente admin', () => {
    const users = sources.filter((file) => read(file).includes('SUPABASE_SERVICE_ROLE_KEY'))
    expect(users.map(rel)).toEqual(['lib/supabase/admin.ts'])
  })
})

describe('banco', () => {
  const migrations = walk(path.join(REPO, 'supabase', 'migrations'), (file) => file.endsWith('.sql'))
  const sql = migrations.map(read).join('\n')
  /** Tabelas sem RLS de propósito, com o motivo. */
  const RLS_EXCEPTIONS: Record<string, string> = {}

  it('toda tabela criada tem RLS ligado', () => {
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/gi)].map((match) => match[1].toLowerCase())
    expect(new Set(tables).size).toBeGreaterThan(15)
    const dropped = new Set([...sql.matchAll(/DROP TABLE (?:IF EXISTS )?public\.(\w+)/gi)].map((match) => match[1].toLowerCase()))
    const withoutRls = [...new Set(tables)]
      .filter((table) => !dropped.has(table) && !RLS_EXCEPTIONS[table])
      .filter((table) => !new RegExp(`ALTER TABLE (?:public\\.)?${table} ENABLE ROW LEVEL SECURITY`, 'i').test(sql))
    expect(withoutRls).toEqual([])
  })

  it('tabelas só do servidor não abrem para anon e authenticated', () => {
    for (const table of ['api_clients', 'tenant_erp_connections']) {
      expect(sql, table).toMatch(new RegExp(`REVOKE ALL ON public\\.${table} FROM anon, authenticated`, 'i'))
    }
  })
})

describe('repositório', () => {
  function tracked(): string[] | null {
    try {
      return execSync('git ls-files', { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).filter(Boolean)
    } catch {
      return null
    }
  }
  const files = tracked()

  it.skipIf(!files)('nenhum .env versionado', () => {
    const envs = files!.filter((file) => /(^|\/)\.env(\.|$)/.test(file) && !/\.env\.example$/.test(file))
    expect(envs).toEqual([])
  })

  it.skipIf(!files)('nenhuma chave real versionada', () => {
    const patterns = [
      { name: 'chave de API do PRO-MAT', re: /pmat_[A-Za-z0-9_-]{30,}/ },
      { name: 'JWT do Supabase', re: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJ[A-Za-z0-9_-]{20,}/ },
      { name: 'chave secreta do Supabase', re: /sb_secret_[A-Za-z0-9_-]{20,}/ },
      { name: 'chave do Resend', re: /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}/ },
    ]
    const hits: string[] = []
    for (const file of files!) {
      if (!/\.(ts|tsx|js|mjs|json|sql|md|toml|ya?ml)$/.test(file) || file.endsWith('package-lock.json')) continue
      const full = path.join(REPO, file)
      if (!existsSync(full)) continue
      const source = read(full)
      for (const { name, re } of patterns) if (re.test(source)) hits.push(`${file}: ${name}`)
    }
    expect(hits).toEqual([])
  })
})
