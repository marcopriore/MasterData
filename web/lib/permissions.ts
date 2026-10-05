/** Catálogo de permissões de tela do PRO-MAT. */

export type RolePermissions = {
  can_approve: boolean
  can_reject: boolean
  can_submit_request: boolean
  can_view_pdm: boolean
  can_edit_pdm: boolean
  can_view_workflows: boolean
  can_edit_workflows: boolean
  can_manage_users: boolean
  can_view_logs: boolean
  can_manage_fields: boolean
  can_view_database: boolean
  can_manage_roles: boolean
  can_manage_value_dictionary: boolean
  can_standardize: boolean
  can_bulk_import: boolean
  can_attend: boolean
}

export type PermissionKey = keyof RolePermissions

export const PERMISSION_KEYS: PermissionKey[] = [
  'can_approve',
  'can_reject',
  'can_submit_request',
  'can_view_pdm',
  'can_edit_pdm',
  'can_view_workflows',
  'can_edit_workflows',
  'can_manage_users',
  'can_view_logs',
  'can_manage_fields',
  'can_view_database',
  'can_manage_roles',
  'can_manage_value_dictionary',
  'can_standardize',
  'can_bulk_import',
  'can_attend',
]

export const PERMISSION_GROUPS: {
  title: string
  items: { key: PermissionKey; label: string; description: string }[]
}[] = [
  {
    title: 'Solicitações',
    items: [
      { key: 'can_submit_request', label: 'Criar Solicitações', description: 'Abrir novas solicitações de cadastro' },
      { key: 'can_approve', label: 'Aprovar Solicitações', description: 'Aprovar solicitações de cadastro' },
      { key: 'can_reject', label: 'Rejeitar Solicitações', description: 'Rejeitar solicitações de cadastro' },
      { key: 'can_attend', label: 'Pode Atender Solicitações', description: 'Iniciar atendimento de solicitações no Kanban' },
    ],
  },
  {
    title: 'Gestão PDM',
    items: [
      { key: 'can_view_pdm', label: 'Visualizar PDM', description: 'Visualizar dados e modelos de PDM' },
      { key: 'can_edit_pdm', label: 'Editar PDM', description: 'Criar e editar modelos de PDM' },
    ],
  },
  {
    title: 'Workflow',
    items: [
      { key: 'can_view_workflows', label: 'Visualizar Workflows', description: 'Ver configuração dos fluxos de aprovação' },
      { key: 'can_edit_workflows', label: 'Editar Workflows', description: 'Configurar fluxos de aprovação' },
    ],
  },
  {
    title: 'Administração',
    items: [
      { key: 'can_manage_users', label: 'Gestão de Usuários', description: 'Criar, editar e desativar usuários' },
      { key: 'can_view_logs', label: 'Gestão de Logs', description: 'Visualizar log de auditoria do sistema' },
      { key: 'can_manage_fields', label: 'Dicionário de Dados', description: 'Gerir dicionário de campos e metadados' },
      { key: 'can_view_database', label: 'Base de Dados', description: 'Visualizar base de dados de materiais' },
      { key: 'can_manage_roles', label: 'Grupos de perfil', description: 'Gerir grupos e permissões de acesso' },
      { key: 'can_manage_value_dictionary', label: 'Dicionário de Valores', description: 'Centralizar e unificar valores de atributos tipo lista' },
    ],
  },
  {
    title: 'Operações',
    items: [
      { key: 'can_standardize', label: 'Padronização de Materiais', description: 'Padronizar materiais e integrar com ERP' },
      { key: 'can_bulk_import', label: 'Importação em Massa', description: 'Importação em massa de materiais' },
    ],
  },
]

/** Papéis criados com o tenant. O nome não muda e o grupo não é apagado. */
export const SYSTEM_ROLE_NAMES = [
  'ADMIN',
  'SOLICITANTE',
  'CADASTRO',
  'COMPRAS',
  'MRP',
  'FISCAL',
  'CONTABILIDADE',
  'MASTER',
] as const

export function isSystemRoleName(name: string | null | undefined): boolean {
  return SYSTEM_ROLE_NAMES.includes((name ?? '').trim().toUpperCase() as (typeof SYSTEM_ROLE_NAMES)[number])
}

/** Master, papel de etapa ADMIN ou grupo ADMIN vê os campos da fase atual da solicitação. */
export function seesCurrentPhaseFields(input: {
  isMaster: boolean
  roleName: string | null | undefined
  hasAdminGroup: boolean
}): boolean {
  return input.isMaster || (input.roleName ?? '').trim().toUpperCase() === 'ADMIN' || input.hasAdminGroup
}

export function emptyPermissions(): RolePermissions {
  return {
    can_approve: false,
    can_reject: false,
    can_submit_request: false,
    can_view_pdm: false,
    can_edit_pdm: false,
    can_view_workflows: false,
    can_edit_workflows: false,
    can_manage_users: false,
    can_view_logs: false,
    can_manage_fields: false,
    can_view_database: true,
    can_manage_roles: false,
    can_manage_value_dictionary: false,
    can_standardize: false,
    can_bulk_import: false,
    can_attend: false,
  }
}

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as string[]).includes(value)
}

export function keysCoveredByGroups(
  groups: Array<{ permissions?: Partial<RolePermissions> | null }>
): Set<PermissionKey> {
  const covered = new Set<PermissionKey>()
  for (const group of groups) {
    const perms = group.permissions ?? {}
    for (const key of PERMISSION_KEYS) {
      if (perms[key]) covered.add(key)
    }
  }
  return covered
}

/** União dos grupos mais extras. Flag de grupo prevalece; extra não a duplica. */
export function mergeRolePermissions(
  groups: Array<{ permissions?: Partial<RolePermissions> | null }>,
  grantKeys: string[]
): RolePermissions {
  const result = emptyPermissions()
  result.can_view_database = false
  const covered = keysCoveredByGroups(groups)
  for (const key of covered) result[key] = true
  for (const raw of grantKeys) {
    if (isPermissionKey(raw) && !covered.has(raw)) result[raw] = true
  }
  return result
}
