/** JSON enviado ao ERP (formato erp_json_v1) e leitura da resposta. Sem dependência de servidor. */
import { toErpDeep } from '@/lib/erp-text'

type Json = Record<string, unknown>

export type DictionaryField = {
  field_name: string
  erp_field: string | null
  erp_block?: string | null
}

export type ErpPayload = Json

function isObject(value: unknown): value is Json {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isObject) : []
}

function map(value: unknown): Json {
  return isObject(value) ? value : {}
}

/** Valor de atributo como texto. Atributos de PDM podem vir como { value, unit }. */
export function attributeText(value: unknown): string {
  if (value == null) return ''
  if (isObject(value) && 'value' in value) {
    const unit = typeof value.unit === 'string' && value.unit.trim() ? ` ${value.unit.trim()}` : ''
    return `${String(value.value ?? '').trim()}${unit}`.trim()
  }
  return String(value).trim()
}

function compact(obj: Json): Json {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== null && value !== undefined && value !== ''))
}

/**
 * Monta o JSON do ERP a partir da linha de material_database.
 * Ordem de precedência no cabeçalho: colunas do material, campos_adicionais, campos do dicionário.
 * productId e contentID são sempre do PRO-MAT.
 */
export function buildErpPayload(material: Json, fields: DictionaryField[] = []): ErpPayload {
  const attributes = map(material.technical_attributes)
  const header: Json = compact({
    type: material.material_type,
    unitMeasure: material.unit_of_measure,
    ncmCode: material.ncm,
    internalGroup: material.material_group,
  })
  Object.assign(header, map(material.additional_fields))

  const site: Json = { ...map(material.site) }
  let characteristics = list(material.characteristics).map((item) => ({ name: item.name, value: item.value }))

  for (const field of fields) {
    const key = field.erp_field?.trim()
    if (!key) continue
    const value = attributeText(attributes[field.field_name])
    if (!value) continue
    if (field.erp_block === 'header') header[key] = value
    else if (field.erp_block === 'site') site[key] = value
    else {
      characteristics = characteristics.filter((item) => item.name !== key)
      characteristics.push({ name: key, value })
    }
  }

  // Trava final: mesmo dado antigo com acento no banco sai no padrão do ERP.
  return toErpDeep(compact({
    productId: material.id_erp ?? undefined,
    contentID: material.id_sistema,
    ...header,
    descriptions: material.description ? { language: 'pt', name: material.description } : undefined,
    eans: list(material.eans).map((item) => ({ category: item.category, code: item.code })),
    dimensions: list(material.dimensions).map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit })),
    characteristics,
    site: Object.keys(site).length ? site : undefined,
    sales: list(material.sales),
  }))
}

/** Corpo da eliminação: só os códigos. */
export function buildErpDeletePayload(material: Json): ErpPayload {
  return compact({ productId: material.id_erp, contentID: material.id_sistema })
}

/** Lê um caminho com pontos e índices numéricos: productId, data.productId, items.0.id. */
export function readPath(value: unknown, path: string): unknown {
  let current: unknown = value
  for (const part of path.split('.').map((item) => item.trim()).filter(Boolean)) {
    if (Array.isArray(current) && /^\d+$/.test(part)) current = current[Number(part)]
    else if (isObject(current)) current = current[part]
    else return undefined
  }
  return current
}

export function readCode(body: unknown, path: string): string | null {
  const value = readPath(body, path)
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

export const MESSAGE_PATHS = ['message', 'mensagem', 'error.message', 'error', 'erro', 'detail', 'errorMessage', 'errors.0.message']

/** Mensagem do ERP para mostrar na base. Cai no texto cru se não for JSON. */
export function readMessage(body: unknown, raw: string): string {
  for (const path of MESSAGE_PATHS) {
    const value = readPath(body, path)
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500)
  }
  return raw.trim().slice(0, 500)
}

export function validResponsePath(path: string): boolean {
  return /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/.test(path) && path.length <= 200
}
