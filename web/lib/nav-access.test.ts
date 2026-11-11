import { describe, expect, it } from 'vitest'
import { emptyPermissions, mergeRolePermissions, type RolePermissions } from './permissions'
import { canOpenPath, canSeeAdminHref, canSeeHomeShortcut, canSeeMainNav, canSeeSettingsHref, type NavAccess } from './nav-access'

describe('acesso pelo endereço da tela', () => {
  const contabilidade = () => access({ can_view_pdm: true, can_view_database: true, can_attend: true, can_approve: true })

  it('sem a permissão, a tela não abre pelo link', () => {
    const user = contabilidade()
    expect(canOpenPath('/settings/workflow', user)).toBe(false)
    expect(canOpenPath('/admin/users', user)).toBe(false)
    expect(canOpenPath('/admin/fields', user)).toBe(false)
    expect(canOpenPath('/reports', user)).toBe(false)
    expect(canOpenPath('/requests/new', user)).toBe(false)
    expect(canOpenPath('/requests/alteracao/10', user)).toBe(false)
    expect(canOpenPath('/admin/tenants', user)).toBe(false)
    expect(canOpenPath('/teste', user)).toBe(false)
    expect(canOpenPath('/admin-pdm/novo', user)).toBe(false)
  })

  it('com a permissão (ou só a de ver), abre', () => {
    const user = contabilidade()
    expect(canOpenPath('/admin-pdm', user)).toBe(true)
    expect(canOpenPath('/admin-pdm/3', user)).toBe(true)
    expect(canOpenPath('/database/12', user)).toBe(true)
    expect(canOpenPath('/governance', user)).toBe(true)
    expect(canOpenPath('/', user)).toBe(true)
    expect(canOpenPath('/support/abc', user)).toBe(true)
    expect(canOpenPath('/settings/profile', user)).toBe(true)
    expect(canOpenPath('/settings/workflow', access({ can_view_workflows: true }))).toBe(true)
  })

  it('tela sem regra fica fechada; master abre tudo', () => {
    expect(canOpenPath('/nova-tela', contabilidade())).toBe(false)
    expect(canOpenPath('/nova-tela', access({}, true))).toBe(true)
    expect(canOpenPath('/admin/tenants', access({}, true))).toBe(true)
  })

  it('o que o menu esconde, o endereço não abre', () => {
    const user = contabilidade()
    for (const href of MAIN) expect(canOpenPath(href, user), href).toBe(canSeeMainNav(href, user))
    for (const href of ADMIN) expect(canOpenPath(href, user), href).toBe(canSeeAdminHref(href, user))
  })
})

function access(partial: Partial<RolePermissions>, isMaster = false): NavAccess {
  return {
    isMaster,
    permissions: mergeRolePermissions([{ permissions: { ...emptyPermissions(), can_view_database: false, ...partial } }], []),
  }
}

const MAIN = ['/', '/requests', '/governance', '/database', '/admin-pdm', '/reports']
const ADMIN = ['/admin/users', '/admin/roles', '/admin/fields', '/admin/value-dictionary', '/admin/logs', '/admin/integrations', '/admin/integration-docs', '/admin/tenants']

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
    expect(canSeeHomeShortcut('/requests/new', master)).toBe(true)
    expect(canSeeHomeShortcut('/settings/workflow', master)).toBe(true)
  })

  it('sem flags, só início e meu perfil', () => {
    const none = access({})
    expect(MAIN.filter((href) => canSeeMainNav(href, none))).toEqual(['/'])
    expect(canSeeMainNav('/', none)).toBe(true)
    expect(canSeeMainNav('/requests', none)).toBe(false)
    expect(canSeeMainNav('/governance', none)).toBe(false)
    expect(canSeeMainNav('/database', none)).toBe(false)
    expect(canSeeMainNav('/admin-pdm', none)).toBe(false)
    expect(canSeeMainNav('/support', none)).toBe(true)
    expect(canSeeSettingsHref('/settings/profile', none)).toBe(true)
    expect(canSeeSettingsHref('/settings/workflow', none)).toBe(false)
    for (const href of ADMIN) expect(canSeeAdminHref(href, none)).toBe(false)
  })

  it('cada flag abre a tela correspondente', () => {
    const cases: Array<[Partial<RolePermissions>, string, 'main' | 'admin' | 'settings']> = [
      [{ can_submit_request: true }, '/requests', 'main'],
      [{ can_approve: true }, '/governance', 'main'],
      [{ can_reject: true }, '/governance', 'main'],
      [{ can_view_database: true }, '/database', 'main'],
      [{ can_view_pdm: true }, '/admin-pdm', 'main'],
      [{ can_view_reports: true }, '/reports', 'main'],
      [{ can_view_workflows: true }, '/settings/workflow', 'settings'],
      [{ can_manage_users: true }, '/admin/users', 'admin'],
      [{ can_manage_roles: true }, '/admin/roles', 'admin'],
      [{ can_manage_fields: true }, '/admin/fields', 'admin'],
      [{ can_manage_value_dictionary: true }, '/admin/value-dictionary', 'admin'],
      [{ can_view_logs: true }, '/admin/logs', 'admin'],
      [{ can_view_logs: true }, '/admin/integrations', 'admin'],
      [{ can_view_logs: true }, '/admin/integration-docs', 'admin'],
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
    expect(canSeeMainNav('/requests', user)).toBe(true)
    expect(canSeeAdminHref('/admin/users', user)).toBe(true)
    expect(canSeeAdminHref('/admin/roles', user)).toBe(false)
    expect(canSeeAdminHref('/admin/tenants', user)).toBe(false)
  })
})
