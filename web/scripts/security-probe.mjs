#!/usr/bin/env node
/**
 * Sonda de segurança do PRO-MAT contra o banco real.
 * Cria dois tenants temporários (A e B) com usuários de teste, tenta os ataques pela chave pública
 * (como o navegador faria), confere pelo service role que nada mudou e apaga tudo no fim.
 * Também confere que o uso legítimo continua funcionando (abrir solicitação, aprovar).
 *
 *   node scripts/security-probe.mjs --env-file=.env.local
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...v] = a.slice(2).split('=')
  return [k, v.length ? v.join('=') : true]
}))
const envFile = resolve(process.cwd(), typeof args['env-file'] === 'string' ? args['env-file'] : '.env.local')
if (!existsSync(envFile)) {
  console.error(`Arquivo não encontrado: ${envFile} (rode dentro da pasta web)`)
  process.exit(1)
}
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => {
  const i = l.indexOf('=')
  return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]
}))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const opts = { auth: { autoRefreshToken: false, persistSession: false } }
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts)

const tag = randomBytes(4).toString('hex')
const password = `${randomBytes(18).toString('hex')}Aa1!`
const results = []
const created = { tenants: [], authUsers: [] }

function record(ok, label, detail = '') {
  results.push({ ok, label })
  console.log(`  ${ok ? 'OK   ' : 'FALHA'} ${label}${detail ? ` — ${detail}` : ''}`)
}

async function must(promise, what) {
  const { data, error } = await promise
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

/** Ataque: espera erro ou nenhuma linha afetada, e confere pelo service role que o dado não mudou. */
async function denied(label, attack, unchanged) {
  let note = ''
  try {
    const { data, error } = await attack()
    note = error ? `recusado (${error.code ?? error.message})` : `sem efeito (${Array.isArray(data) ? data.length : data ? 1 : 0} linha)`
    if (!error && Array.isArray(data) && data.length > 0) return record(false, label, `afetou ${data.length} linha(s)`)
  } catch (e) {
    note = `recusado (${e.message})`
  }
  const same = unchanged ? await unchanged() : true
  record(same, label, same ? note : 'o dado mudou no banco')
}

async function allowed(label, action) {
  const { error } = await action()
  record(!error, label, error ? error.message : '')
}

async function signIn(email) {
  const client = createClient(URL_, ANON, opts)
  await must(client.auth.signInWithPassword({ email, password }), `login ${email}`)
  return client
}

async function makeTenant(name) {
  const [t] = await must(admin.from('tenants').insert({ name, slug: `sonda-${tag}-${name.toLowerCase()}`, is_active: true }).select('id'), 'tenant')
  created.tenants.push(t.id)
  return t.id
}

async function makeUser(tenantId, label, permissions) {
  const [role] = await must(admin.from('roles').insert({ tenant_id: tenantId, name: `SONDA_${label}`, role_type: 'operacional', permissions }).select('id'), 'role')
  const email = `sonda-${tag}-${label.toLowerCase()}@example.com`
  const { user } = await must(admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { tenant_id: tenantId } }), 'auth user')
  created.authUsers.push(user.id)
  await must(admin.from('users').insert({ id: user.id, tenant_id: tenantId, name: `Sonda ${label}`, role_id: role.id }), 'perfil')
  await must(admin.from('user_role_groups').insert({ user_id: user.id, role_id: role.id }), 'grupo')
  return { id: user.id, email, roleId: role.id }
}

async function makeFlow(tenantId) {
  const [wf] = await must(admin.from('workflow_header').insert({ tenant_id: tenantId, name: `Sonda ${tag}`, is_active: true }).select('id'), 'workflow')
  await must(admin.from('workflow_config').insert([
    { tenant_id: tenantId, workflow_id: wf.id, step_name: 'Cadastro', status_key: 'cadastro', order: 1, is_active: true },
    { tenant_id: tenantId, workflow_id: wf.id, step_name: 'Finalizado', status_key: 'finalizado', order: 2, is_active: true },
  ]), 'etapas')
  const [pdm] = await must(admin.from('pdm_templates').insert({ tenant_id: tenantId, name: `SONDA ${tag}`, internal_code: `SOND${tag.slice(0, 3).toUpperCase()}`.replace(/[^A-Z0-9]/g, 'X').slice(0, 10), is_active: true, attributes: [] }).select('id'), 'pdm')
  return { workflowId: wf.id, pdmId: pdm.id }
}

