import * as fs from 'fs'
import { randomBytes } from 'crypto'
import './helpers/env'
import { admin, deleteTenant, must } from './helpers/supabase'
import { AUTH_DIR, ROLES, STATE_FILE, saveState, type RoleKey, type TestState, type TestUser } from './helpers/state'

/** Nome do papel do onboarding para cada usuário de teste. */
const ROLE_NAMES: Record<RoleKey, string> = {
  admin: 'ADMIN',
  solicitante: 'SOLICITANTE',
  cadastro: 'CADASTRO',
  compras: 'COMPRAS',
  mrp: 'MRP',
  fiscal: 'FISCAL',
  contabilidade: 'CONTABILIDADE',
}

/**
 * Tenant temporário montado pelo mesmo caminho do onboarding (create_tenant_onboarding +
 * copy_default_fields), com um usuário por papel e um PDM base. Apagado no global-teardown.
 */
export default async function globalSetup() {
  if (fs.existsSync(STATE_FILE)) {
    // Rodada anterior interrompida: limpa antes de montar outra.
    try {
      const old = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as TestState
      await deleteTenant(old.tenantId)
    } catch {
      /* já apagado */
    }
    fs.unlinkSync(STATE_FILE)
  }
  fs.rmSync(AUTH_DIR, { recursive: true, force: true })
  fs.mkdirSync(AUTH_DIR, { recursive: true })

  const runId = randomBytes(3).toString('hex').toUpperCase()
  const password = `E2e${randomBytes(12).toString('hex')}9!`

  const onboarding = await must(admin.rpc('create_tenant_onboarding', {
    p_tenant_name: `E2E ${runId}`,
    p_slug: `e2e-${runId.toLowerCase()}`,
    p_admin_name: 'Admin E2E',
    p_admin_email: `admin.e2e.${runId.toLowerCase()}@example.com`,
    p_admin_password: null,
  }), 'onboarding') as { tenant_id: number }
  const tenantId = onboarding.tenant_id
  console.log(`\n[e2e] tenant ${tenantId} (E2E ${runId})`)

  try {
    await must(admin.rpc('copy_default_fields', { p_tenant_id: tenantId }), 'campos padrão')

    const roles = await must(admin.from('roles').select('id, name').eq('tenant_id', tenantId), 'papéis') as { id: number; name: string }[]
    const createUser = async (key: string, roleName: string): Promise<TestUser> => {
      const role = roles.find((r) => r.name.toUpperCase() === roleName)
      if (!role) throw new Error(`papel ${roleName} não veio do onboarding`)
      const email = `${key}.e2e.${runId.toLowerCase()}@example.com`
      const name = `${key.toUpperCase()} E2E`
      const created = await must(admin.auth.admin.createUser({
        email, password, email_confirm: true, app_metadata: { tenant_id: tenantId },
      }), `usuário ${key}`) as { user: { id: string } }
      await must(admin.from('users').insert({ id: created.user.id, tenant_id: tenantId, name, role_id: role.id }), `perfil ${key}`)
      await must(admin.from('user_role_groups').insert({ user_id: created.user.id, role_id: role.id }), `grupo ${key}`)
      return { id: created.user.id, email, name, roleId: role.id }
    }
    const users = {} as Record<RoleKey, TestUser>
    for (const key of ROLES) users[key] = await createUser(key, ROLE_NAMES[key])
    const spare = await createUser('avulso', 'SOLICITANTE')

    const pdmCode = `E2E${runId.slice(0, 4)}`.replace(/[^A-Z0-9]/g, 'X').slice(0, 10)
    const pdmName = `E2E VALVULA ${runId}`
    const [pdm] = await must(admin.from('pdm_templates').insert({
      tenant_id: tenantId,
      name: pdmName,
      internal_code: pdmCode,
      is_active: true,
      attributes: [
        {
          id: 'material', order: 1, name: 'MATERIAL', dataType: 'lov', isRequired: true, includeInDescription: true,
          abbreviation: 'MAT', allowedValues: [{ value: 'ACO INOX', abbreviation: 'INOX' }, { value: 'LATAO', abbreviation: 'LAT' }],
        },
        { id: 'modelo', order: 2, name: 'MODELO', dataType: 'text', isRequired: true, includeInDescription: true, abbreviation: 'MOD' },
      ],
    }).select('id'), 'PDM base') as { id: number }[]

    saveState({ runId, tenantId, password, users, spare, pdm: { id: pdm.id, code: pdmCode, name: pdmName } })
  } catch (e) {
    await deleteTenant(tenantId).catch(() => undefined)
    throw e
  }
}
