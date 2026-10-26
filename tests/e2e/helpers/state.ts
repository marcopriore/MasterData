import * as fs from 'fs'
import * as path from 'path'

export const STATE_FILE = path.resolve(__dirname, '../test-state.json')
export const AUTH_DIR = path.resolve(__dirname, '../.auth')

export const ROLES = ['admin', 'solicitante', 'cadastro', 'compras', 'mrp', 'fiscal', 'contabilidade'] as const
export type RoleKey = (typeof ROLES)[number]

/** Etapas do workflow padrão, na ordem, com o usuário da área de cada uma. */
export const STAGES: { status: string; role: RoleKey }[] = [
  { status: 'cadastro', role: 'cadastro' },
  { status: 'compras', role: 'compras' },
  { status: 'mrp', role: 'mrp' },
  { status: 'fiscal', role: 'fiscal' },
  { status: 'contabilidade', role: 'contabilidade' },
]

export type TestUser = { id: string; email: string; name: string; roleId: number }

export interface TestState {
  runId: string
  tenantId: number
  password: string
  users: Record<RoleKey, TestUser>
  /**
   * Solicitante sem sessão salva: para logout e inativação. O logout do Supabase encerra a sessão
   * do usuário em todos os lugares e derrubaria a sessão salva que as outras suítes usam.
   */
  spare: TestUser
  pdm: { id: number; code: string; name: string }
  /** Preenchidos pelas suítes, em ordem (request → governance → database). */
  requestId?: number
  modelo?: string
  materialId?: number
  materialCode?: string
}

export function getState(): TestState {
  if (!fs.existsSync(STATE_FILE)) throw new Error(`Estado não encontrado em ${STATE_FILE}: o global-setup não rodou.`)
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
}

export function saveState(state: TestState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

export function updateState(patch: Partial<TestState>) {
  saveState({ ...getState(), ...patch })
}

export function authFile(role: RoleKey) {
  return path.join(AUTH_DIR, `${role}.json`)
}
