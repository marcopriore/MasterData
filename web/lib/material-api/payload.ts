/** Contrato JSON das APIs de material (/api/v1). Chaves em português; colunas da base em inglês. */
import { toErpDeep } from '@/lib/erp-text'

type Json = Record<string, unknown>
export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

export const MATERIAL_STATUS = ['Ativo', 'Bloqueado', 'Obsoleto'] as const

const URGENCY: Record<string, 'low' | 'medium' | 'high'> = {
  baixa: 'low',
  media: 'medium',
  'média': 'medium',
  alta: 'high',
}

const SIMPLE_FIELDS = {
  descricao: { column: 'description', max: 200 },
  descricao_detalhada: { column: 'detailed_description', max: 2000 },
  pdm_codigo: { column: 'pdm_code', max: 50 },
  unidade_medida: { column: 'unit_of_measure', max: 20 },
  ncm: { column: 'ncm', max: 20 },
  grupo_mercadoria: { column: 'material_group', max: 100 },
  tipo_material: { column: 'material_type', max: 100 },
} as const

const BLOCK_FIELDS = ['atributos', 'eans', 'dimensoes', 'vendas', 'site', 'caracteristicas', 'campos_adicionais'] as const
const OWNED_BY_PROMAT = ['id_sistema', 'id_erp', 'erp_status', 'origem', 'criado_em', 'alterado_em']
const MATERIAL_KEYS = new Set<string>([...Object.keys(SIMPLE_FIELDS), 'status', ...BLOCK_FIELDS])

const LIMITS = { keys: 200, rows: 50, characteristics: 300, key: 60, value: 500 }

function isObject(value: unknown): value is Json {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function scalar(value: unknown): string | null {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  return null
}

function text(value: unknown, label: string, max: number, errors: string[], required = false): string | undefined {
  const str = scalar(value)
  if (str == null || str === '') {
    if (required) errors.push(`${label} é obrigatório`)
    else if (value != null && str == null) errors.push(`${label} deve ser texto`)
    return undefined
  }
  if (str.length > max) errors.push(`${label} passa de ${max} caracteres`)
  return str
}

function flatMap(value: unknown, label: string, errors: string[]): Record<string, string> | undefined {
  if (value == null) return undefined
  if (!isObject(value)) {
    errors.push(`${label} deve ser um objeto`)
    return undefined
  }
  const entries = Object.entries(value)
  if (entries.length > LIMITS.keys) errors.push(`${label} passa de ${LIMITS.keys} chaves`)
  const out: Record<string, string> = {}
  for (const [key, raw] of entries) {
    if (!key.trim() || key.length > LIMITS.key) {
      errors.push(`${label}: chave "${key.slice(0, 20)}" inválida`)
      continue
    }
    const str = scalar(raw)
    if (str == null) {
      errors.push(`${label}.${key} deve ser texto, número ou booleano`)
      continue
    }
    if (str.length > LIMITS.value) errors.push(`${label}.${key} passa de ${LIMITS.value} caracteres`)
    out[key] = str
  }
  return out
}

function rows<T>(
  value: unknown,
  label: string,
  max: number,
  errors: string[],
  pick: (row: Json, at: string) => T | null,
): T[] | undefined {
  if (value == null) return undefined
  if (!Array.isArray(value)) {
    errors.push(`${label} deve ser uma lista`)
    return undefined
  }
  if (value.length > max) errors.push(`${label} passa de ${max} itens`)
  const out: T[] = []
  value.forEach((row, index) => {
    const at = `${label}[${index}]`
    if (!isObject(row)) {
      errors.push(`${at} deve ser um objeto`)
      return
    }
    const picked = pick(row, at)
    if (picked) out.push(picked)
  })
  return out
}

export type MaterialRow = Record<string, unknown>

/**
 * Converte o JSON de criação ou alteração nas colunas de material_database.
 * Na alteração, só as chaves enviadas mudam; blocos enviados substituem o bloco inteiro,
 * exceto `atributos`, que é mesclado chave a chave pelo chamador.
 */
export function parseMaterialInput(body: unknown, mode: 'create' | 'update'): ParseResult<MaterialRow> {
  if (!isObject(body)) return { ok: false, errors: ['corpo deve ser um objeto JSON'] }
  const errors: string[] = []
  const row: MaterialRow = {}

  for (const key of Object.keys(body)) {
    if (OWNED_BY_PROMAT.includes(key)) errors.push(`${key} é definido pelo PRO-MAT`)
    else if (!MATERIAL_KEYS.has(key)) errors.push(`campo desconhecido: ${key}`)
  }

  for (const [key, def] of Object.entries(SIMPLE_FIELDS)) {
    if (!(key in body) && !(mode === 'create' && key === 'descricao')) continue
    const required = key === 'descricao' && (mode === 'create' || body[key] === null)
    if (body[key] === null && !required) {
      row[def.column] = null
      continue
    }
    const value = text(body[key], key, def.max, errors, required)
    if (value !== undefined) row[def.column] = value
  }

  if ('status' in body) {
    const status = scalar(body.status)
    if (!status || !(MATERIAL_STATUS as readonly string[]).includes(status)) {
      errors.push(`status deve ser ${MATERIAL_STATUS.join(', ')}`)
    } else row.status = status
  }

  const attributes = flatMap(body.atributos, 'atributos', errors)
  if (attributes) row.technical_attributes = attributes

  const eans = rows(body.eans, 'eans', LIMITS.rows, errors, (item, at) => {
    const category = text(item.categoria, `${at}.categoria`, 10, errors, true)
    const code = text(item.codigo, `${at}.codigo`, 40, errors, true)
    return category && code ? { category, code } : null
  })
  if (eans) row.eans = eans

  const dimensions = rows(body.dimensoes, 'dimensoes', LIMITS.rows, errors, (item, at) => {
    const name = text(item.nome, `${at}.nome`, 40, errors, true)
    const quantity = text(item.quantidade, `${at}.quantidade`, 30, errors, true)
    const unit = text(item.unidade, `${at}.unidade`, 10, errors, true)
    if (quantity && !Number.isFinite(Number(quantity))) errors.push(`${at}.quantidade deve ser número`)
    return name && quantity && unit ? { name, quantity, unit } : null
  })
  if (dimensions) row.dimensions = dimensions

  const sales = rows(body.vendas, 'vendas', LIMITS.rows, errors, (item, at) => flatMap(item, at, errors) ?? null)
  if (sales) row.sales = sales

  const site = flatMap(body.site, 'site', errors)
  if (site) row.site = site

  const characteristics = rows(body.caracteristicas, 'caracteristicas', LIMITS.characteristics, errors, (item, at) => {
    const name = text(item.nome, `${at}.nome`, LIMITS.key, errors, true)
    const value = text(item.valor, `${at}.valor`, LIMITS.value, errors, true)
    return name && value ? { name, value } : null
  })
  if (characteristics) row.characteristics = characteristics

  const additional = flatMap(body.campos_adicionais, 'campos_adicionais', errors)
  if (additional) row.additional_fields = additional

  if (mode === 'update' && Object.keys(row).length === 0 && errors.length === 0) {
    errors.push('nenhum campo para alterar')
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: toErpDeep(row) }
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isObject) : []
}

