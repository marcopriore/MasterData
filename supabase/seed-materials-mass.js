#!/usr/bin/env node
/**
 * Seed massiva de materiais a partir dos PDMs já cadastrados no tenant.
 *
 * Para cada PDM ativo:
 *  - monta combinações dos atributos LOV (allowedValues)
 *  - varia numéricos/texto com pools coerentes
 *  - preenche opcionais em ~70% dos casos
 *  - gera descrição curta (maiúsculas, abreviação do LOV se houver, limite do tenant)
 *  - gera descrição detalhada (todos os atributos preenchidos)
 *  - grava em material_database com MDM-###### sequencial
 *
 * Uso:
 *   cd web
 *   npm run seed-materials-mass
 *   npm run seed-materials-mass -- --tenant=empresa-demo --per-pdm=40
 *   npm run seed-materials-mass -- --dry-run
 *   npm run seed-materials-mass -- --replace   # apaga source=seed_mass do tenant e recria
 *
 * Requer em web/.env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const path = require('path')
const fs = require('fs')

const envPath = path.resolve(__dirname, '../web/.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Erro: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em web/.env.local')
  process.exit(1)
}

const { createClient } = require(path.resolve(__dirname, '../web/node_modules/@supabase/supabase-js'))
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SOURCE = 'seed_mass'

const DEFAULTS = {
  tenant: 'empresa-demo',
  perPdm: 40,
  dryRun: false,
  replace: false,
}

const UNITS = ['PCE', 'UN', 'KG', 'M', 'PC']
const NCM_POOL = ['73181500', '84821010', '85015210', '84818099', '40103900', '73089010']
const GROUPS = ['MRO', 'PEÇAS', 'ELÉTRICO', 'MECÂNICO', 'CONSUMO']
const TYPES = ['ZMAT', 'ROH', 'HALB', 'FERT']

const NUMERIC_POOLS = {
  diametro_interno: [10, 15, 20, 25, 30, 35, 40, 50, 60],
  diametro_externo: [26, 35, 42, 52, 62, 72, 80, 90, 110],
  largura: [8, 10, 12, 15, 18, 20, 25, 30],
  comprimento: [10, 16, 20, 25, 30, 40, 50, 60, 80, 100, 150, 850, 1250],
  potencia: [0.5, 1, 1.5, 2, 3, 5, 7.5, 10, 15, 20],
  diametro: [4, 5, 6, 8, 10, 12, 16, 20],
  pressao: [10, 16, 25, 40],
  default: [5, 10, 15, 20, 25, 30, 40, 50, 100, 200],
}

const TEXT_POOLS = {
  material: ['AÇO', 'AÇO CARBONO', 'INOX', 'INOX 304', 'BORRACHA', 'NYLON', 'ALUMÍNIO'],
  perfil: ['A', 'B', 'C', 'XPZ', 'XL', 'L', 'H'],
  carcaca: ['63', '71', '80', '90L', '100L', '112M', '132S'],
  default: ['PADRÃO', 'ESPECIAL', 'INDUSTRIAL', 'COMERCIAL'],
}

function parseArgs(argv) {
  const opts = { ...DEFAULTS }
  for (const arg of argv) {
    if (!arg || arg === '--') continue
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--replace') opts.replace = true
    else if (arg.startsWith('--tenant=')) opts.tenant = arg.slice('--tenant='.length).trim()
    else if (arg.startsWith('--per-pdm=')) {
      const n = Number(arg.slice('--per-pdm='.length))
      if (!Number.isFinite(n) || n < 1 || n > 500) {
        console.error('--per-pdm deve ser entre 1 e 500')
        process.exit(1)
      }
      opts.perPdm = Math.floor(n)
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Uso: node supabase/seed-materials-mass.js [opções]
  --tenant=slug     Tenant (padrão: empresa-demo)
  --per-pdm=N       Materiais por PDM ativo (padrão: 40)
  --dry-run         Só mostra o que seria criado
  --replace         Remove materiais source=${SOURCE} do tenant antes de inserir

Preferível chamar o node direto (o npm pode engolir flags):
  node ../supabase/seed-materials-mass.js --dry-run --per-pdm=10`)
      process.exit(0)
    }
  }
  return opts
}

function normalizeAttrs(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((a, idx) => {
      const allowedValues = Array.isArray(a.allowedValues)
        ? a.allowedValues
            .map((v) =>
              typeof v === 'object' && v != null
                ? { value: String(v.value ?? '').trim(), abbreviation: String(v.abbreviation ?? '').trim() }
                : { value: String(v).trim(), abbreviation: '' }
            )
            .filter((v) => v.value)
        : []
      return {
        id: String(a.id ?? `attr_${idx}`),
        name: String(a.name ?? a.id ?? `attr_${idx}`),
        order: Number(a.order ?? idx + 1),
        dataType: String(a.dataType ?? 'text').toLowerCase(),
        isRequired: a.isRequired === true,
        includeInDescription: a.includeInDescription === true,
        abbreviation: String(a.abbreviation ?? '').trim(),
        allowedValues,
      }
    })
    .sort((a, b) => a.order - b.order)
}

function unitFromName(name) {
  const m = String(name).match(/\(([^)]+)\)\s*$/)
  return m ? m[1].trim() : ''
}

function poolForNumeric(attr, pdmName = '') {
  const id = attr.id.toLowerCase()
  const name = attr.name.toLowerCase()
  const pdm = String(pdmName).toLowerCase()
  for (const key of Object.keys(NUMERIC_POOLS)) {
    if (key !== 'default' && id.includes(key)) {
      // Parafuso/porca/prisioneiro: comprimento curto; correia: pode ser longo
      if (key === 'comprimento' && /parafuso|porca|prisioneiro|mola/.test(pdm)) {
        return [8, 10, 12, 16, 20, 25, 30, 40, 50, 60, 80, 100]
      }
      if (key === 'comprimento' && /correia|cabo|mangueira/.test(pdm)) {
        return [600, 850, 1000, 1250, 1500, 2000, 2500]
      }
      return NUMERIC_POOLS[key]
    }
  }
  if (name.includes('potência') || name.includes('potencia') || name.includes('cv')) return NUMERIC_POOLS.potencia
  if (name.includes('comprimento')) {
    if (/parafuso|porca|prisioneiro|mola/.test(pdm)) return [8, 10, 12, 16, 20, 25, 30, 40, 50, 60, 80, 100]
    if (/correia|cabo|mangueira/.test(pdm)) return [600, 850, 1000, 1250, 1500, 2000, 2500]
    return NUMERIC_POOLS.comprimento
  }
  if (name.includes('largura')) return NUMERIC_POOLS.largura
  if (name.includes('interno')) return NUMERIC_POOLS.diametro_interno
  if (name.includes('externo')) return NUMERIC_POOLS.diametro_externo
  return NUMERIC_POOLS.default
}

function poolForText(attr) {
  const id = attr.id.toLowerCase()
  for (const key of Object.keys(TEXT_POOLS)) {
    if (key !== 'default' && id.includes(key)) return TEXT_POOLS[key]
  }
  const name = attr.name.toLowerCase()
  if (name.includes('material')) return TEXT_POOLS.material
  if (name.includes('perfil')) return TEXT_POOLS.perfil
  if (name.includes('carcaça') || name.includes('carcaca')) return TEXT_POOLS.carcaca
  return TEXT_POOLS.default
}

function pick(arr, i) {
  return arr[i % arr.length]
}

/** Produto cartesiano limitado dos LOVs (ordem dos atributos do PDM). */
function lovCombinations(lovAttrs, limit) {
  if (lovAttrs.length === 0) return [{}]
  let combos = [{}]
  for (const attr of lovAttrs) {
    const next = []
    for (const base of combos) {
      for (const av of attr.allowedValues) {
        next.push({ ...base, [attr.id]: av.value })
        if (next.length >= limit * 3) break
      }
      if (next.length >= limit * 3) break
    }
    combos = next.length ? next : combos
    if (combos.length >= limit * 3) {
      combos = combos.slice(0, limit * 3)
    }
  }
  return combos
}

