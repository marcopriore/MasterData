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

/** roleName = nome do papel de etapa (a área); sem ele, um papel sem área. */
async function makeUser(tenantId, label, permissions, roleName = `SONDA_${label}`) {
  const [role] = await must(admin.from('roles').insert({ tenant_id: tenantId, name: roleName, role_type: 'operacional', permissions }).select('id'), 'role')
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
    for (const table of ['request_history', 'notifications', 'system_logs', 'material_history', 'material_centers', 'material_requests', 'material_database', 'centers', 'pdm_templates', 'workflow_config', 'workflow_header', 'field_rule_profiles', 'field_dictionary']) {
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
  const attendant = await makeUser(tA, 'ATEND', { can_attend: true, can_approve: true, can_reject: true, can_view_database: true }, 'CADASTRO')
  const otherArea = await makeUser(tA, 'COMPR', { can_attend: true, can_approve: true, can_reject: true, can_view_database: true }, 'COMPRAS')
  const adminB = await makeUser(tB, 'ADMB', { can_manage_roles: true, can_manage_users: true, can_view_logs: true, can_view_reports: true, can_attend: true, can_approve: true, can_reject: true })

  const [reqB] = await must(admin.from('material_requests').insert({ tenant_id: tB, pdm_id: flowB.pdmId, workflow_id: flowB.workflowId, status: 'cadastro', requester: 'B', urgency: 'low', user_id: adminB.id }).select('id, status'), 'solicitação B')
  const [reqA] = await must(admin.from('material_requests').insert({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: flowA.workflowId, status: 'cadastro', requester: 'A', urgency: 'low', user_id: requester.id }).select('id, status'), 'solicitação A')
  const [matA] = await must(admin.from('material_database').insert({ tenant_id: tA, id_sistema: `SONDA-${tag}-A`, description: 'SONDA A', status: 'Ativo', erp_status: 'pendente_erp', source: 'manual' }).select('id'), 'material A')
  const [matB] = await must(admin.from('material_database').insert({ tenant_id: tB, id_sistema: `SONDA-${tag}-B`, description: 'SONDA B', status: 'Ativo', erp_status: 'pendente_erp', source: 'manual' }).select('id'), 'material B')
  await must(admin.from('system_logs').insert({ tenant_id: tA, user_id: attendant.id, category: 'system', action: 'sonda', description: 'log da sonda' }), 'log A')

  const anon = createClient(URL_, ANON, opts)
  const solic = await signIn(requester.email)
  const atend = await signIn(attendant.email)
  const compras = await signIn(otherArea.email)

  const reqStatus = async (id, expected) => (await admin.from('material_requests').select('status, assigned_to_id').eq('id', id).single()).data?.status === expected
  const matErp = async (id) => {
    const { data } = await admin.from('material_database').select('erp_status, id_erp, status').eq('id', id).single()
    return data?.erp_status === 'pendente_erp' && data?.id_erp == null && data?.status === 'Ativo'
  }

  console.log('\nSem login (chave pública)')
  await denied('anon não executa reject_request', () => anon.rpc('reject_request', { p_request_id: reqA.id, p_category: 'outro' }), () => reqStatus(reqA.id, 'cadastro'))
  await denied('anon não lê solicitações', () => anon.from('material_requests').select('id'))

  console.log('\nIsolamento entre tenants (usuário do tenant A)')
  await denied('não lê solicitação do tenant B', () => solic.from('material_requests').select('id').eq('id', reqB.id))
  await denied('não lê material do tenant B', () => solic.from('material_database').select('id').eq('id', matB.id))
  await denied('não lê usuários do tenant B', () => solic.from('users').select('id').eq('id', adminB.id))
  await denied('atendente A não rejeita solicitação do B', () => atend.rpc('reject_request', { p_request_id: reqB.id, p_category: 'outro' }), () => reqStatus(reqB.id, 'cadastro'))
  await denied('atendente A não aprova solicitação do B', () => atend.rpc('advance_workflow', { p_request_id: reqB.id }), () => reqStatus(reqB.id, 'cadastro'))
  await denied('não grava histórico na solicitação do B', () => solic.from('request_history').insert({ tenant_id: tA, request_id: reqB.id, user_id: requester.id, event_type: 'rejected', stage: 'x' }).select('id'),
    async () => ((await admin.from('request_history').select('id').eq('request_id', reqB.id)).data ?? []).length === 0)
  console.log('\nPermissões dentro do tenant (solicitante do A)')
  await denied('solicitante não aprova', () => solic.rpc('advance_workflow', { p_request_id: reqA.id }), () => reqStatus(reqA.id, 'cadastro'))
  await denied('solicitante não rejeita', () => solic.rpc('reject_request', { p_request_id: reqA.id, p_category: 'outro' }), () => reqStatus(reqA.id, 'cadastro'))
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

  console.log('\nCada área só na própria etapa (solicitação em Cadastro)')
  await denied('Compras não atende etapa de Cadastro', () => compras.rpc('assign_request', { p_request_id: reqA.id }),
    async () => (await admin.from('material_requests').select('assigned_to_id').eq('id', reqA.id).single()).data?.assigned_to_id == null)
  await denied('Compras não aprova etapa de Cadastro', () => compras.rpc('advance_workflow', { p_request_id: reqA.id }), () => reqStatus(reqA.id, 'cadastro'))
  await denied('Compras não rejeita etapa de Cadastro', () => compras.rpc('reject_request', { p_request_id: reqA.id, p_category: 'outro' }), () => reqStatus(reqA.id, 'cadastro'))
  await denied('Compras não altera campos da etapa de Cadastro', () => compras.from('material_requests').update({ generated_description: 'HACK' }).eq('id', reqA.id).select('id'),
    async () => (await admin.from('material_requests').select('generated_description').eq('id', reqA.id).single()).data?.generated_description !== 'HACK')
  await denied('área não arrasta entre etapas (só Admin)', () => atend.rpc('move_request_stage', { p_request_id: reqA.id, p_status_key: 'x' }), () => reqStatus(reqA.id, 'cadastro'))

  console.log('\nPermissão de ver não dá permissão de mudar (migration 044)')
  const viewer = await makeUser(tA, 'VIEW', { can_view_workflows: true, can_view_pdm: true, can_view_database: true })
  const pdmEditor = await makeUser(tA, 'PDMED', { can_view_pdm: true, can_edit_pdm: true, can_view_database: true })
  const view = await signIn(viewer.email)
  const pdmEd = await signIn(pdmEditor.email)
  await denied('só ver workflows não cria workflow', () => view.from('workflow_header').insert({ tenant_id: tA, name: `HACK ${tag}`, is_active: false }).select('id'),
    async () => ((await admin.from('workflow_header').select('id').eq('tenant_id', tA).eq('name', `HACK ${tag}`)).data ?? []).length === 0)
  await denied('só ver workflows não muda etapa', () => view.from('workflow_config').update({ step_name: 'HACK' }).eq('workflow_id', flowA.workflowId).select('id'),
    async () => ((await admin.from('workflow_config').select('id').eq('workflow_id', flowA.workflowId).eq('step_name', 'HACK')).data ?? []).length === 0)
  await denied('só ver PDM não cria PDM', () => view.from('pdm_templates').insert({ tenant_id: tA, name: `HACKV ${tag}`, internal_code: 'HACKV01', attributes: [] }).select('id'),
    async () => ((await admin.from('pdm_templates').select('id').eq('tenant_id', tA).eq('internal_code', 'HACKV01')).data ?? []).length === 0)
  await denied('só ver a base não edita material', () => view.from('material_database').update({ technical_attributes: { hack: 'x' } }).eq('id', matA.id).select('id'),
    async () => (await admin.from('material_database').select('technical_attributes').eq('id', matA.id).single()).data?.technical_attributes?.hack === undefined)
  await denied('quem só edita PDM não edita o cadastro do material', () => pdmEd.from('material_database').update({ technical_attributes: { hack: 'x' } }).eq('id', matA.id).select('id'),
    async () => (await admin.from('material_database').select('technical_attributes').eq('id', matA.id).single()).data?.technical_attributes?.hack === undefined)
  await allowed('quem edita PDM refaz a descrição do material', () => pdmEd.from('material_database').update({ description: 'SONDA A REFEITA' }).eq('id', matA.id).select('id'))

  console.log('\nUsuário inativado')
  await must(admin.from('users').update({ is_active: false }).eq('id', requester.id), 'inativar')
  await denied('inativo não lê solicitações do próprio tenant', () => solic.from('material_requests').select('id').eq('tenant_id', tA))
  await denied('inativo não lê materiais do próprio tenant', () => solic.from('material_database').select('id').eq('tenant_id', tA))
  await denied('inativo não abre solicitação', () => solic.from('material_requests').insert({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: flowA.workflowId, status: 'cadastro', requester: 'Inativo', urgency: 'low', user_id: requester.id }).select('id'),
    async () => ((await admin.from('material_requests').select('id').eq('tenant_id', tA).eq('requester', 'Inativo')).data ?? []).length === 0)
  await must(admin.from('users').update({ is_active: true }).eq('id', requester.id), 'reativar')

  console.log('\nCancelamento')
  const [reqC] = await must(admin.from('material_requests').insert({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: flowA.workflowId, status: 'cadastro', requester: 'C', urgency: 'low', user_id: requester.id }).select('id'), 'solicitação C')
  const [reqD] = await must(admin.from('material_requests').insert({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: flowA.workflowId, status: 'cadastro', requester: 'D', urgency: 'low', user_id: requester.id, assigned_to_id: attendant.id }).select('id'), 'solicitação D')
  await denied('outro usuário não cancela solicitação alheia', () => compras.rpc('cancel_request', { p_request_id: reqC.id }), () => reqStatus(reqC.id, 'cadastro'))
  await denied('solicitante não cancela depois do atendimento iniciado', () => solic.rpc('cancel_request', { p_request_id: reqD.id }), () => reqStatus(reqD.id, 'cadastro'))
  await denied('solicitante não muda para cancelado direto', () => solic.from('material_requests').update({ status: 'cancelado' }).eq('id', reqC.id).select('id'), () => reqStatus(reqC.id, 'cadastro'))
  await allowed('solicitante cancela a própria antes do atendimento', () => solic.rpc('cancel_request', { p_request_id: reqC.id, p_reason: 'sonda' }))
  record(await reqStatus(reqC.id, 'cancelado'), 'cancelada fica com status cancelado')
  await denied('cancelada não é aprovada', () => atend.rpc('advance_workflow', { p_request_id: reqC.id }), () => reqStatus(reqC.id, 'cancelado'))

  console.log('\nRelatório de integração ERP')
  await must(admin.from('material_database').insert({ tenant_id: tA, id_sistema: `SONDA-${tag}-E`, description: 'SONDA ERRO', status: 'Ativo', erp_status: 'erro_erp', erp_error_message: `SONDA ERRO ${tag}`, source: 'manual' }), 'material com erro A')
  await must(admin.from('system_logs').insert({ tenant_id: tA, user_id: attendant.id, category: 'database', action: 'erp_integrated', description: 'Material integrado ao ERP (simulação)' }), 'log ERP A')
  await denied('sem "Ver Relatórios" não lê as integrações', () => solic.rpc('report_erp_integrations', { p_from: '2000-01-01', p_to: '2100-01-01' }))
  await denied('sem "Ver Relatórios" não lê os erros do ERP', () => solic.rpc('report_erp_errors'))
  const relB = await signIn(adminB.email)
  const { data: errorsB, error: errorsBErr } = await relB.rpc('report_erp_errors')
  record(!errorsBErr && !(errorsB ?? []).some((r) => String(r.message).includes(tag)), 'relatório do tenant B não mostra erro do tenant A', errorsBErr?.message ?? '')
  const { data: eventsB, error: eventsBErr } = await relB.rpc('report_erp_integrations', { p_from: '2000-01-01', p_to: '2100-01-01' })
  record(!eventsBErr && (eventsB ?? []).length === 0, 'relatório do tenant B não conta integração do tenant A', eventsBErr?.message ?? '')

  console.log('\nRegras de campos por material')
  await must(admin.from('field_dictionary').insert([
    { tenant_id: tA, field_name: 'tipo_material', field_label: 'Tipo de Material', erp_view: 'dados_basicos', field_type: 'select', options: ['FERT', 'NLAG'], responsible_role: 'CADASTRO', is_required: false, display_order: 1 },
    { tenant_id: tA, field_name: 'sonda_campo', field_label: 'Campo da sonda', erp_view: 'dados_basicos', field_type: 'text', responsible_role: 'CADASTRO', is_required: false, display_order: 2 },
  ]), 'campos A')
  const [profA] = await must(admin.from('field_rule_profiles').insert({ tenant_id: tA, name: `SONDA FERT ${tag}`, conditions: { tipo_material: 'FERT' }, rules: { sonda_campo: { requirement: 'required' } } }).select('id'), 'regra A')
  const profUnchanged = async () => (await admin.from('field_rule_profiles').select('rules').eq('id', profA.id).single()).data?.rules?.sonda_campo?.requirement === 'required'
  await denied('outro tenant não lê as regras do A', () => relB.from('field_rule_profiles').select('id').eq('id', profA.id))
  await denied('outro tenant não grava regra no A', () => relB.from('field_rule_profiles').insert({ tenant_id: tA, name: `HACK ${tag}`, conditions: { tipo_material: 'X' } }).select('id'),
    async () => ((await admin.from('field_rule_profiles').select('id').eq('tenant_id', tA).eq('name', `HACK ${tag}`)).data ?? []).length === 0)
  await denied('sem "Gerenciar campos" não altera regra', () => solic.from('field_rule_profiles').update({ rules: { sonda_campo: { requirement: 'hidden' } } }).eq('id', profA.id).select('id'), profUnchanged)
  await denied('não consulta campos de outro tenant pelo banco', () => relB.rpc('stage_missing_fields', { p_tenant_id: tA, p_status: 'cadastro', p_attributes: {} }))
  await denied('não consulta a regra de outro tenant pelo banco', () => relB.rpc('field_effective', { p_tenant_id: tA, p_field_name: 'sonda_campo', p_base_role: 'CADASTRO', p_base_required: false, p_attributes: { tipo_material: 'FERT' } }))

  const [reqE] = await must(admin.from('material_requests').insert({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: flowA.workflowId, status: 'cadastro', requester: 'E', urgency: 'low', user_id: requester.id, technical_attributes: { tipo_material: 'FERT' } }).select('id'), 'solicitação E')
  await allowed('atendente assume a solicitação FERT', () => atend.rpc('assign_request', { p_request_id: reqE.id }))
  await denied('FERT sem o campo exigido pelo perfil não é aprovada', () => atend.rpc('advance_workflow', { p_request_id: reqE.id }), () => reqStatus(reqE.id, 'cadastro'))
  await allowed('atendente preenche o campo exigido', () => atend.from('material_requests').update({ technical_attributes: { tipo_material: 'FERT', sonda_campo: 'OK' } }).eq('id', reqE.id).select('id'))
  await allowed('com o campo preenchido, a FERT é aprovada', () => atend.rpc('advance_workflow', { p_request_id: reqE.id }))

  const [reqF] = await must(admin.from('material_requests').insert({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: flowA.workflowId, status: 'compras', requester: 'F', urgency: 'low', user_id: requester.id, assigned_to_id: otherArea.id, technical_attributes: { tipo_material: 'FERT' } }).select('id'), 'solicitação F')
  await denied('fora da etapa dele, o tipo de material não muda', () => compras.from('material_requests').update({ technical_attributes: { tipo_material: 'NLAG' } }).eq('id', reqF.id).select('id'),
    async () => (await admin.from('material_requests').select('technical_attributes').eq('id', reqF.id).single()).data?.technical_attributes?.tipo_material === 'FERT')
  await allowed('a etapa atual muda os outros campos', () => compras.from('material_requests').update({ technical_attributes: { tipo_material: 'FERT', obs: 'X' } }).eq('id', reqF.id).select('id'))

  console.log('\nRegras de campos na Base de Dados')
  const standardizer = await makeUser(tA, 'PADR', { can_standardize: true, can_view_database: true })
  const padr = await signIn(standardizer.email)
  const [matF] = await must(admin.from('material_database').insert({ tenant_id: tA, id_sistema: `SONDA-${tag}-F`, description: 'SONDA FERT', status: 'Ativo', erp_status: 'pendente_erp', source: 'manual', technical_attributes: { tipo_material: 'FERT' } }).select('id'), 'material FERT A')
  const matAttrs = async () => (await admin.from('material_database').select('technical_attributes').eq('id', matF.id).single()).data?.technical_attributes ?? {}
  await denied('material FERT sem o campo exigido não é salvo pela tela', () => padr.from('material_database').update({ technical_attributes: { tipo_material: 'FERT', obs: 'X' } }).eq('id', matF.id).select('id'),
    async () => (await matAttrs()).obs === undefined)
  await allowed('com o campo exigido preenchido, o material é salvo', () => padr.from('material_database').update({ technical_attributes: { tipo_material: 'FERT', sonda_campo: 'OK' } }).eq('id', matF.id).select('id'))
  record((await matAttrs()).sonda_campo === 'OK', 'o campo exigido ficou gravado')
  await denied('não apaga o campo exigido depois', () => padr.from('material_database').update({ technical_attributes: { tipo_material: 'FERT' } }).eq('id', matF.id).select('id'),
    async () => (await matAttrs()).sonda_campo === 'OK')
  const tipoIsFert = async () => (await matAttrs()).tipo_material === 'FERT'
  await denied('tipo de material de material cadastrado não muda pela tela', () => padr.from('material_database').update({ technical_attributes: { tipo_material: 'NLAG', sonda_campo: 'OK' } }).eq('id', matF.id).select('id'), tipoIsFert)
  const { error: lockErr } = await admin.from('material_database').update({ technical_attributes: { tipo_material: 'NLAG', sonda_campo: 'OK' } }).eq('id', matF.id)
  record(Boolean(lockErr) && (await tipoIsFert()), 'tipo de material não muda nem pelo servidor (importação, API)', lockErr ? '' : 'o banco aceitou a troca')
  console.log('\nHistórico do material')
  const { data: histF } = await admin.from('material_history').select('event_type').eq('material_id', matF.id)
  record((histF ?? []).some((h) => h.event_type === 'created') && (histF ?? []).some((h) => h.event_type === 'edited'), 'o banco registra criação e alteração do material')
  await denied('outro tenant não lê o histórico do material', () => relB.from('material_history').select('id').eq('material_id', matF.id))
  await denied('ninguém grava histórico pela API', () => padr.from('material_history').insert({ tenant_id: tA, material_id: matF.id, event_type: 'status', event_data: { to: 'HACK' } }).select('id'),
    async () => ((await admin.from('material_history').select('id').eq('material_id', matF.id).eq('event_data->>to', 'HACK')).data ?? []).length === 0)
  console.log('\nAlteração de material')
  await must(admin.rpc('ensure_request_type_workflows', { p_tenant_id: tA }), 'workflow de alteração A')
  const { data: wfAlt } = await admin.from('workflow_header').select('id').eq('tenant_id', tA).eq('request_type', 'alteracao').eq('is_active', true).single()
  const { data: pdmA } = await admin.from('pdm_templates').select('internal_code').eq('id', flowA.pdmId).single()
  const [matG] = await must(admin.from('material_database').insert({ tenant_id: tA, id_sistema: `SONDA-${tag}-G`, description: 'SONDA ALT', status: 'Ativo', erp_status: 'integrado_erp', id_erp: `ERP-${tag}`, source: 'manual', pdm_code: pdmA.internal_code, technical_attributes: { sonda_campo: 'ANTIGO' } }).select('id'), 'material para alterar')
  const altRow = (extra) => ({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: wfAlt.id, status: 'cadastro', requester: 'ALT', urgency: 'low', user_id: requester.id, request_type: 'alteracao', target_material_id: matG.id, change_fields: ['sonda_campo'], technical_attributes: { sonda_campo: 'NOVO' }, ...extra })
  const altCount = async () => ((await admin.from('material_requests').select('id').eq('target_material_id', matG.id)).data ?? []).length
  await denied('alteração não troca o Tipo de Material', () => solic.from('material_requests').insert(altRow({ change_fields: ['tipo_material'], technical_attributes: { tipo_material: 'NLAG' } })).select('id'), async () => (await altCount()) === 0)
  await denied('alteração não aponta para material de outro tenant', () => solic.from('material_requests').insert(altRow({ target_material_id: matB.id })).select('id'),
    async () => ((await admin.from('material_requests').select('id').eq('target_material_id', matB.id)).data ?? []).length === 0)
  await denied('cadastro não aponta para material existente', () => solic.from('material_requests').insert(altRow({ request_type: 'cadastro', workflow_id: flowA.workflowId })).select('id'), async () => (await altCount()) === 0)
  const { data: altCreated, error: altErr } = await solic.from('material_requests').insert(altRow({ change_previous: { sonda_campo: 'FORJADO' } })).select('id').single()
  record(!altErr && Boolean(altCreated), 'solicitante abre a alteração do material', altErr?.message ?? '')
  const altId = altCreated?.id
  const { data: altSaved } = altId ? await admin.from('material_requests').select('change_previous').eq('id', altId).single() : { data: null }
  record(altSaved?.change_previous?.sonda_campo === 'ANTIGO', 'o valor de antes vem do material, não do navegador')
  await denied('não abre duas alterações do mesmo material', () => solic.from('material_requests').insert(altRow({})).select('id'), async () => (await altCount()) === 1)
  if (altId) {
    await allowed('atendente assume a alteração', () => atend.rpc('assign_request', { p_request_id: altId }))
    await allowed('atendente aprova a alteração', () => atend.rpc('advance_workflow', { p_request_id: altId }))
    const { data: matAfter } = await admin.from('material_database').select('technical_attributes, erp_status, id_erp').eq('id', matG.id).single()
    record(matAfter?.technical_attributes?.sonda_campo === 'NOVO' && matAfter?.erp_status === 'pendente_erp' && matAfter?.id_erp === `ERP-${tag}`,
      'a aprovação final aplica a alteração no mesmo material e ele volta para Pendente ERP')
    const { count: newMaterials } = await admin.from('material_database').select('id', { count: 'exact', head: true }).eq('tenant_id', tA).eq('request_id', altId)
    record((newMaterials ?? 0) === 0, 'a alteração não cria material novo')
    const { data: altHist } = await admin.from('material_history').select('event_data').eq('material_id', matG.id).eq('event_type', 'edited')
    record((altHist ?? []).some((h) => Number(h.event_data?.request_id) === altId), 'o histórico do material registra a solicitação de alteração')
  }
  const { data: leak, error: leakErr } = await relB.rpc('material_missing_fields', { p_tenant_id: tA, p_attributes: { tipo_material: 'FERT' } })
  record(Boolean(leakErr) || leak == null, 'outro tenant não descobre os campos exigidos do A', leak ? `devolveu "${leak}"` : '')

  console.log('\nUso legítimo continua funcionando')
  await allowed('solicitante abre solicitação na primeira etapa', () => solic.from('material_requests').insert({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: flowA.workflowId, status: 'cadastro', requester: 'Sonda', urgency: 'low', user_id: requester.id }).select('id'))
  await allowed('solicitante registra log em nome próprio', () => solic.from('system_logs').insert({ tenant_id: tA, user_id: requester.id, category: 'system', action: 'sonda', description: 'ok' }))
  await allowed('atendente assume a solicitação', () => atend.rpc('assign_request', { p_request_id: reqA.id }))
  await allowed('atendente aprova a solicitação', () => atend.rpc('advance_workflow', { p_request_id: reqA.id }))

  // Depois do uso legítimo: com centro ativo, o cadastro passa a exigir centro.
  console.log('\nCentros e Ampliação (migration 045)')
  const centerAdmin = await makeUser(tA, 'CENT', { can_manage_fields: true, can_view_database: true })
  const cent = await signIn(centerAdmin.email)
  const centerCount = async (tenantId) => ((await admin.from('centers').select('id').eq('tenant_id', tenantId)).data ?? []).length
  await denied('sem "Dicionário de Dados" não cadastra centro', () => solic.from('centers').insert({ tenant_id: tA, code: 'H1', name: 'HACK' }).select('id'), async () => (await centerCount(tA)) === 0)
  const [c1, c2] = (await must(cent.from('centers').insert([{ tenant_id: tA, code: '1001', name: 'SONDA UM' }, { tenant_id: tA, code: '1002', name: 'SONDA DOIS' }]).select('id, code'), 'centros A'))
    .sort((a, b) => a.code.localeCompare(b.code))
  record(Boolean(c1 && c2), 'quem tem "Dicionário de Dados" cadastra centros')
  await denied('código do centro tem até 4 caracteres (migration 046)', () => cent.from('centers').insert({ tenant_id: tA, code: '10030', name: 'LONGO' }).select('id'), async () => (await centerCount(tA)) === 2)
  const [cB] = await must(admin.from('centers').insert({ tenant_id: tB, code: '9001', name: 'SONDA B' }).select('id'), 'centro B')
  await denied('não cadastra centro em outro tenant', () => cent.from('centers').insert({ tenant_id: tB, code: 'H2', name: 'HACK' }).select('id'), async () => (await centerCount(tB)) === 1)
  await denied('outro tenant não lê os centros do A', () => relB.from('centers').select('id').eq('tenant_id', tA))
  await denied('não altera centro de outro tenant', () => cent.from('centers').update({ name: 'HACK' }).eq('id', cB.id).select('id'),
    async () => (await admin.from('centers').select('name').eq('id', cB.id).single()).data?.name === 'SONDA B')

  await must(admin.from('field_dictionary').insert({ tenant_id: tA, field_name: 'sonda_centro', field_label: 'Campo por centro', erp_view: 'mrp', field_type: 'text', responsible_role: 'MRP', is_required: false, display_order: 3 }), 'campo por centro A')
  const { data: perCenterField } = await admin.from('field_dictionary').select('per_center').eq('tenant_id', tA).eq('field_name', 'sonda_centro').single()
  record(perCenterField?.per_center === true, 'campo de MRP criado sem dizer vem marcado "Por centro"')

  const [matH] = await must(admin.from('material_database').insert({ tenant_id: tA, id_sistema: `SONDA-${tag}-H`, description: 'SONDA AMP', status: 'Ativo', erp_status: 'integrado_erp', id_erp: `ERPH-${tag}`, source: 'manual', pdm_code: pdmA.internal_code, technical_attributes: { sonda_centro: 'ORIGEM' } }).select('id'), 'material para ampliar')
  const centersOf = async (materialId) => (await admin.from('material_centers').select('center_id, is_origin, attributes, request_id').eq('material_id', materialId)).data ?? []
  await denied('ninguém grava centro do material direto pela API', () => padr.from('material_centers').insert({ tenant_id: tA, material_id: matH.id, center_id: c1.id, is_origin: true }).select('id'), async () => (await centersOf(matH.id)).length === 0)
  await denied('centro inicial pede "Editar Materiais"', () => solic.rpc('set_material_origin_center', { p_material_id: matH.id, p_center_id: c1.id }), async () => (await centersOf(matH.id)).length === 0)
  await denied('centro de outro tenant não vira centro do material', () => padr.rpc('set_material_origin_center', { p_material_id: matH.id, p_center_id: cB.id }), async () => (await centersOf(matH.id)).length === 0)
  await denied('não informa centro em material de outro tenant', () => padr.rpc('set_material_origin_center', { p_material_id: matB.id, p_center_id: c1.id }), async () => (await centersOf(matB.id)).length === 0)
  await allowed('quem edita materiais informa o centro inicial de material antigo', () => padr.rpc('set_material_origin_center', { p_material_id: matH.id, p_center_id: c1.id }))
  const { data: matHAfter } = await admin.from('material_database').select('erp_status').eq('id', matH.id).single()
  record(matHAfter?.erp_status === 'pendente_erp', 'com centro novo, o material volta para Pendente ERP')
  await denied('material com centro não recebe outro centro inicial', () => padr.rpc('set_material_origin_center', { p_material_id: matH.id, p_center_id: c2.id }), async () => (await centersOf(matH.id)).length === 1)

  const { data: wfAmp } = await admin.from('workflow_header').select('id').eq('tenant_id', tA).eq('request_type', 'ampliacao').eq('is_active', true).single()
  record(Boolean(wfAmp), 'o tenant recebe o workflow de Ampliação')
  const ampRow = (extra) => ({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: wfAmp?.id, status: 'cadastro', requester: 'AMP', urgency: 'low', user_id: requester.id, request_type: 'ampliacao', target_material_id: matH.id, center_id: c2.id, change_fields: ['forjado'], technical_attributes: { sonda_centro: 'NOVO' }, ...extra })
  const ampCount = async () => ((await admin.from('material_requests').select('id').eq('target_material_id', matH.id).eq('request_type', 'ampliacao')).data ?? []).length
  await denied('ampliação não pede centro que o material já tem', () => solic.from('material_requests').insert(ampRow({ center_id: c1.id })).select('id'), async () => (await ampCount()) === 0)
  await denied('ampliação exige centro', () => solic.from('material_requests').insert(ampRow({ center_id: null })).select('id'), async () => (await ampCount()) === 0)
  await denied('ampliação não usa centro de outro tenant', () => solic.from('material_requests').insert(ampRow({ center_id: cB.id })).select('id'), async () => (await ampCount()) === 0)
  await denied('ampliação não aponta para material de outro tenant', () => solic.from('material_requests').insert(ampRow({ target_material_id: matB.id })).select('id'),
    async () => ((await admin.from('material_requests').select('id').eq('target_material_id', matB.id)).data ?? []).length === 0)
  const { data: ampCreated, error: ampErr } = await solic.from('material_requests').insert(ampRow({})).select('id').single()
  record(!ampErr && Boolean(ampCreated), 'solicitante abre a ampliação para o centro novo', ampErr?.message ?? '')
  const ampId = ampCreated?.id
  const { data: ampSaved } = ampId ? await admin.from('material_requests').select('change_fields, change_previous').eq('id', ampId).single() : { data: null }
  record(JSON.stringify(ampSaved?.change_fields) === JSON.stringify(['sonda_centro']) && ampSaved?.change_previous?.sonda_centro === 'ORIGEM',
    'os campos da ampliação vêm do dicionário (por centro), não do navegador')
  await denied('não abre duas ampliações do mesmo material para o mesmo centro', () => solic.from('material_requests').insert(ampRow({})).select('id'), async () => (await ampCount()) === 1)
  if (ampId) {
    await allowed('atendente assume a ampliação', () => atend.rpc('assign_request', { p_request_id: ampId }))
    await denied('o centro da ampliação não muda depois de aberta', () => atend.from('material_requests').update({ center_id: c1.id }).eq('id', ampId).select('id'),
      async () => (await admin.from('material_requests').select('center_id').eq('id', ampId).single()).data?.center_id === c2.id)
    await allowed('atendente aprova a ampliação', () => atend.rpc('advance_workflow', { p_request_id: ampId }))
    const rows = await centersOf(matH.id)
    const added = rows.find((r) => r.center_id === c2.id)
    record(Boolean(added) && !added.is_origin && added.attributes?.sonda_centro === 'NOVO' && added.request_id === ampId,
      'a aprovação final acrescenta o centro ao material com os valores do centro')
    const { data: matHFinal } = await admin.from('material_database').select('technical_attributes, erp_status').eq('id', matH.id).single()
    record(matHFinal?.technical_attributes?.sonda_centro === 'ORIGEM' && matHFinal?.erp_status === 'pendente_erp', 'o material mantém os seus campos e fica Pendente ERP')
    const { count: ampMaterials } = await admin.from('material_database').select('id', { count: 'exact', head: true }).eq('tenant_id', tA).eq('request_id', ampId)
    record((ampMaterials ?? 0) === 0, 'a ampliação não cria material novo')
    const { data: ampHist } = await admin.from('material_history').select('event_data').eq('material_id', matH.id).eq('event_type', 'center')
    record((ampHist ?? []).some((h) => Number(h.event_data?.request_id) === ampId), 'o histórico do material registra o centro acrescentado')
  }
  await denied('outro tenant não lê os centros dos materiais do A', () => relB.from('material_centers').select('id').eq('material_id', matH.id))

  const cadRow = (extra) => ({ tenant_id: tA, pdm_id: flowA.pdmId, workflow_id: flowA.workflowId, status: 'cadastro', requester: `CENTRO-${tag}`, urgency: 'low', user_id: requester.id, ...extra })
  const cadCount = async () => ((await admin.from('material_requests').select('id').eq('requester', `CENTRO-${tag}`)).data ?? []).length
  await denied('com centro cadastrado, o cadastro exige o centro', () => solic.from('material_requests').insert(cadRow({})).select('id'), async () => (await cadCount()) === 0)
  await denied('cadastro não usa centro de outro tenant', () => solic.from('material_requests').insert(cadRow({ center_id: cB.id })).select('id'), async () => (await cadCount()) === 0)
  const { data: cadCreated, error: cadErr } = await solic.from('material_requests').insert(cadRow({ center_id: c1.id })).select('id').single()
  record(!cadErr && Boolean(cadCreated), 'cadastro com o centro inicial é aberto', cadErr?.message ?? '')
  if (cadCreated) {
    await allowed('atendente assume o cadastro com centro', () => atend.rpc('assign_request', { p_request_id: cadCreated.id }))
    await allowed('atendente aprova o cadastro com centro', () => atend.rpc('advance_workflow', { p_request_id: cadCreated.id }))
    const { data: born } = await admin.from('material_database').select('id').eq('tenant_id', tA).eq('request_id', cadCreated.id).maybeSingle()
    const bornCenters = born ? await centersOf(born.id) : []
    record(bornCenters.length === 1 && bornCenters[0].center_id === c1.id && bornCenters[0].is_origin, 'o material novo nasce com o centro inicial')
  }

  console.log('\nReenvio da rejeitada pelo caminho do tipo (migration 047)')
  const reqOf = async (id) => (await admin.from('material_requests').select('status, pdm_id, center_id, change_fields, technical_attributes').eq('id', id).single()).data
  const stillRejected = (id) => async () => (await reqOf(id))?.status === 'Rejected'
  const reject = async (id) => {
    await must(atend.rpc('assign_request', { p_request_id: id }), 'assumir para rejeitar')
    await must(atend.rpc('reject_request', { p_request_id: id, p_reason: 'SONDA', p_category: 'outro' }), 'rejeitar')
  }
  const { data: alt2, error: alt2Err } = await solic.from('material_requests').insert(altRow({ technical_attributes: { sonda_campo: 'OUTRO' } })).select('id').single()
  if (alt2Err) record(false, 'abre outra alteração para rejeitar', alt2Err.message)
  if (alt2) {
    await reject(alt2.id)
    const [otherPdm] = await must(admin.from('pdm_templates').insert({ tenant_id: tA, name: `SONDA OUTRO ${tag}`, internal_code: `SOO${tag.slice(0, 3).toUpperCase()}`.replace(/[^A-Z0-9]/g, 'X'), is_active: true, attributes: [] }).select('id'), 'outro PDM')
    await denied('alteração não é reenviada pelo caminho do cadastro (troca de PDM)', () => solic.rpc('resubmit_request', { p_request_id: alt2.id, p_pdm_id: otherPdm.id, p_technical_attributes: {}, p_generated_description: 'HACK' }), stillRejected(alt2.id))
    await denied('reenvio da alteração não troca o Tipo de Material', () => solic.rpc('resubmit_change_request', { p_request_id: alt2.id, p_change_fields: ['tipo_material'], p_technical_attributes: { tipo_material: 'NLAG' } }), stillRejected(alt2.id))
    await denied('quem não abriu a alteração não reenvia', () => compras.rpc('resubmit_change_request', { p_request_id: alt2.id, p_change_fields: ['sonda_campo'], p_technical_attributes: { sonda_campo: 'X' } }), stillRejected(alt2.id))
    await allowed('solicitante reenvia a alteração corrigida', () => solic.rpc('resubmit_change_request', { p_request_id: alt2.id, p_change_fields: ['sonda_campo'], p_technical_attributes: { sonda_campo: 'CORRIGIDO' } }))
    const back = await reqOf(alt2.id)
    record(back?.status === 'cadastro' && back?.pdm_id === flowA.pdmId && JSON.stringify(back?.change_fields) === JSON.stringify(['sonda_campo']),
      'a alteração volta para a primeira etapa com o mesmo PDM e os campos escolhidos')
  }

  const [c3] = await must(cent.from('centers').insert({ tenant_id: tA, code: '1003', name: 'SONDA TRES' }).select('id'), 'centro 3')
  const { data: amp2, error: amp2Err } = await solic.from('material_requests').insert(ampRow({ center_id: c3.id })).select('id').single()
  if (amp2Err) record(false, 'abre outra ampliação para rejeitar', amp2Err.message)
  if (amp2) {
    await reject(amp2.id)
    await denied('ampliação não é reenviada pelo caminho do cadastro', () => solic.rpc('resubmit_request', { p_request_id: amp2.id, p_pdm_id: flowA.pdmId, p_technical_attributes: {}, p_generated_description: 'HACK' }), stillRejected(amp2.id))
    await denied('ampliação não é reenviada como alteração', () => solic.rpc('resubmit_change_request', { p_request_id: amp2.id, p_change_fields: ['sonda_campo'], p_technical_attributes: {} }), stillRejected(amp2.id))
    await denied('reenvio da ampliação não troca para centro que o material já tem (migration 048)', () => solic.rpc('resubmit_expansion_request', { p_request_id: amp2.id, p_technical_attributes: {}, p_center_id: c1.id }), stillRejected(amp2.id))
    await denied('reenvio da ampliação não troca para centro de outro tenant', () => solic.rpc('resubmit_expansion_request', { p_request_id: amp2.id, p_technical_attributes: {}, p_center_id: cB.id }), stillRejected(amp2.id))
    const [c4] = await must(cent.from('centers').insert({ tenant_id: tA, code: '1004', name: 'SONDA QUATRO' }).select('id'), 'centro 4')
    await allowed('solicitante reenvia a ampliação corrigida em outro centro', () => solic.rpc('resubmit_expansion_request', { p_request_id: amp2.id, p_technical_attributes: { sonda_centro: 'CORRIGIDO' }, p_center_id: c4.id }))
    const back = await reqOf(amp2.id)
    record(back?.status === 'cadastro' && back?.center_id === c4.id && JSON.stringify(back?.change_fields) === JSON.stringify(['sonda_centro']),
      'a ampliação volta para a primeira etapa no centro escolhido, com os campos por centro do dicionário')
  }
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