function map(value: unknown): Json {
  return isObject(value) ? value : {}
}

/** Linha de material_database → JSON das APIs. */
export function toApiMaterial(row: Json) {
  return {
    id_sistema: row.id_sistema ?? null,
    id_erp: row.id_erp ?? null,
    descricao: row.description ?? null,
    descricao_detalhada: row.detailed_description ?? null,
    status: row.status ?? null,
    pdm_codigo: row.pdm_code ?? null,
    unidade_medida: row.unit_of_measure ?? null,
    ncm: row.ncm ?? null,
    grupo_mercadoria: row.material_group ?? null,
    tipo_material: row.material_type ?? null,
    atributos: map(row.technical_attributes),
    eans: list(row.eans).map((item) => ({ categoria: item.category, codigo: item.code })),
    dimensoes: list(row.dimensions).map((item) => ({ nome: item.name, quantidade: item.quantity, unidade: item.unit })),
    vendas: list(row.sales),
    site: map(row.site),
    caracteristicas: list(row.characteristics).map((item) => ({ nome: item.name, valor: item.value })),
    campos_adicionais: map(row.additional_fields),
    erp_status: row.erp_status ?? null,
    origem: row.source ?? null,
    criado_em: row.created_at ?? null,
    alterado_em: row.updated_at ?? null,
  }
}

/** Colunas lidas para montar toApiMaterial. */
export const MATERIAL_API_COLUMNS =
  'id, id_sistema, id_erp, description, detailed_description, status, pdm_code, unit_of_measure, ncm, material_group, material_type, technical_attributes, eans, dimensions, sales, site, characteristics, additional_fields, erp_status, source, created_at, updated_at'

export type RequestInput = {
  pdmCode: string
  requester: string
  description: string | null
  costCenter: string | null
  urgency: 'low' | 'medium' | 'high'
  justification: string | null
  externalReference: string | null
  attributes: Record<string, string>
}

const REQUEST_KEYS = new Set([
  'pdm_codigo', 'solicitante', 'descricao', 'centro_custo', 'urgencia', 'justificativa', 'referencia_externa', 'atributos',
])

/** JSON de solicitação de origem externa. Entra no workflow; não cria material. */
export function parseRequestInput(body: unknown): ParseResult<RequestInput> {
  if (!isObject(body)) return { ok: false, errors: ['corpo deve ser um objeto JSON'] }
  const errors: string[] = []
  for (const key of Object.keys(body)) {
    if (!REQUEST_KEYS.has(key)) errors.push(`campo desconhecido: ${key}`)
  }

  const pdmCode = text(body.pdm_codigo, 'pdm_codigo', 50, errors, true)
  const requester = text(body.solicitante, 'solicitante', 200, errors, true)
  const description = text(body.descricao, 'descricao', 200, errors)
  const costCenter = text(body.centro_custo, 'centro_custo', 100, errors)
  const justification = text(body.justificativa, 'justificativa', 2000, errors)
  const externalReference = text(body.referencia_externa, 'referencia_externa', 100, errors)
  const attributes = flatMap(body.atributos, 'atributos', errors) ?? {}

  let urgency: RequestInput['urgency'] = 'low'
  if (body.urgencia != null) {
    const key = (scalar(body.urgencia) ?? '').toLowerCase()
    if (URGENCY[key]) urgency = URGENCY[key]
    else errors.push('urgencia deve ser baixa, media ou alta')
  }

  if (errors.length || !pdmCode || !requester) return { ok: false, errors }
  return {
    ok: true,
    value: {
      pdmCode,
      requester,
      description: description ?? null,
      costCenter: costCenter ?? null,
      urgency,
      justification: justification ?? null,
      externalReference: externalReference ?? null,
      attributes,
    },
  }
}