function buildTechnical(attrs, lovCombo, variantIndex, pdmName = '') {
  const technical = { ...lovCombo }
  for (const attr of attrs) {
    if (Object.prototype.hasOwnProperty.call(technical, attr.id)) continue

    const isLov = attr.allowedValues.length > 0 && (attr.dataType === 'lov' || attr.dataType === 'select')
    if (isLov) {
      technical[attr.id] = pick(attr.allowedValues, variantIndex).value
      continue
    }

    // Opcionais: ~30% ficam vazios para variar preenchimento
    if (!attr.isRequired && variantIndex % 10 < 3) continue

    if (attr.dataType === 'numeric') {
      const n = pick(poolForNumeric(attr, pdmName), variantIndex + attr.order)
      const unit = unitFromName(attr.name)
      // Alterna valor simples e {value,unit} (como na governança)
      if (unit && variantIndex % 2 === 1) {
        technical[attr.id] = { value: String(n), unit }
      } else {
        technical[attr.id] = n
      }
      continue
    }

    technical[attr.id] = pick(poolForText(attr), variantIndex + attr.order)
  }
  return technical
}

function extractDisplay(raw) {
  if (raw == null || raw === '') return ''
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    const o = raw
    return `${o.value ?? ''}${o.unit ?? ''}`.trim()
  }
  return String(raw).trim()
}

