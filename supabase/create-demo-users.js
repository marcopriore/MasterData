#!/usr/bin/env node
/**
 * Cria o tenant "Empresa Demo" e os 7 usuários de demonstração via Supabase Admin API.
 * Executar: node supabase/create-demo-users.js
 *
 * Requer variáveis de ambiente (web/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const path = require('path')
const fs = require('fs')

// Carregar .env.local do projeto web (relativo a supabase/)
const envPath = path.resolve(__dirname, '../web/.env.local')
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  content.split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) {
      const key = m[1].trim()
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      process.env[key] = val
    }
  })
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://eexnvqewnrerbehmhphl.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Erro: SUPABASE_SERVICE_ROLE_KEY não encontrada. Defina em web/.env.local')
  process.exit(1)
}

// Executar de dentro de web/:  node ../supabase/create-demo-users.js
const { createClient } = require(path.resolve(__dirname, '../web/node_modules/@supabase/supabase-js'))
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASSWORD = 'Senha@123456'

const ROLES = [
  { name: 'ADMIN', role_type: 'sistema', permissions: { can_submit_request: true, can_approve: true, can_reject: true, can_edit_pdm: true, can_view_pdm: true, can_view_logs: true, can_bulk_import: true, can_standardize: true, can_manage_roles: true, can_manage_users: true, can_manage_fields: true, can_manage_value_dictionary: true, can_view_database: true, can_edit_workflows: true, can_view_workflows: true } },
  { name: 'SOLICITANTE', role_type: 'operacional', permissions: { can_submit_request: true, can_approve: false, can_reject: false, can_edit_pdm: false, can_view_pdm: true, can_view_logs: false, can_bulk_import: false, can_standardize: false, can_manage_roles: false, can_manage_users: false, can_manage_fields: false, can_manage_value_dictionary: false, can_view_database: true, can_edit_workflows: false, can_view_workflows: true } },
  { name: 'CADASTRO', role_type: 'operacional', permissions: { can_submit_request: true, can_approve: true, can_reject: true, can_edit_pdm: true, can_view_pdm: true, can_view_logs: false, can_bulk_import: true, can_standardize: true, can_manage_roles: false, can_manage_users: false, can_manage_fields: true, can_manage_value_dictionary: false, can_view_database: true, can_edit_workflows: false, can_view_workflows: true } },
  { name: 'COMPRAS', role_type: 'operacional', permissions: { can_submit_request: false, can_approve: true, can_reject: true, can_edit_pdm: false, can_view_pdm: true, can_view_logs: false, can_bulk_import: false, can_standardize: false, can_manage_roles: false, can_manage_users: false, can_manage_fields: false, can_manage_value_dictionary: false, can_view_database: true, can_edit_workflows: false, can_view_workflows: true } },
  { name: 'MRP', role_type: 'operacional', permissions: { can_submit_request: false, can_approve: true, can_reject: true, can_edit_pdm: false, can_view_pdm: true, can_view_logs: false, can_bulk_import: false, can_standardize: false, can_manage_roles: false, can_manage_users: false, can_manage_fields: false, can_manage_value_dictionary: false, can_view_database: true, can_edit_workflows: false, can_view_workflows: true } },
  { name: 'FISCAL', role_type: 'operacional', permissions: { can_submit_request: false, can_approve: true, can_reject: true, can_edit_pdm: false, can_view_pdm: true, can_view_logs: false, can_bulk_import: false, can_standardize: false, can_manage_roles: false, can_manage_users: false, can_manage_fields: false, can_manage_value_dictionary: false, can_view_database: true, can_edit_workflows: false, can_view_workflows: true } },
  { name: 'CONTABILIDADE', role_type: 'operacional', permissions: { can_submit_request: false, can_approve: true, can_reject: true, can_edit_pdm: false, can_view_pdm: true, can_view_logs: false, can_bulk_import: false, can_standardize: false, can_manage_roles: false, can_manage_users: false, can_manage_fields: false, can_manage_value_dictionary: false, can_view_database: true, can_edit_workflows: false, can_view_workflows: true } },
  { name: 'MASTER', role_type: 'sistema', permissions: { can_submit_request: true, can_approve: true, can_reject: true, can_edit_pdm: true, can_view_pdm: true, can_view_logs: true, can_bulk_import: true, can_standardize: true, can_manage_roles: true, can_manage_users: true, can_manage_fields: true, can_manage_value_dictionary: true, can_view_database: true, can_edit_workflows: true, can_view_workflows: true } },
]

const WORKFLOW_STEPS = [
  { step_name: 'Central de Cadastro', status_key: 'cadastro', order: 1 },
  { step_name: 'Compras', status_key: 'compras', order: 2 },
  { step_name: 'MRP', status_key: 'mrp', order: 3 },
  { step_name: 'Fiscal', status_key: 'fiscal', order: 4 },
  { step_name: 'Contabilidade', status_key: 'contabilidade', order: 5 },
  { step_name: 'Finalizado', status_key: 'finalizado', order: 6 },
]

const USERS = [
  { name: 'Admin Demo', email: 'admin@empresademo.com', role: 'ADMIN' },
  { name: 'João Cadastro', email: 'joao.cadastro@empresademo.com', role: 'CADASTRO' },
  { name: 'Maria Compras', email: 'maria.compras@empresademo.com', role: 'COMPRAS' },
  { name: 'Pedro MRP', email: 'pedro.mrp@empresademo.com', role: 'MRP' },
  { name: 'Ana Fiscal', email: 'ana.fiscal@empresademo.com', role: 'FISCAL' },
  { name: 'Carlos Contab', email: 'carlos.contab@empresademo.com', role: 'CONTABILIDADE' },
  { name: 'Lucia Solicitante', email: 'lucia.solicitante@empresademo.com', role: 'SOLICITANTE' },
]

async function main() {
  console.log('Criando tenant Empresa Demo e usuários...\n')

  let tenantId
  const { data: existingTenant } = await supabase.from('tenants').select('id').eq('slug', 'empresa-demo').single()

  if (existingTenant) {
    tenantId = existingTenant.id
    console.log(`Tenant "Empresa Demo" já existe (id=${tenantId})`)
  } else {
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .insert({ name: 'Empresa Demo', slug: 'empresa-demo', is_active: true, max_description_length: 40 })
      .select('id')
      .single()
    if (tenantErr) {
      console.error('Erro ao criar tenant:', tenantErr.message)
      process.exit(1)
    }
    tenantId = tenant.id
    console.log(`Tenant "Empresa Demo" criado (id=${tenantId})`)
  }

  const { data: existingRoles } = await supabase.from('roles').select('id').eq('tenant_id', tenantId).limit(1)
  if (existingRoles?.length) {
    console.log('Roles já existem para o tenant')
  } else {
    for (const r of ROLES) {
      const { error } = await supabase.from('roles').insert({
        tenant_id: tenantId,
        name: r.name,
        role_type: r.role_type,
        permissions: r.permissions,
      })
      if (error) {
        console.error(`Erro ao criar role ${r.name}:`, error.message)
        process.exit(1)
      }
    }
    console.log(`${ROLES.length} roles criados`)
  }

  const { data: existingWf } = await supabase.from('workflow_header').select('id').eq('tenant_id', tenantId).limit(1)
  let workflowId
  if (existingWf?.length) {
    workflowId = existingWf[0].id
    console.log(`Workflow já existe (id=${workflowId})`)
  } else {
    const { data: wh, error: whErr } = await supabase
      .from('workflow_header')
      .insert({
        tenant_id: tenantId,
        name: 'Fluxo Padrão de Cadastro',
        description: 'Fluxo padrão: Central de Cadastro → Compras → MRP → Fiscal → Contabilidade → Finalizado',
        is_active: true,
      })
      .select('id')
      .single()
    if (whErr) {
      console.error('Erro ao criar workflow:', whErr.message)
      process.exit(1)
    }
    workflowId = wh.id
    for (const s of WORKFLOW_STEPS) {
      await supabase.from('workflow_config').insert({
        tenant_id: tenantId,
        workflow_id: workflowId,
        step_name: s.step_name,
        status_key: s.status_key,
        order: s.order,
        is_active: true,
      })
    }
    console.log('Workflow e 6 etapas criados')
  }

  const { data: existingFields } = await supabase.from('field_dictionary').select('id').eq('tenant_id', tenantId).limit(1)
  if (!existingFields?.length) {
    const fields = [
      { field_name: 'descricao_basica', field_label: 'Descrição Básica', sap_field: 'MAKTX', sap_view: 'dados_basicos', field_type: 'text', responsible_role: 'CADASTRO', is_required: true, display_order: 1 },
      { field_name: 'grupo_mercadorias', field_label: 'Grupo de Mercadorias', sap_field: 'MATKL', sap_view: 'dados_basicos', field_type: 'select', responsible_role: 'CADASTRO', is_required: true, display_order: 2 },
      { field_name: 'unidade_medida_base', field_label: 'Unidade de Medida Base', sap_field: 'MEINS', sap_view: 'dados_basicos', field_type: 'select', responsible_role: 'CADASTRO', is_required: true, display_order: 3 },
      { field_name: 'ncm', field_label: 'NCM', sap_field: 'J_1BNCM', sap_view: 'fiscal', field_type: 'text', responsible_role: 'FISCAL', is_required: true, display_order: 1 },
      { field_name: 'tipo_mrp', field_label: 'Tipo MRP', sap_field: 'DISMM', sap_view: 'mrp', field_type: 'select', responsible_role: 'MRP', is_required: true, display_order: 1 },
    ]
    for (const f of fields) {
      await supabase.from('field_dictionary').insert({ tenant_id: tenantId, ...f })
    }
    console.log('Field dictionary criado')
  }

  const roleIds = {}
  const { data: roles } = await supabase.from('roles').select('id, name').eq('tenant_id', tenantId)
  for (const r of roles || []) roleIds[r.name] = r.id

  for (const u of USERS) {
    const roleId = roleIds[u.role]
    if (!roleId) {
      console.error(`Role ${u.role} não encontrada`)
      continue
    }

    const { data: existingAuth } = await supabase.auth.admin.listUsers()
    const found = existingAuth?.users?.find((au) => au.email === u.email)

    if (found) {
      await supabase.auth.admin.updateUserById(found.id, {
        app_metadata: { tenant_id: tenantId, is_master: false },
      })
      const { data: prof } = await supabase.from('users').select('id').eq('id', found.id).single()
      if (!prof) {
        await supabase.from('users').insert({
          id: found.id,
          tenant_id: tenantId,
          name: u.name,
          role_id: roleId,
        })
        console.log(`Perfil criado para ${u.email}`)
      } else {
        await supabase.from('users').update({ role_id: roleId, tenant_id: tenantId }).eq('id', found.id)
        console.log(`Usuário ${u.email} já existe, perfil atualizado`)
      }
      continue
    }

    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { tenant_id: tenantId, is_master: false },
    })

    if (authErr) {
      console.error(`Erro ao criar usuário ${u.email}:`, authErr.message)
      continue
    }

    const { error: profileErr } = await supabase.from('users').insert({
      id: authUser.user.id,
      tenant_id: tenantId,
      name: u.name,
      role_id: roleId,
    })

    if (profileErr) {
      console.error(`Erro ao criar perfil ${u.email}:`, profileErr.message)
      await supabase.auth.admin.deleteUser(authUser.user.id)
      continue
    }

    const { data: prefs } = await supabase.from('user_notification_prefs').select('id').eq('user_id', authUser.user.id).single()
    if (!prefs) {
      await supabase.from('user_notification_prefs').insert({
        tenant_id: tenantId,
        user_id: authUser.user.id,
      })
    }

    console.log(`Usuário criado: ${u.email} (${u.role})`)
  }

  console.log('\nConcluído! Execute o SQL supabase/seed_demo.sql no SQL Editor do Supabase.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
