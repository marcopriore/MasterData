import { describe, expect, it } from 'vitest'
import { emptyPermissions, mergeRolePermissions, type RolePermissions } from './permissions'
import { canSeeAdminHref, canSeeHomeShortcut, canSeeMainNav, canSeeSettingsHref, type NavAccess } from './nav-access'

function access(partial: Partial<RolePermissions>, isMaster = false): NavAccess {
  return {
    isMaster,
    permissions: mergeRolePermissions([{ permissions: { ...emptyPermissions(), can_view_database: false, ...partial } }], []),
  }
}

const MAIN = ['/', '/request', '/governance', '/database', '/admin-pdm']
const ADMIN = ['/admin/users', '/admin/roles', '/admin/fields', '/admin/value-dictionary', '/admin/logs', '/admin/tenants']

describe('simulador de menu', () => {
  it('master vê menu, administração e atalhos', () => {
    const master = access({}, true)
    for (const href of [...MAIN, ...ADMIN, '/settings/workflow', '/settings/profile']) {
      const visible =
        canSeeMainNav(href, master) ||
        canSeeSettingsHref(href, master) ||
        canSeeAdminHref(href, master)
      expect(visible, href).toBe(true)
    }
    expect(canSeeHomeShortcut('/admin-pdm', master)).toBe(true)
    expect(canSeeHomeShortcut('/governance', master)).toBe(true)
    expect(canSeeHomeShortcut('/request', master)).toBe(true)
    expect(canSeeHomeShortcut('/settings/workflow', master)).toBe(true)
  })

  it('sem flags, só início e meu perfil', () => {
    const none = access({})
    expect(MAIN.filter((href) => canSeeMainNav(href, none))).toEqual(['/'])
    expect(canSeeMainNav('/', none)).toBe(true)
    expect(canSeeMainNav('/request', none)).toBe(false)
    expect(canSeeMainNav('/governance', none)).toBe(false)
    expect(canSeeMainNav('/database', none)).toBe(false)
    expect(canSeeMainNav('/admin-pdm', none)).toBe(false)
    expect(canSeeSettingsHref('/settings/profile', none)).toBe(true)
    expect(canSeeSettingsHref('/settings/workflow', none)).toBe(false)
    for (const href of ADMIN) expect(canSeeAdminHref(href, none)).toBe(false)
  })

  it('cada flag abre a tela correspondente', () => {
    const cases: Array<[Partial<RolePermissions>, string, 'main' | 'admin' | 'settings']> = [
      [{ can_submit_request: true }, '/request', 'main'],
      [{ can_approve: true }, '/governance', 'main'],
      [{ can_reject: true }, '/governance', 'main'],
      [{ can_view_database: true }, '/database', 'main'],
      [{ can_view_pdm: true }, '/admin-pdm', 'main'],
      [{ can_view_workflows: true }, '/settings/workflow', 'settings'],
      [{ can_manage_users: true }, '/admin/users', 'admin'],
      [{ can_manage_roles: true }, '/admin/roles', 'admin'],
      [{ can_manage_fields: true }, '/admin/fields', 'admin'],
      [{ can_manage_value_dictionary: true }, '/admin/value-dictionary', 'admin'],
      [{ can_view_logs: true }, '/admin/logs', 'admin'],
    ]
    for (const [partial, href, area] of cases) {
      const user = access(partial)
      const visible =
        area === 'main' ? canSeeMainNav(href, user) :
        area === 'admin' ? canSeeAdminHref(href, user) :
        canSeeSettingsHref(href, user)
      expect(visible, href).toBe(true)
    }
  })

  it('atalho de PDM pede edição, o menu pede só visualização', () => {
    const viewer = access({ can_view_pdm: true })
    expect(canSeeMainNav('/admin-pdm', viewer)).toBe(true)
    expect(canSeeHomeShortcut('/admin-pdm', viewer)).toBe(false)
    const editor = access({ can_edit_pdm: true })
    expect(canSeeHomeShortcut('/admin-pdm', editor)).toBe(true)
  })

  it('extra de gestão de usuários abre a tela mesmo com grupo de solicitante', () => {
    const user: NavAccess = {
      isMaster: false,
      permissions: mergeRolePermissions(
        [{ permissions: { ...emptyPermissions(), can_view_database: false, can_submit_request: true } }],
        ['can_manage_users']
      ),
    }
    expect(canSeeMainNav('/request', user)).toBe(true)
    expect(canSeeAdminHref('/admin/users', user)).toBe(true)
    expect(canSeeAdminHref('/admin/roles', user)).toBe(false)
    expect(canSeeAdminHref('/admin/tenants', user)).toBe(false)
  })
})
