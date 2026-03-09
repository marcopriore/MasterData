import * as fs from 'fs'
import * as path from 'path'

const STATE_FILE = path.resolve(__dirname, 'test-state.json')

export default async function globalTeardown() {
  if (fs.existsSync(STATE_FILE)) {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
    console.log(`\n[teardown] Tenant ${state.tenantId} criado nesta sessão.`)
    console.log('[teardown] Para limpeza via db.ts, chame cleanupTestTenant no teardown das suites.')
    fs.unlinkSync(STATE_FILE)
    console.log('[teardown] Arquivo de estado removido.')
  }
}
