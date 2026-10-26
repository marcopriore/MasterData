#!/usr/bin/env node
/**
 * Conferência de produção do PRO-MAT. Não altera dados; o teste de /api/v1 sem chave
 * (só com --live) gera uma linha de chamada recusada no monitor de integrações.
 *
 *   npm run prd:check                                   # variáveis + Supabase (.env.production.local)
 *   npm run prd:check -- --env-file=.env.local          # outro arquivo
 *   npm run prd:check -- --live                         # também testa o site em NEXT_PUBLIC_APP_URL
 *   npm run prd:check -- --live --url=https://app.x.com.br
 *
 * Sai com código 1 se algum item obrigatório falhar.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveCname, resolve4 } from 'node:dns/promises'
import { createClient } from '@supabase/supabase-js'

const args = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...v] = a.slice(2).split('=')
    return [k, v.length ? v.join('=') : true]
  })
)

let failures = 0
let warnings = 0
const ok = (msg) => console.log(`  OK    ${msg}`)
const fail = (msg) => { failures += 1; console.log(`  FALHA ${msg}`) }
const warn = (msg) => { warnings += 1; console.log(`  AVISO ${msg}`) }
const section = (title) => console.log(`\n${title}`)

function loadEnv(file) {
  const env = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/)
    if (!m) continue
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    env[m[1]] = val
  }
  return env
}

function jwtRole(key) {
  const parts = key.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role ?? null
  } catch {
    return null
  }
}

function checkVariables(env) {
  section('1. Variáveis')
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) ok('NEXT_PUBLIC_SUPABASE_URL')
  else fail('NEXT_PUBLIC_SUPABASE_URL ausente ou fora do formato https://<projeto>.supabase.co')

  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const service = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!anon) fail('NEXT_PUBLIC_SUPABASE_ANON_KEY ausente')
  if (!service) fail('SUPABASE_SERVICE_ROLE_KEY ausente')
  if (anon && service) {
    if (anon === service) fail('anon e service role são iguais')
    else if (service.startsWith('sb_publishable_') || anon.startsWith('sb_secret_')) fail('chaves trocadas: a secreta está no lugar da pública')
    else if (jwtRole(anon) === 'service_role') fail('NEXT_PUBLIC_SUPABASE_ANON_KEY é a service role — ela iria para o navegador')
    else if (jwtRole(service) && jwtRole(service) !== 'service_role') fail('SUPABASE_SERVICE_ROLE_KEY não é a chave service_role')
    else ok('chaves do Supabase (pública e secreta no lugar certo)')
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? ''
  if (!appUrl) fail('NEXT_PUBLIC_APP_URL ausente (links dos e-mails apontariam para o endereço da requisição)')
  else if (!appUrl.startsWith('https://')) fail(`NEXT_PUBLIC_APP_URL precisa ser https em produção (${appUrl})`)
  else if (appUrl.endsWith('/')) fail('NEXT_PUBLIC_APP_URL não deve terminar com /')
  else ok(`NEXT_PUBLIC_APP_URL = ${appUrl}`)

  const secret = env.INTEGRATION_SECRET_KEY ?? ''
  if (!secret) fail('INTEGRATION_SECRET_KEY ausente (integrações com ERP não salvam segredo)')
  else if (Buffer.from(secret, 'base64').length !== 32) fail('INTEGRATION_SECRET_KEY precisa ter 32 bytes em base64')
  else ok('INTEGRATION_SECRET_KEY (32 bytes)')

  if (env.RESEND_API_KEY) {
    ok('RESEND_API_KEY definida')
    const from = env.RESEND_FROM_EMAIL ?? ''
    if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) fail('RESEND_FROM_EMAIL precisa ser só o endereço (ex.: noreply@seudominio.com.br)')
    else if (/axisstrategy\.com\.br$/i.test(from)) warn(`RESEND_FROM_EMAIL usa ${from}; confirme que esse domínio está verificado na sua conta Resend`)
    else ok(`RESEND_FROM_EMAIL = ${from} (o domínio precisa estar verificado no Resend)`)
  } else {
    warn('RESEND_API_KEY vazia: o sino funciona, e-mail não sai')
  }

  if (env.AXISDESK_API_KEY) {
    ok('AXISDESK_API_KEY definida')
    const hook = env.AXISDESK_WEBHOOK_SECRET ?? ''
    if (hook.length < 32) fail('AXISDESK_WEBHOOK_SECRET ausente ou curto (use npm run secrets)')
    else ok('AXISDESK_WEBHOOK_SECRET')
  } else {
    warn('AXISDESK_API_KEY vazia: a tela de Suporte não abre chamados')
  }

  for (const key of Object.keys(env)) {
    if (key.startsWith('NEXT_PUBLIC_') && /SERVICE|SECRET|RESEND|AXISDESK|INTEGRATION/.test(key)) {
      fail(`${key} tem prefixo NEXT_PUBLIC_ e iria para o navegador`)
    }
  }
}

async function checkSupabase(env) {
  section('2. Supabase')
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  if (!url || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    fail('sem URL ou chaves, conferência do Supabase pulada')
    return
  }

  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY } })
    if (!res.ok) fail(`Auth respondeu ${res.status} (chave pública inválida?)`)
    else {
      const settings = await res.json()
      if (settings.disable_signup === true) ok('cadastro público desligado (usuários só entram pelo admin)')
      else fail('cadastro público LIGADO: qualquer pessoa cria conta. Desligue em Authentication → Sign In / Providers → "Allow new users to sign up"')
    }
  } catch (err) {
    fail(`não conectou no Supabase: ${err.message}`)
    return
  }

  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  const tables = [
    ['tenants', 'id', '001'],
    ['material_database', 'detailed_description', '017'],
    ['user_role_groups', 'user_id', '018'],
    ['integration_logs', 'id', '019'],
    ['api_clients', 'id', '020'],
    ['tenant_erp_connections', 'response_code_field', '022/023'],
  ]
  for (const [table, column, migration] of tables) {
    const { error } = await admin.from(table).select(column).limit(1)
    if (error) fail(`migration ${migration}: ${table}.${column} não responde (${error.message})`)
    else ok(`migration ${migration}: ${table}.${column}`)
  }

  const { count: rolesWithoutAttend, error: rolesErr } = await admin
    .from('roles')
    .select('id', { count: 'exact', head: true })
    .is('permissions->can_attend', null)
  if (rolesErr) fail(`migration 025: não consultou papéis (${rolesErr.message})`)
  else if (rolesWithoutAttend) fail(`migration 025: ${rolesWithoutAttend} papel(éis) sem can_attend — rode supabase/migrations/025_can_attend_default.sql`)
  else ok('migration 025: todo papel tem can_attend')

  const { error: moveErr } = await admin.rpc('move_request_stage', { p_request_id: -1, p_status_key: '-' })
  if (moveErr && /não encontrada/i.test(moveErr.message)) ok('migration 026: move_request_stage')
  else fail(`migration 026: move_request_stage não responde como esperado (${moveErr?.message ?? 'sem erro'}) — rode supabase/migrations/026_move_request_stage.sql`)

  const rpcs = [
    ['027', 'pdm_material_counts', {}],
    ['027', 'material_duplicate_candidates', { p_ids: [] }],
    ['028', 'resubmit_request', { p_request_id: -1, p_pdm_id: -1, p_technical_attributes: {}, p_generated_description: '' }],
    ['029', 'report_material_base', {}],
    ['030', 'erp_text', { p: 'teste' }],
    ['031', 'tenant_overview', {}],
    ['032', 'require_permission', { p_key: 'can_view_logs' }],
  ]
  for (const [migration, fn, params] of rpcs) {
    const { error: rpcErr } = await admin.rpc(fn, params)
    // Sem a função o PostgREST responde PGRST202; "não encontrada" é a resposta esperada do resubmit com id -1.
    if (rpcErr && (rpcErr.code === 'PGRST202' || /could not find the function/i.test(rpcErr.message))) {
      fail(`migration ${migration}: função ${fn} não existe — rode supabase/migrations/${migration}_*.sql`)
    } else {
      ok(`migration ${migration}: ${fn}`)
    }
  }

  // Sem login (só a chave pública do navegador) nenhuma função do banco pode rodar.
  const anonClient = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: anonErr } = await anonClient.rpc('reject_request', { p_request_id: -1 })
  if (anonErr && (anonErr.code === '42501' || /permission denied/i.test(anonErr.message))) ok('migration 031: funções fechadas para quem não fez login')
  else fail(`migration 031: a chave pública executa reject_request (${anonErr?.message ?? 'sem erro'}) — rode supabase/migrations/031_tenant_isolation.sql`)

  const { data: pdmCodes, error: pdmCodesErr } = await admin.from('pdm_templates').select('internal_code')
  if (pdmCodesErr) fail(`não leu pdm_templates: ${pdmCodesErr.message}`)
  else {
    const bad = (pdmCodes ?? []).filter((p) => !/^[A-Z0-9_-]{1,10}$/.test(p.internal_code ?? ''))
    if (bad.length) fail(`${bad.length} PDM(s) com código fora do padrão (máx. 10) — rode supabase/migrations/030_erp_text_and_pdm_code.sql`)
    else ok('códigos de PDM no padrão (até 10 caracteres)')
  }

  const { data: bucket, error: bucketErr } = await admin.storage.getBucket('request-attachments')
  if (bucketErr || !bucket) fail('bucket request-attachments não existe (migration 006)')
  else if (bucket.public) fail('bucket request-attachments está público; deveria ser privado')
  else ok('bucket request-attachments privado')

  const { data: list, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (usersErr) fail(`não listou usuários: ${usersErr.message}`)
  else {
    const masters = list.users.filter((u) => u.app_metadata?.is_master === true)
    if (masters.length === 0) fail('nenhum usuário master (app_metadata.is_master = true)')
    else ok(`${masters.length} usuário(s) master`)
  }

  const { data: demo } = await admin.from('tenants').select('id').eq('slug', 'empresa-demo').maybeSingle()
  if (demo) {
    const { count } = await admin.from('material_database').select('id', { count: 'exact', head: true }).eq('source', 'seed_mass')
    warn(`tenant Empresa Demo existe${count ? ` com ${count} materiais de seed` : ''}. Senha dos usuários demo está no repositório: desative-os ou troque as senhas antes de abrir para clientes`)
  }
}

async function checkLive(base) {
  section(`3. Site no ar (${base})`)
  const host = new URL(base).hostname

  try {
    const cname = await resolveCname(host).catch(() => [])
    if (cname.length) ok(`DNS: ${host} → ${cname.join(', ')}`)
    else {
      const ips = await resolve4(host)
      ok(`DNS: ${host} → ${ips.join(', ')}`)
    }
  } catch {
    fail(`DNS: ${host} não resolve (registro no registro.br ainda não propagou?)`)
    return
  }

  const get = (path, init = {}) => fetch(`${base}${path}`, { redirect: 'manual', ...init })

  try {
    const http = await fetch(`http://${host}/login`, { redirect: 'manual' })
    const loc = http.headers.get('location') ?? ''
    if ([301, 302, 307, 308].includes(http.status) && loc.startsWith('https://')) ok('http redireciona para https')
    else fail(`http não redireciona para https (status ${http.status})`)
  } catch (err) {
    warn(`http não testado: ${err.message}`)
  }

  let login
  try {
    login = await get('/login')
  } catch (err) {
    fail(`https não respondeu: ${err.message} (certificado ainda sendo emitido?)`)
    return
  }
  if (login.status === 200) ok('/login abre (200)')
  else fail(`/login respondeu ${login.status}`)

  const h = login.headers
  if (h.get('strict-transport-security')) ok('HSTS ativo')
  else fail('sem Strict-Transport-Security')
  if (h.get('x-frame-options') === 'DENY') ok('X-Frame-Options DENY')
  else fail('sem X-Frame-Options DENY')
  if (h.get('x-content-type-options') === 'nosniff') ok('X-Content-Type-Options nosniff')
  else fail('sem X-Content-Type-Options')
  if (h.get('x-powered-by')) fail('cabeçalho X-Powered-By exposto')
  else ok('sem X-Powered-By')

  const home = await get('/')
  if ([302, 303, 307, 308].includes(home.status) && (home.headers.get('location') ?? '').includes('/login')) ok('página sem sessão vai para /login')
  else fail(`página sem sessão não redirecionou para /login (status ${home.status})`)

  const api = await get('/api/admin/users')
  if (api.status === 401) ok('API sem sessão devolve 401')
  else fail(`/api/admin/users sem sessão devolveu ${api.status}`)

  const v1 = await get('/api/v1/materials')
  if (v1.status === 401) ok('/api/v1 sem chave devolve 401')
  else fail(`/api/v1/materials sem chave devolveu ${v1.status}`)

  const hook = await get('/api/support/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  if (hook.status === 401) ok('webhook do suporte sem segredo devolve 401')
  else fail(`webhook sem segredo devolveu ${hook.status}`)
}

async function main() {
  console.log('PRO-MAT — conferência de produção')
  const envFile = resolve(process.cwd(), typeof args['env-file'] === 'string' ? args['env-file'] : '.env.production.local')
  let env = {}
  if (existsSync(envFile)) {
    console.log(`Arquivo: ${envFile}`)
    env = loadEnv(envFile)
    checkVariables(env)
    await checkSupabase(env)
  } else if (!args.live) {
    console.error(`Arquivo não encontrado: ${envFile}\nCopie web/.env.example para web/.env.production.local e preencha.`)
    process.exit(1)
  }

  if (args.live) {
    const base = String(typeof args.url === 'string' ? args.url : env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    if (!base.startsWith('https://')) fail('informe --url=https://... ou NEXT_PUBLIC_APP_URL')
    else await checkLive(base)
  }

  console.log(`\nResultado: ${failures} falha(s), ${warnings} aviso(s).`)
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
