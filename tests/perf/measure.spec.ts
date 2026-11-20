import { test, type Page, type Request } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { SUPABASE_URL } from '../e2e/helpers/env'
import { login } from '../e2e/helpers/ui'

/**
 * Para cada tela, mede a carga fria (abrir a URL) e a navegação pelo menu:
 * - pronto: até a última resposta de dados e o fim do "Carregando";
 * - chamadas: requisições ao Supabase e às rotas /api;
 * - em série: quantas idas e voltas a tela espera uma depois da outra (a cascata).
 * Mediana de PERF_RUNS rodadas, depois de uma rodada de aquecimento.
 */
const PAGES = process.env.PERF_PAGES?.split(',') ?? ['/', '/governance', '/requests', '/database', '/admin/fields', '/settings/workflow', '/admin-pdm', '/reports', '/admin/logs', '/admin/users']
const RUNS = Number(process.env.PERF_RUNS ?? 3)
const LABEL = process.env.PERF_LABEL ?? 'medicao'
const SETTLE_MS = 1500

type Sample = { ms: number; requests: number; serial: number }
type Row = { page: string; cold: Sample; warm: Sample | null }

function isData(url: string) {
  return url.startsWith(SUPABASE_URL) || new URL(url).pathname.startsWith('/api/')
}

/** Maior cadeia de requisições em que cada uma começa depois que a anterior terminou. */
function serialDepth(spans: Array<{ start: number; end: number }>) {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const depth: number[] = []
  sorted.forEach((r, i) => {
    let best = 0
    for (let j = 0; j < i; j++) if (sorted[j].end <= r.start) best = Math.max(best, depth[j])
    depth.push(best + 1)
  })
  return Math.max(0, ...depth)
}

async function measure(page: Page, go: () => Promise<unknown>): Promise<Sample> {
  const spans = new Map<Request, { start: number; end?: number }>()
  const t0 = Date.now()
  const onRequest = (r: Request) => {
    if (isData(r.url())) spans.set(r, { start: Date.now() - t0 })
  }
  const onDone = (r: Request) => {
    const span = spans.get(r)
    if (span && span.end === undefined) span.end = Date.now() - t0
  }
  page.on('request', onRequest)
  page.on('requestfinished', onDone)
  page.on('requestfailed', onDone)

  await go()
  const loading = page.getByText(/Carregando/i).first()
  let loadingSeenAt = 0
  let lastActivity = Date.now()
  let lastCount = -1
  while (Date.now() - t0 < 20_000) {
    const inflight = [...spans.values()].some((s) => s.end === undefined)
    const visible = await loading.isVisible().catch(() => false)
    if (visible) loadingSeenAt = Date.now() - t0
    if (spans.size !== lastCount || inflight || visible) {
      lastActivity = Date.now()
      lastCount = spans.size
    } else if (Date.now() - lastActivity >= SETTLE_MS) {
      break
    }
    await page.waitForTimeout(50)
  }

  page.off('request', onRequest)
  page.off('requestfinished', onDone)
  page.off('requestfailed', onDone)
  const done = [...spans.values()].map((s) => ({ start: s.start, end: s.end ?? s.start }))
  const lastData = Math.max(0, ...done.map((s) => s.end))
  const sample = { ms: Math.max(lastData, loadingSeenAt), requests: done.length, serial: serialDepth(done) }
  if (process.env.PERF_DEBUG) {
    console.log(`  ${page.url()} ${JSON.stringify(sample)} total=${Date.now() - t0}ms loadingSeenAt=${loadingSeenAt}`)
    if (process.env.PERF_DEBUG === '2') for (const [r, s] of spans) console.log(`    ${s.start}-${s.end ?? '…'} ${r.method()} ${r.url().replace(SUPABASE_URL, '').slice(0, 110)}`)
  }
  return sample
}

function median(samples: Sample[]): Sample {
  const mid = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  return {
    ms: mid(samples.map((s) => s.ms)),
    requests: mid(samples.map((s) => s.requests)),
    serial: mid(samples.map((s) => s.serial)),
  }
}

async function repeat(page: Page, before: () => Promise<unknown>, go: () => Promise<unknown>) {
  const samples: Sample[] = []
  for (let i = 0; i <= RUNS; i++) {
    await before()
    const sample = await measure(page, go)
    if (i > 0) samples.push(sample)
  }
  return median(samples)
}

test('desempenho das telas', async ({ page }) => {
  const email = process.env.MASTER_EMAIL
  const password = process.env.MASTER_PASSWORD
  if (!email || !password) throw new Error('MASTER_EMAIL e MASTER_PASSWORD em tests/.env.test')
  if (process.env.PERF_DEBUG) {
    page.on('console', (msg) => { if (msg.type() === 'error') console.log(`  console.error ${msg.text().slice(0, 300)}`) })
    page.on('pageerror', (err) => console.log(`  pageerror ${err.message.slice(0, 300)}`))
  }
  await login(page, email, password)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })

  const pages = [...PAGES]
  const rows: Row[] = []
  for (let i = 0; i < pages.length; i++) {
    const target = pages[i]
    const cold = await repeat(page, async () => undefined, () => page.goto(target, { waitUntil: 'commit' }))

    if (target === '/database') {
      const row = page.locator('tbody tr').first()
      if (await row.isVisible().catch(() => false)) {
        await row.click()
        await page.waitForURL(/\/database\/\d+/, { timeout: 10_000 }).catch(() => undefined)
        const href = new URL(page.url()).pathname
        if (/^\/database\/\d+$/.test(href) && !pages.includes(href)) pages.splice(i + 1, 0, href)
      }
    }

    let warm: Sample | null = null
    const link = page.locator(`aside a[href="${target}"], nav a[href="${target}"]`).first()
    const openHome = () => measure(page, () => page.goto('/', { waitUntil: 'commit' }))
    await openHome()
    if (target !== '/' && (await link.count()) > 0) {
      warm = await repeat(page, openHome, () => link.click())
    }
    rows.push({ page: target.startsWith('/database/') ? '/database/[id]' : target, cold, warm })
  }

  const dir = path.join(__dirname, 'results')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${LABEL}.json`), JSON.stringify({ label: LABEL, runs: RUNS, at: new Date().toISOString(), rows }, null, 2))

  const cell = (s: Sample | null) => (s ? `${String(s.ms).padStart(6)} ms ${String(s.requests).padStart(3)} cham. ${String(s.serial).padStart(2)} série` : '        —')
  console.log(`\n${LABEL} (mediana de ${RUNS})\n${'tela'.padEnd(20)} ${'carga fria'.padEnd(30)} pelo menu`)
  for (const r of rows) console.log(`${r.page.padEnd(20)} ${cell(r.cold).padEnd(30)} ${cell(r.warm)}`)
})
