import { describe, expect, it } from 'vitest'
import {
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  emptyPermissions,
  isPermissionKey,
  isSystemRoleName,
  keysCoveredByGroups,
  mergeRolePermissions,
  seesCurrentPhaseFields,
  type RolePermissions,
} from './permissions'

function flags(partial: Partial<RolePermissions>): RolePermissions {
  return { ...emptyPermissions(), can_view_database: false, ...partial }
}

describe('catálogo de permissões', () => {
  it('cada flag do tipo aparece no catálogo da tela', () => {
    const catalogKeys = PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key))
    expect(new Set(catalogKeys)).toEqual(new Set(PERMISSION_KEYS))
  })

  it('reconhece só chaves do catálogo', () => {
    expect(isPermissionKey('can_attend')).toBe(true)
    expect(isPermissionKey('can_hack')).toBe(false)
  })

  it('nomes de sistema não mudam, independente de maiúsculas', () => {
    expect(isSystemRoleName('master')).toBe(true)
    expect(isSystemRoleName(' ADMIN ')).toBe(true)
    expect(isSystemRoleName('QUALIDADE')).toBe(false)
  })
})

describe('união de grupos e extras', () => {
  const solicitante = flags({ can_submit_request: true, can_view_database: true })
  const cadastro = flags({ can_attend: true, can_view_pdm: true })

  it('soma as flags dos grupos', () => {
    const merged = mergeRolePermissions(
      [{ permissions: solicitante }, { permissions: cadastro }],
      []
    )
    expect(merged.can_submit_request).toBe(true)
    expect(merged.can_attend).toBe(true)
    expect(merged.can_view_pdm).toBe(true)
    expect(merged.can_manage_users).toBe(false)
  })

  it('extra libera uma flag que nenhum grupo tem', () => {
    const merged = mergeRolePermissions([{ permissions: solicitante }], ['can_view_logs'])
    expect(merged.can_view_logs).toBe(true)
    expect(merged.can_submit_request).toBe(true)
  })

  it('extra já coberto pelo grupo não muda o resultado', () => {
    const withExtra = mergeRolePermissions([{ permissions: solicitante }], ['can_submit_request'])
    const without = mergeRolePermissions([{ permissions: solicitante }], [])
    expect(withExtra).toEqual(without)
  })

  it('chave desconhecida é ignorada', () => {
    const merged = mergeRolePermissions([], ['nao_existe'])
    expect(merged).toEqual(flags({}))
  })

  it('sem grupo e sem extra, nenhuma flag fica ligada', () => {
    const merged = mergeRolePermissions([], [])
    expect(Object.values(merged).every((value) => value === false)).toBe(true)
  })

  it('lista o que o grupo já cobre para travar o extra na tela', () => {
    const covered = keysCoveredByGroups([{ permissions: solicitante }])
    expect(covered.has('can_submit_request')).toBe(true)
    expect(covered.has('can_approve')).toBe(false)
  })
})

describe('campos da fase atual', () => {
  it('master e grupo ADMIN veem a fase da solicitação', () => {
    expect(seesCurrentPhaseFields({ isMaster: true, roleName: 'SOLICITANTE', hasAdminGroup: false })).toBe(true)
    expect(seesCurrentPhaseFields({ isMaster: false, roleName: 'CADASTRO', hasAdminGroup: true })).toBe(true)
    expect(seesCurrentPhaseFields({ isMaster: false, roleName: 'ADMIN', hasAdminGroup: false })).toBe(true)
  })

  it('operador vê só a própria etapa', () => {
    expect(seesCurrentPhaseFields({ isMaster: false, roleName: 'FISCAL', hasAdminGroup: false })).toBe(false)
  })
})
