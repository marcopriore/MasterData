import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

import { emptyPermissions, type RolePermissions } from './permissions'
import { callerCanManageUsers, planUserAccess } from './user-access'

function role(id: number, tenantId: number, partial: Partial<RolePermissions>) {
  return {
    id,
    name: 'GRUPO',
    tenant_id: tenantId,
    permissions: { ...emptyPermissions(), can_view_database: false, ...partial },
  }
}

describe('plano do que gravar no usuário', () => {
  const solicitante = role(1, 10, { can_submit_request: true })
  const cadastro = role(2, 10, { can_attend: true })

  it('recusa usuário sem grupo', () => {
    const plan = planUserAccess({
      tenantId: 10,
      groupIds: [],
      stageRoleId: 1,
      grantKeys: [],
      roles: [],
    })
    expect(plan.error).toMatch(/ao menos um grupo/)
  })

  it('papel de etapa precisa estar entre os grupos', () => {
    const plan = planUserAccess({
      tenantId: 10,
      groupIds: [1],
      stageRoleId: 2,
      grantKeys: [],
      roles: [solicitante],
    })
    expect(plan.error).toMatch(/papel de etapa/)
  })

  it('recusa grupo de outro tenant', () => {
    const plan = planUserAccess({
      tenantId: 10,
      groupIds: [1],
      stageRoleId: 1,
      grantKeys: [],
      roles: [role(1, 99, { can_submit_request: true })],
    })
    expect(plan.error).toMatch(/outro tenant/)
  })

  it('não grava extra que o grupo já cobre', () => {
    const plan = planUserAccess({
      tenantId: 10,
      groupIds: [1, 2, 2],
      stageRoleId: 2,
      grantKeys: ['can_submit_request', 'can_view_logs', 'can_view_logs', 'lixo'],
      roles: [solicitante, cadastro],
    })
    expect(plan.error).toBeUndefined()
    expect(plan.groupIds).toEqual([1, 2])
    expect(plan.extras).toEqual(['can_view_logs'])
  })
})

function query(payload: { data: unknown; error?: unknown }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: async () => payload,
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: payload.data, error: payload.error ?? null }).then(resolve, reject),
  }
  return builder
}

describe('quem pode gerir usuários', () => {
  it('master pode, mesmo sem a flag', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'users') return query({ data: { tenant_id: 1, roles: { name: 'MASTER', permissions: emptyPermissions() } } })
        return query({ data: [] })
      },
    }
    const result = await callerCanManageUsers(supabase, 'user-1', true)
    expect(result).toEqual({ allowed: true, tenantId: 1 })
  })

  it('flag no grupo libera', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'users') return query({ data: { tenant_id: 4, roles: { name: 'SOLICITANTE', permissions: emptyPermissions() } } })
        if (table === 'user_role_groups') {
          return query({ data: [{ roles: { permissions: { can_manage_users: true } } }] })
        }
        return query({ data: [] })
      },
    }
    const result = await callerCanManageUsers(supabase, 'user-2', false)
    expect(result.allowed).toBe(true)
    expect(result.tenantId).toBe(4)
  })

  it('extra individual libera quando o grupo não tem', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'users') return query({ data: { tenant_id: 4, roles: { name: 'SOLICITANTE', permissions: emptyPermissions() } } })
        if (table === 'user_role_groups') return query({ data: [{ roles: { permissions: { can_submit_request: true } } }] })
        return query({ data: [{ permission_key: 'can_manage_users' }] })
      },
    }
    const result = await callerCanManageUsers(supabase, 'user-3', false)
    expect(result.allowed).toBe(true)
  })

  it('sem grupo, sem extra e sem master, bloqueia', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'users') return query({ data: { tenant_id: 4, roles: { name: 'SOLICITANTE', permissions: emptyPermissions() } } })
        return query({ data: [] })
      },
    }
    const result = await callerCanManageUsers(supabase, 'user-4', false)
    expect(result.allowed).toBe(false)
  })
})
