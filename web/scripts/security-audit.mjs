// Auditoria de dependências do gate de segurança.
// Falha com vulnerabilidade high/critical em dependência de produção que não esteja na lista de exceções,
// ou com exceção vencida.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const web = path.resolve(here, '..')
const allowlist = JSON.parse(readFileSync(path.join(web, 'security', 'audit-allowlist.json'), 'utf8')).entries

let raw
try {
  raw = execSync('npm audit --omit=dev --json', { cwd: web, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
} catch (err) {
  raw = err.stdout
}
const report = JSON.parse(raw || '{}')
if (!report.vulnerabilities) {
  console.error('npm audit não devolveu relatório. Rode `npm install` e tente de novo.')
  process.exit(2)
}

const today = new Date().toISOString().slice(0, 10)
const blocking = []
const accepted = []

for (const [name, vuln] of Object.entries(report.vulnerabilities)) {
  if (vuln.severity !== 'high' && vuln.severity !== 'critical') continue
  const entry = allowlist.find((item) => item.package === name)
  if (entry && entry.reviewBy >= today) accepted.push(`${name} (${vuln.severity}) — revisar até ${entry.reviewBy}`)
  else if (entry) blocking.push(`${name} (${vuln.severity}) — exceção venceu em ${entry.reviewBy}`)
  else blocking.push(`${name} (${vuln.severity})${vuln.fixAvailable ? ' — correção disponível' : ''}`)
}

for (const entry of allowlist) {
  if (!report.vulnerabilities[entry.package]) console.log(`Exceção sem uso, pode sair da lista: ${entry.package}`)
}
if (accepted.length) console.log(`Aceitas:\n  ${accepted.join('\n  ')}`)
if (blocking.length) {
  console.error(`Bloqueiam o gate:\n  ${blocking.join('\n  ')}`)
  process.exit(1)
}
console.log('Dependências de produção sem vulnerabilidade high/critical fora da lista de exceções.')
