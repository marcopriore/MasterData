#!/usr/bin/env node
/**
 * Contas criadas pela importação de usuários ou pelo onboarding antes da v3.14 nasciam com a senha
 * fixa "Mudar@1234". Este script testa essa senha em cada conta e, com --apply, troca por uma
 * aleatória e manda o e-mail de redefinição.
 *
 *   node scripts/rotate-default-passwords.mjs --env-file=.env.local           # só lista
 *   node scripts/rotate-default-passwords.mjs --env-file=.env.local --apply   # troca e avisa
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_PASSWORD = 'Mudar@1234'
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...v] = a.slice(2).split('=')
  return [k, v.length ? v.join('=') : true]
}))

const envFile = resolve(process.cwd(), typeof args['env-file'] === 'string' ? args['env-file'] : '.env.local')
if (!existsSync(envFile)) {
  console.error(`Arquivo não encontrado: ${envFile} (rode dentro da pasta web)`)
  process.exit(1)
}
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => {
  const i = l.indexOf('=')
  return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]
}))

const url = env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const appUrl = env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const users = []
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) { console.error(error.message); process.exit(1) }
  users.push(...data.users)
  if (data.users.length < 1000) break
}

const exposed = []
for (const u of users) {
  if (!u.email) continue
  const probe = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await probe.auth.signInWithPassword({ email: u.email, password: DEFAULT_PASSWORD })
  if (!error && data.session) {
    exposed.push(u)
    await probe.auth.signOut()
  }
  await sleep(1200)
}

console.log(`${users.length} conta(s) verificadas; ${exposed.length} com a senha padrão.`)
for (const u of exposed) console.log(`  ${u.email}`)
if (!exposed.length || !args.apply) {
  if (exposed.length) console.log('Rode de novo com --apply para trocar a senha e mandar o e-mail de redefinição.')
  process.exit(0)
}

for (const u of exposed) {
  const { error } = await admin.auth.admin.updateUserById(u.id, { password: `${randomBytes(24).toString('hex')}Aa1!` })
  if (error) { console.error(`  ${u.email}: ${error.message}`); continue }
  const { error: resetError } = await admin.auth.resetPasswordForEmail(u.email, { redirectTo: `${appUrl}/reset-password` })
  console.log(`  ${u.email}: senha trocada${resetError ? ` (e-mail não saiu: ${resetError.message})` : ', e-mail enviado'}`)
}
