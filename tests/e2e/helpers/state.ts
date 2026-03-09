import * as fs from 'fs'
import * as path from 'path'

const STATE_FILE = path.resolve(__dirname, '../test-state.json')

export interface TestState {
  RUN_ID: number
  tenantId: number
  masterToken: string
  adminEmail: string
  adminPassword: string
  adminToken: string
  operatorEmail: string
  operatorPassword: string
  operatorUserId: number
  operatorRoleId: number
  /** Adicionados pela suite PDM */
  pdmId?: number
  pdmInternalCode?: string
  /** Adicionados pela suite Request */
  requestId?: number
  requestIdApi?: number
  /** Usuários por role do workflow */
  comprasUserId?: number
  comprasEmail?: string
  comprasPassword?: string
  comprasRoleId?: number
  mrpUserId?: number
  mrpEmail?: string
  mrpPassword?: string
  mrpRoleId?: number
  fiscalUserId?: number
  fiscalEmail?: string
  fiscalPassword?: string
  fiscalRoleId?: number
  contabilidadeUserId?: number
  contabilidadeEmail?: string
  contabilidadePassword?: string
  contabilidadeRoleId?: number
}

export function getState(): TestState {
  if (!fs.existsSync(STATE_FILE)) {
    throw new Error(`Estado de teste não encontrado em ${STATE_FILE}. O global-setup deve rodar antes dos testes.`)
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
}
