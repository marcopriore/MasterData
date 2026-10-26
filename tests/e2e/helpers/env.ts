import * as fs from 'fs'
import * as path from 'path'

/**
 * Os testes usam as mesmas variáveis do app (web/.env.local): URL e chaves do Supabase.
 * tests/.env.test pode sobrescrever (ex.: TEST_APP_URL para rodar contra outro endereço).
 */
function load(file: string) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m || process.env[m[1]] !== undefined) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

load(path.resolve(__dirname, '../../.env.test'))
load(path.resolve(__dirname, '../../../web/.env.local'))

export const APP_URL = process.env.TEST_APP_URL || 'http://localhost:3100'
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Variáveis do Supabase ausentes: confira web/.env.local')
}
