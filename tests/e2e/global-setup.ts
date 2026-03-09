import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') })

const API_URL = process.env.TEST_API_URL || 'http://localhost:8000'
const STATE_FILE = path.resolve(__dirname, 'test-state.json')

async function post(url: string, body: Record<string, unknown>, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  try {
    return { status: res.status, data: JSON.parse(text) }
  } catch {
    return { status: res.status, data: text }
  }
}

export default async function globalSetup() {
  const RUN_ID = Date.now()
  console.log(`\n[setup] RUN_ID: ${RUN_ID}`)

  // 1. Login master
  const loginRes = await post(`${API_URL}/admin/auth/login`, {
    email: process.env.MASTER_EMAIL,
    password: process.env.MASTER_PASSWORD,
  })
  if (!loginRes.data.access_token) {
    throw new Error(`Master login falhou: ${JSON.stringify(loginRes.data)}`)
  }
  const masterToken = loginRes.data.access_token as string
  console.log('[setup] Master login OK')

  // 2. Onboarding: criar tenant + admin (usa temp_password)
  const adminEmail = `admin.e2e.${RUN_ID}@test.com`
  const adminPassword = 'Senha@123456'
  const onboardRes = await post(
    `${API_URL}/admin/tenants/onboarding`,
    {
      tenant_name: `Empresa Teste E2E ${RUN_ID}`,
      tenant_slug: `e2e-${RUN_ID}`,
      admin_name: 'Admin E2E',
      admin_email: adminEmail,
      temp_password: adminPassword,
    },
    masterToken
  )
  if (onboardRes.status !== 201) {
    throw new Error(`Onboarding falhou: ${JSON.stringify(onboardRes.data)}`)
  }
  const tenantId = onboardRes.data.tenant_id as number
  console.log(`[setup] Tenant criado: ${tenantId}`)

  // 3. Login como admin do novo tenant
  const adminLoginRes = await post(`${API_URL}/admin/auth/login`, {
    email: adminEmail,
    password: adminPassword,
  })
  if (!adminLoginRes.data.access_token) {
    throw new Error(`Admin login falhou: ${JSON.stringify(adminLoginRes.data)}`)
  }
  const adminToken = adminLoginRes.data.access_token as string
  console.log('[setup] Admin login OK')

  // 4. Buscar roles do tenant (admin token já está no contexto do tenant)
  const rolesRes = await fetch(`${API_URL}/admin/roles`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const roles = (await rolesRes.json()) as Array<{ id: number; name: string }>
  const cadastroRole = roles.find((r) => (r.name || '').toUpperCase() === 'CADASTRO')
  const operatorRole = cadastroRole || roles.find((r) =>
    ['OPERADOR', 'OPERATOR', 'USER'].includes((r.name || '').toUpperCase())
  )
  if (!operatorRole) {
    throw new Error(`Role CADASTRO não encontrada. Roles: ${roles.map((r) => r.name).join(', ')}`)
  }
  console.log(`[setup] Role operador: ${operatorRole.name} (id: ${operatorRole.id})`)

  const workflowRoles = [
    { key: 'compras', name: 'COMPRAS' },
    { key: 'mrp', name: 'MRP' },
    { key: 'fiscal', name: 'FISCAL' },
    { key: 'contabilidade', name: 'CONTABILIDADE' },
  ] as const
  const roleMap: Record<string, { id: number; name: string }> = {}
  for (const wr of workflowRoles) {
    const r = roles.find((x) => (x.name || '').toUpperCase() === wr.name)
    if (r) roleMap[wr.key] = r
    else console.log(`[setup] Role ${wr.name} não encontrado, ignorando`)
  }

  // 5. Criar operador usando token do admin
  const operatorEmail = `operador.e2e.${RUN_ID}@test.com`
  const operatorPassword = 'Senha@123456'

  console.log(`[setup] Criando operador com role_id=${operatorRole.id}, token admin válido`)

  const operatorRes = await post(
    `${API_URL}/admin/users`,
    {
      name: 'Operador E2E',
      email: operatorEmail,
      password: operatorPassword,
      role_id: operatorRole.id,
    },
    adminToken
  )

  console.log(`[setup] Resposta criação operador: status=${operatorRes.status}, data=${JSON.stringify(operatorRes.data)}`)

  let finalOperatorEmail = operatorEmail
  let operatorUserId: number

  const operatorData = operatorRes.data as { id?: number }
  if (!operatorData?.id) {
    console.log('[setup] Tentativa 2 após 2s...')
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const retryEmail = `operador2.e2e.${RUN_ID}@test.com`
    const retryRes = await post(
      `${API_URL}/admin/users`,
      {
        name: 'Operador E2E',
        email: retryEmail,
        password: operatorPassword,
        role_id: operatorRole.id,
      },
      adminToken
    )

    console.log(`[setup] Retry resposta: status=${retryRes.status}, data=${JSON.stringify(retryRes.data)}`)

    const retryData = retryRes.data as { id?: number }
    if (!retryData?.id) {
      throw new Error(`Criação de operador falhou após retry: ${JSON.stringify(retryRes.data)}`)
    }

    finalOperatorEmail = retryEmail
    operatorUserId = retryData.id
    console.log(`[setup] Operador criado (retry): ${operatorUserId}`)
  } else {
    operatorUserId = operatorData.id
    console.log(`[setup] Operador criado: ${operatorUserId}`)
  }

  const extraUsers: Record<string, { userId: number; email: string; roleId: number }> = {}
  for (const wr of workflowRoles) {
    const role = roleMap[wr.key]
    if (!role) continue
    const email = `${wr.key}.e2e.${RUN_ID}@test.com`
    const name = wr.key === 'compras' ? 'Compras E2E' : wr.key === 'mrp' ? 'MRP E2E' : wr.key === 'fiscal' ? 'Fiscal E2E' : 'Contabilidade E2E'
    const res = await post(
      `${API_URL}/admin/users`,
      { name, email, password: operatorPassword, role_id: role.id },
      adminToken
    )
    const data = res.data as { id?: number }
    if (data?.id) {
      extraUsers[wr.key] = { userId: data.id, email, roleId: role.id }
      console.log(`[setup] Usuário ${wr.key} criado: ${data.id}`)
    } else {
      console.log(`[setup] Falha ao criar ${wr.key}: ${JSON.stringify(res.data)}`)
    }
  }

  // 6. Salvar estado para os testes
  const state: Record<string, unknown> = {
    RUN_ID,
    tenantId,
    masterToken,
    adminEmail,
    adminPassword,
    adminToken,
    operatorEmail: finalOperatorEmail,
    operatorPassword,
    operatorUserId,
    operatorRoleId: operatorRole.id,
  }
  if (extraUsers.compras) {
    state.comprasUserId = extraUsers.compras.userId
    state.comprasEmail = extraUsers.compras.email
    state.comprasPassword = operatorPassword
    state.comprasRoleId = extraUsers.compras.roleId
  }
  if (extraUsers.mrp) {
    state.mrpUserId = extraUsers.mrp.userId
    state.mrpEmail = extraUsers.mrp.email
    state.mrpPassword = operatorPassword
    state.mrpRoleId = extraUsers.mrp.roleId
  }
  if (extraUsers.fiscal) {
    state.fiscalUserId = extraUsers.fiscal.userId
    state.fiscalEmail = extraUsers.fiscal.email
    state.fiscalPassword = operatorPassword
    state.fiscalRoleId = extraUsers.fiscal.roleId
  }
  if (extraUsers.contabilidade) {
    state.contabilidadeUserId = extraUsers.contabilidade.userId
    state.contabilidadeEmail = extraUsers.contabilidade.email
    state.contabilidadePassword = operatorPassword
    state.contabilidadeRoleId = extraUsers.contabilidade.roleId
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  console.log(`[setup] Estado salvo em ${STATE_FILE}`)
}