async function cleanup() {
  for (const tenantId of created.tenants) {
    for (const table of ['request_history', 'notifications', 'system_logs', 'material_database', 'material_requests', 'pdm_templates', 'workflow_config', 'workflow_header']) {
      await admin.from(table).delete().eq('tenant_id', tenantId)
    }
  }
  for (const id of created.authUsers) {
    await admin.from('user_role_groups').delete().eq('user_id', id)
    await admin.from('user_permission_grants').delete().eq('user_id', id)
    await admin.from('users').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
  for (const tenantId of created.tenants) {
    await admin.from('roles').delete().eq('tenant_id', tenantId)
    await admin.from('tenants').delete().eq('id', tenantId)
  }
}

async function main() {
  console.log(`PRO-MAT — sonda de segurança (${tag})`)
  const tA = await makeTenant('A')
  const tB = await makeTenant('B')
  const flowA = await makeFlow(tA)
  const flowB = await makeFlow(tB)
  const requester = await makeUser(tA, 'SOLIC', { can_submit_request: true, can_view_database: true, can_attend: false })
  const attendant = await makeUser(tA, 'ATEND', { can_attend: true, can_approve: true, can_reject: true, can_view_database: true })
  const adminB = await makeUser(tB, 'ADMB', { can_manage_roles: true, can_manage_users: true, can_view_logs: true, can_attend: true, can_approve: true, can_reject: true })

  const [reqB] = await must(admin.from('material_requests').insert({ tenant_id: tB, pdm_id: flowB.pdmId, workflow_id: flowB.workflowId, status: 'cadastro', requester: 'B', urgency: 'low', user_id: adminB.id }).select('id, status'), 'solicitação B')
  const [reqA] = await must(admin.from('material_requests').insert({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: flowA.workflowId, status: 'cadastro', requester: 'A', urgency: 'low', user_id: requester.id }).select('id, status'), 'solicitação A')
  const [matA] = await must(admin.from('material_database').insert({ tenant_id: tA, id_sistema: `SONDA-${tag}-A`, description: 'SONDA A', status: 'Ativo', erp_status: 'pendente_erp', source: 'manual' }).select('id'), 'material A')
  const [matB] = await must(admin.from('material_database').insert({ tenant_id: tB, id_sistema: `SONDA-${tag}-B`, description: 'SONDA B', status: 'Ativo', erp_status: 'pendente_erp', source: 'manual' }).select('id'), 'material B')
  await must(admin.from('system_logs').insert({ tenant_id: tA, user_id: attendant.id, category: 'system', action: 'sonda', description: 'log da sonda' }), 'log A')

  const anon = createClient(URL_, ANON, opts)
  const solic = await signIn(requester.email)
  const atend = await signIn(attendant.email)

  const reqStatus = async (id, expected) => (await admin.from('material_requests').select('status, assigned_to_id').eq('id', id).single()).data?.status === expected
  const matErp = async (id) => {
    const { data } = await admin.from('material_database').select('erp_status, id_erp, status').eq('id', id).single()
    return data?.erp_status === 'pendente_erp' && data?.id_erp == null && data?.status === 'Ativo'
  }

  console.log('\nSem login (chave pública)')
  await denied('anon não executa reject_request', () => anon.rpc('reject_request', { p_request_id: reqA.id }), () => reqStatus(reqA.id, 'cadastro'))
  await denied('anon não lê solicitações', () => anon.from('material_requests').select('id'))

  console.log('\nIsolamento entre tenants (usuário do tenant A)')
  await denied('não lê solicitação do tenant B', () => solic.from('material_requests').select('id').eq('id', reqB.id))
  await denied('não lê material do tenant B', () => solic.from('material_database').select('id').eq('id', matB.id))
  await denied('não lê usuários do tenant B', () => solic.from('users').select('id').eq('id', adminB.id))
  await denied('atendente A não rejeita solicitação do B', () => atend.rpc('reject_request', { p_request_id: reqB.id }), () => reqStatus(reqB.id, 'cadastro'))
  await denied('atendente A não aprova solicitação do B', () => atend.rpc('advance_workflow', { p_request_id: reqB.id }), () => reqStatus(reqB.id, 'cadastro'))
  await denied('não grava histórico na solicitação do B', () => solic.from('request_history').insert({ tenant_id: tA, request_id: reqB.id, user_id: requester.id, event_type: 'rejected', stage: 'x' }).select('id'),
    async () => ((await admin.from('request_history').select('id').eq('request_id', reqB.id)).data ?? []).length === 0)
  console.log('\nPermissões dentro do tenant (solicitante do A)')
  await denied('solicitante não aprova', () => solic.rpc('advance_workflow', { p_request_id: reqA.id }), () => reqStatus(reqA.id, 'cadastro'))
  await denied('solicitante não rejeita', () => solic.rpc('reject_request', { p_request_id: reqA.id }), () => reqStatus(reqA.id, 'cadastro'))
  await denied('solicitante não muda etapa direto', () => solic.from('material_requests').update({ status: 'finalizado' }).eq('id', reqA.id).select('id'), () => reqStatus(reqA.id, 'cadastro'))
  await denied('solicitante não abre solicitação já finalizada', () => solic.from('material_requests').insert({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: flowA.workflowId, status: 'finalizado', requester: 'X', urgency: 'low', user_id: requester.id }).select('id'),
    async () => ((await admin.from('material_requests').select('id').eq('tenant_id', tA).eq('status', 'finalizado')).data ?? []).length === 0)
  await denied('não se promove (role_id no próprio perfil)', () => solic.from('users').update({ role_id: attendant.roleId }).eq('id', requester.id).select('id'),
    async () => (await admin.from('users').select('role_id').eq('id', requester.id).single()).data?.role_id === requester.roleId)
  await denied('não edita permissões do próprio papel', () => solic.from('roles').update({ permissions: { can_manage_users: true } }).eq('id', requester.roleId).select('id'),
    async () => (await admin.from('roles').select('permissions').eq('id', requester.roleId).single()).data?.permissions?.can_manage_users !== true)
  await denied('não forja integração no ERP', () => solic.from('material_database').update({ erp_status: 'integrado_erp', id_erp: 'FAKE' }).eq('id', matA.id).select('id'), () => matErp(matA.id))
  await denied('não cria PDM', () => solic.from('pdm_templates').insert({ tenant_id: tA, name: `HACK ${tag}`, internal_code: 'HACK001', attributes: [] }).select('id'),
    async () => ((await admin.from('pdm_templates').select('id').eq('tenant_id', tA).eq('internal_code', 'HACK001')).data ?? []).length === 0)
  await denied('não lê o log do sistema', () => solic.from('system_logs').select('id').eq('tenant_id', tA))
  await denied('não apaga o log do sistema', () => solic.from('system_logs').delete().eq('tenant_id', tA).select('id'),
    async () => ((await admin.from('system_logs').select('id').eq('tenant_id', tA)).data ?? []).length > 0)
  await denied('não cria notificação para outro usuário', () => solic.from('notifications').insert({ tenant_id: tA, user_id: attendant.id, title: 'x', message: 'x', event_type: 'x' }).select('id'))
  await denied('não altera a empresa', () => solic.from('tenants').update({ name: 'HACK' }).eq('id', tA).select('id'),
    async () => (await admin.from('tenants').select('name').eq('id', tA).single()).data?.name === 'A')

  console.log('\nPermissões dentro do tenant (atendente do A)')
  await denied('atendente não forja integração no ERP', () => atend.from('material_database').update({ erp_status: 'integrado_erp', id_erp: 'FAKE' }).eq('id', matA.id).select('id'), () => matErp(matA.id))
  await denied('atendente não troca o atendente direto', () => atend.from('material_requests').update({ assigned_to_id: attendant.id }).eq('id', reqA.id).select('id'),
    async () => (await admin.from('material_requests').select('assigned_to_id').eq('id', reqA.id).single()).data?.assigned_to_id == null)

  console.log('\nUsuário inativado')
  await must(admin.from('users').update({ is_active: false }).eq('id', requester.id), 'inativar')
  await denied('inativo não lê solicitações do próprio tenant', () => solic.from('material_requests').select('id').eq('tenant_id', tA))
  await denied('inativo não lê materiais do próprio tenant', () => solic.from('material_database').select('id').eq('tenant_id', tA))
  await denied('inativo não abre solicitação', () => solic.from('material_requests').insert({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: flowA.workflowId, status: 'cadastro', requester: 'Inativo', urgency: 'low', user_id: requester.id }).select('id'),
    async () => ((await admin.from('material_requests').select('id').eq('tenant_id', tA).eq('requester', 'Inativo')).data ?? []).length === 0)
  await must(admin.from('users').update({ is_active: true }).eq('id', requester.id), 'reativar')

  console.log('\nUso legítimo continua funcionando')
  await allowed('solicitante abre solicitação na primeira etapa', () => solic.from('material_requests').insert({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: flowA.workflowId, status: 'cadastro', requester: 'Sonda', urgency: 'low', user_id: requester.id }).select('id'))
  await allowed('solicitante registra log em nome próprio', () => solic.from('system_logs').insert({ tenant_id: tA, user_id: requester.id, category: 'system', action: 'sonda', description: 'ok' }))
  await allowed('atendente assume a solicitação', () => atend.rpc('assign_request', { p_request_id: reqA.id }))
  await allowed('atendente aprova a solicitação', () => atend.rpc('advance_workflow', { p_request_id: reqA.id }))
}

try {
  await main()
} catch (e) {
  console.error(`\nErro ao montar a sonda: ${e.message}`)
  results.push({ ok: false, label: 'montagem' })
} finally {
  await cleanup()
  console.log('\nDados temporários apagados.')
}
const failed = results.filter((r) => !r.ok)
console.log(`Resultado: ${results.length - failed.length}/${results.length} OK${failed.length ? `, ${failed.length} falha(s)` : ''}.`)
process.exit(failed.length ? 1 : 0)
