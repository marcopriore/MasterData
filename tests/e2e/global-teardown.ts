import * as fs from 'fs'
import './helpers/env'
import { deleteTenant } from './helpers/supabase'
import { AUTH_DIR, STATE_FILE, type TestState } from './helpers/state'

/** Apaga o tenant temporário inteiro (dados, usuários do Auth e sessões salvas). */
export default async function globalTeardown() {
  if (!fs.existsSync(STATE_FILE)) return
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as TestState
  if (process.env.E2E_KEEP_DATA === '1') {
    console.log(`\n[e2e] E2E_KEEP_DATA=1: tenant ${state.tenantId} mantido para inspeção.`)
    return
  }
  await deleteTenant(state.tenantId)
  fs.unlinkSync(STATE_FILE)
  fs.rmSync(AUTH_DIR, { recursive: true, force: true })
  console.log(`\n[e2e] tenant ${state.tenantId} apagado.`)
}