function shortSegment(attr, technical) {
  const raw = technical[attr.id]
  const display = extractDisplay(raw)
  if (!display) return attr.abbreviation ? `[${attr.abbreviation}]` : ''
  if (attr.allowedValues.length > 0) {
    const match = attr.allowedValues.find((av) => av.value === display)
    if (match?.abbreviation) return match.abbreviation.toUpperCase()
    return display.toUpperCase()
  }
  if (raw && typeof raw === 'object' && 'value' in raw) {
    const o = raw
    return `${o.value ?? ''}${o.unit ?? ''}`.toUpperCase().trim()
  }
  return display.toUpperCase()
}

/** Descrição curta: NOME_PDM + segmentos includeInDescription, maiúsculas, limite do tenant. */
function buildShortDescription(pdmName, attrs, technical, maxLen) {
  const parts = [String(pdmName).toUpperCase().trim()]
  for (const attr of attrs.filter((a) => a.includeInDescription)) {
    const seg = shortSegment(attr, technical)
    if (seg) parts.push(seg)
  }
  const full = parts.join(' ').replace(/\s+/g, ' ').trim()
  if (full.length <= maxLen) return full
  const cut = full.slice(0, maxLen)
  const sp = cut.lastIndexOf(' ')
  return (sp > Math.floor(maxLen * 0.5) ? cut.slice(0, sp) : cut).trim()
}

/** Descrição detalhada: PDM + uma linha por atributo preenchido. */
function buildDetailedDescription(pdmName, attrs, technical) {
  const lines = [String(pdmName).toUpperCase().trim(), '']
  for (const attr of attrs) {
    const val = extractDisplay(technical[attr.id]).toUpperCase().trim()
    if (!val) continue
    lines.push(`${attr.name.toUpperCase()}: ${val}`)
  }
  return lines.join('\n')
}

function fingerprint(pdmCode, technical) {
  const keys = Object.keys(technical).sort()
  const norm = {}
  for (const k of keys) {
    const d = extractDisplay(technical[k])
    if (d) norm[k] = d.toUpperCase()
  }
  return `${pdmCode}::${JSON.stringify(norm)}`
}

function requiredOk(attrs, technical) {
  return attrs.every((a) => {
    if (!a.isRequired) return true
    return extractDisplay(technical[a.id]) !== ''
  })
}

async function nextMdmSeq() {
  const { data, error } = await supabase
    .from('material_database')
    .select('id_sistema')
    .like('id_sistema', 'MDM-%')
  if (error) throw error
  let max = 0
  for (const row of data ?? []) {
    const n = Number(String(row.id_sistema).replace(/\D/g, ''))
    if (Number.isFinite(n) && n > max) max = n
  }
  return max + 1
}

