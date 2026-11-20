import { describe, expect, it, vi } from 'vitest'
import { buildCurrentUser, identityFromMetadata, loadCurrentUser, type SessionIdentity } from './current-user'

const profile = {
  id: 'u1',
  tenant_id: 2,
  name: 'ANA',
  role_id: 7,
  is_active: true,
  preferences: { theme: 'dark', language: 'en' },
  max_description_length: null,
  created_at: '2026-01-01',
  roles: { name: 'CADASTRO', role_type: 'etapa', permissions: { can_attend: true } },
  tenants: { name: 'EMPRESA A' },
}

const identity = (over: Partial<SessionIdentity> = {}): SessionIdentity => ({
  id: 'u1',
  email: 'ana@a.com',
  isMaster: false,
  tokenTenantId: 2,
  ...over,
})

describe('identityFromMetadata', () => {
  it('lê Master e empresa do token', () => {
    expect(identityFromMetadata('u1', 'm@x', { is_master: true, tenant_id: '5' })).toEqual({
      id: 'u1', email: 'm@x', isMaster: true, tokenTenantId: 5,
    })
  })
  it('sem metadados: não é Master e não tem empresa no token', () => {
    expect(identityFromMetadata('u1', undefined, undefined)).toEqual({ id: 'u1', email: '', isMaster: false, tokenTenantId: null })
  })
  it('is_master só vale com true de verdade', () => {
    expect(identityFromMetadata('u1', 'a', { is_master: 'true' }).isMaster).toBe(false)
  })
})

describe('buildCurrentUser', () => {
  it('com grupos: junta as permissões dos grupos e os extras', () => {
    const user = buildCurrentUser(
      identity(),
      profile,
      [{ roles: { name: 'CADASTRO', permissions: { can_attend: true } } }, { roles: [{ name: 'COMPRAS', permissions: { can_approve: true } }] }],
      ['can_view_reports'],
      null
    )
    expect(user.role_permissions.can_attend).toBe(true)
    expect(user.role_permissions.can_approve).toBe(true)
    expect(user.role_permissions.can_view_reports).toBe(true)
    expect(user.role_permissions.can_manage_users).toBe(false)
    expect(user.has_admin_group).toBe(false)
  })

  it('sem grupos: usa o papel do perfil e ignora os extras (como antes)', () => {
    const user = buildCurrentUser(identity(), profile, [], ['can_view_reports'], null)
    expect(user.role_permissions.can_attend).toBe(true)
    expect(user.role_permissions.can_view_reports).toBe(false)
  })

  it('grupo ADMIN marca has_admin_group', () => {
    const user = buildCurrentUser(identity(), profile, [{ roles: { name: 'admin', permissions: {} } }], [], null)
    expect(user.has_admin_group).toBe(true)
  })

  it('Master tem todas as permissões e usa a empresa do token quando trocou', () => {
    const user = buildCurrentUser(identity({ isMaster: true, tokenTenantId: 9 }), profile, [], [], 'EMPRESA B')
    expect(Object.values(user.role_permissions).every(Boolean)).toBe(true)
    expect(user.tenant_id).toBe(9)
    expect(user.tenant_name).toBe('EMPRESA B')
    expect(user.is_master).toBe(true)
  })

  it('Master na própria empresa fica com o nome do perfil', () => {
    const user = buildCurrentUser(identity({ isMaster: true, tokenTenantId: 2 }), profile, [], [], 'OUTRO')
    expect(user.tenant_id).toBe(2)
    expect(user.tenant_name).toBe('EMPRESA A')
  })

  it('quem não é Master nunca usa a empresa do token', () => {
    const user = buildCurrentUser(identity({ tokenTenantId: 9 }), profile, [], [], 'EMPRESA B')
    expect(user.tenant_id).toBe(2)
    expect(user.tenant_name).toBe('EMPRESA A')
  })

  it('preferências e limite da descrição têm padrão', () => {
    const user = buildCurrentUser(identity(), { ...profile, preferences: null, max_description_length: null }, [], [], null)
    expect(user.preferences).toEqual({ theme: 'light', language: 'pt' })
    expect(user.max_description_length).toBe(40)
  })
})

describe('loadCurrentUser', () => {
  function fakeClient(result: Record<string, { data: unknown; error?: unknown }>) {
    const from = vi.fn((table: string) => {
      const res = { data: result[table]?.data ?? null, error: result[table]?.error ?? null }
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: () => Promise.resolve(res),
        maybeSingle: () => Promise.resolve(res),
        then: (ok: (value: typeof res) => unknown) => Promise.resolve(res).then(ok),
      }
      return chain
    })
    return { from } as never
  }

  it('lê perfil, grupos e extras de uma vez e monta o usuário', async () => {
    const client = fakeClient({
      users: { data: profile },
      user_role_groups: { data: [{ roles: { name: 'CADASTRO', permissions: { can_attend: true } } }] },
      user_permission_grants: { data: [{ permission_key: 'can_view_reports' }] },
    })
    const user = await loadCurrentUser(client, identity())
    expect(user?.name).toBe('ANA')
    expect(user?.role_permissions.can_view_reports).toBe(true)
    expect((client as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalledWith('tenants')
  })

  it('perfil ausente devolve null', async () => {
    const client = fakeClient({ users: { data: null, error: { message: 'not found' } } })
    expect(await loadCurrentUser(client, identity())).toBeNull()
  })

  it('Master consulta o nome da empresa do token', async () => {
    const client = fakeClient({ users: { data: profile }, tenants: { data: { name: 'EMPRESA B' } } })
    const user = await loadCurrentUser(client, identity({ isMaster: true, tokenTenantId: 9 }))
    expect(user?.tenant_name).toBe('EMPRESA B')
  })
})