function formatMdm(n) {
  return `MDM-${String(n).padStart(6, '0')}`
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  console.log(`Seed massiva de materiais`)
  console.log(`  tenant=${opts.tenant}  per-pdm=${opts.perPdm}  dry-run=${opts.dryRun}  replace=${opts.replace}\n`)

  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, slug, max_description_length')
    .eq('slug', opts.tenant)
    .maybeSingle()
  if (tErr) throw tErr
  if (!tenant) {
    console.error(`Tenant "${opts.tenant}" não encontrado. Rode create-demo-users + seed_demo.sql antes.`)
    process.exit(1)
  }

  const maxDesc = Math.max(10, Math.min(200, Number(tenant.max_description_length) || 40))

  const { data: pdms, error: pErr } = await supabase
    .from('pdm_templates')
    .select('id, name, internal_code, is_active, attributes')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .order('name')
  if (pErr) throw pErr
  if (!pdms?.length) {
    console.error('Nenhum PDM ativo neste tenant.')
    process.exit(1)
  }

  console.log(`Tenant: ${tenant.name} (id=${tenant.id}, max_description_length=${maxDesc})`)
  console.log(`PDMs ativos: ${pdms.length}\n`)

  if (opts.replace && !opts.dryRun) {
    const { error: delErr, count } = await supabase
      .from('material_database')
      .delete({ count: 'exact' })
      .eq('tenant_id', tenant.id)
      .eq('source', SOURCE)
    if (delErr) throw delErr
    console.log(`Removidos ${count ?? 0} materiais anteriores (source=${SOURCE})\n`)
  }

  const { data: existing, error: eErr } = await supabase
    .from('material_database')
    .select('id_sistema, pdm_code, technical_attributes, description')
    .eq('tenant_id', tenant.id)
  if (eErr) throw eErr

  const existingFp = new Set()
  for (const row of existing ?? []) {
    const tech =
      row.technical_attributes && typeof row.technical_attributes === 'object'
        ? row.technical_attributes
        : {}
    existingFp.add(fingerprint(row.pdm_code ?? '', tech))
  }

  let seq = await nextMdmSeq()
  const toInsert = []
  const stats = []

  for (const pdm of pdms) {
    const attrs = normalizeAttrs(pdm.attributes)
    const lovAttrs = attrs.filter(
      (a) => a.allowedValues.length > 0 && (a.dataType === 'lov' || a.dataType === 'select')
    )
    const combos = lovCombinations(lovAttrs, opts.perPdm)
    let created = 0
    let skippedDup = 0
    let skippedReq = 0
    let attempt = 0

    while (created < opts.perPdm && attempt < opts.perPdm * 8) {
      const combo = combos[attempt % combos.length] ?? {}
      const technical = buildTechnical(attrs, combo, attempt, pdm.name)
      attempt += 1

      if (!requiredOk(attrs, technical)) {
        skippedReq += 1
        continue
      }

      const fp = fingerprint(pdm.internal_code, technical)
      if (existingFp.has(fp)) {
        skippedDup += 1
        continue
      }
      existingFp.add(fp)

      const description = buildShortDescription(pdm.name, attrs, technical, maxDesc)
      const detailed = buildDetailedDescription(pdm.name, attrs, technical)
      if (!description || description.length > maxDesc) {
        skippedReq += 1
        continue
      }

      const statusRoll = attempt % 20
      const status = statusRoll === 0 ? 'Obsoleto' : statusRoll === 1 ? 'Bloqueado' : 'Ativo'
      const erpRoll = attempt % 10
      let erp_status = 'pendente_erp'
      let id_erp = null
      if (erpRoll === 0) {
        erp_status = 'integrado_erp'
        id_erp = `ERP-${String(seq).padStart(6, '0')}`
      } else if (erpRoll === 1) {
        erp_status = 'erro_erp'
      }

      const id_sistema = formatMdm(seq)
      seq += 1
      created += 1

      toInsert.push({
        id_sistema,
        tenant_id: tenant.id,
        description,
        detailed_description: detailed,
        status,
        pdm_code: pdm.internal_code,
        pdm_name: pdm.name,
        technical_attributes: technical,
        unit_of_measure: pick(UNITS, attempt),
        ncm: pick(NCM_POOL, attempt),
        material_group: pick(GROUPS, attempt),
        material_type: pick(TYPES, attempt),
        erp_status,
        id_erp,
        source: SOURCE,
        standardized_at: new Date().toISOString(),
      })
    }

    stats.push({
      code: pdm.internal_code,
      name: pdm.name,
      attrs: attrs.length,
      created,
      skippedDup,
      skippedReq,
    })
  }

  console.log('Por PDM:')
  for (const s of stats) {
    console.log(
      `  ${s.code} (${s.name}): +${s.created}  (attrs=${s.attrs}, dup=${s.skippedDup}, skip=${s.skippedReq})`
    )
  }
  console.log(`\nTotal a inserir: ${toInsert.length}`)

  if (opts.dryRun) {
    console.log('\n[dry-run] Exemplos:')
    for (const row of toInsert.slice(0, 5)) {
      console.log(`  ${row.id_sistema} | ${row.pdm_code} | "${row.description}" (${row.description.length} chars)`)
      console.log(`    attrs: ${JSON.stringify(row.technical_attributes)}`)
    }
    console.log('\nNada foi gravado.')
    return
  }

  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH)
    const { error } = await supabase.from('material_database').insert(chunk)
    if (error) {
      console.error('Falha no insert:', error.message)
      console.error('Lote a partir de', chunk[0]?.id_sistema)
      process.exit(1)
    }
    inserted += chunk.length
    process.stdout.write(`  gravados ${inserted}/${toInsert.length}\r`)
  }
  console.log(`\nConcluído: ${inserted} materiais em material_database (source=${SOURCE}).`)
  console.log('Abra Base de Dados de Materiais no PRO-MAT para conferir.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
