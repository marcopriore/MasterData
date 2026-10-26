/**
 * Texto aceito pelo ERP: sem acento, sem "ç" e só com caracteres ASCII de uma lista fechada.
 * Vale para tudo que vai para o material (descrições, atributos, nome e abreviações do PDM, campos do ERP).
 *
 * - Acento e cedilha saem (É → E, ç → c), mantendo maiúscula/minúscula.
 * - Alguns símbolos viram o equivalente em ASCII (½ → 1/2, ² → 2, “ ” → ", – → -, × → X, ª → A, º → O).
 * - Mantém letras, números, espaço, quebra de linha e a pontuação técnica: . , - / ( ) % + * # " ' : ; = & _ @
 *   (ex.: 1/2", 300#, 90%). Qualquer outro caractere é removido.
 */

const REPLACEMENTS: Record<string, string> = {
  'ª': 'A',
  'º': 'O',
  '°': '',
  '²': '2',
  '³': '3',
  '¹': '1',
  '½': '1/2',
  '¼': '1/4',
  '¾': '3/4',
  '×': 'X',
  '÷': '/',
  'µ': 'U',
  'Ø': 'O',
  'ø': 'o',
  'Æ': 'AE',
  'æ': 'ae',
  'ß': 'SS',
  '“': '"',
  '”': '"',
  '″': '"',
  '‘': "'",
  '’': "'",
  '′': "'",
  '–': '-',
  '—': '-',
  '−': '-',
  '…': '...',
  '\u00a0': ' ',
  '\t': ' ',
}

const REPLACE_RE = new RegExp(`[${Object.keys(REPLACEMENTS).join('')}]`, 'g')
const NOT_ALLOWED_RE = /[^A-Za-z0-9 \n.,\-/()%+*#"':;=&_@]/g

export function toErpText(value: string): string {
  if (!value) return value
  return value
    .replace(/\r\n?/g, '\n')
    .replace(REPLACE_RE, (ch) => REPLACEMENTS[ch] ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(NOT_ALLOWED_RE, '')
}

/** true quando o texto já está no padrão do ERP. */
export function isErpText(value: string): boolean {
  return toErpText(value) === value
}

/**
 * Atributos do PDM: normaliza o que vira texto do material (nome, abreviação, valores permitidos).
 * O id do atributo não muda: é a chave dos valores já gravados em solicitações e materiais.
 */
export function toErpPdmAttributes<T>(attributes: T): T {
  if (!Array.isArray(attributes)) return attributes
  return attributes.map((attr) => {
    if (!attr || typeof attr !== 'object') return attr
    const a = attr as Record<string, unknown>
    return {
      ...a,
      ...(typeof a.name === 'string' ? { name: toErpText(a.name) } : {}),
      ...(typeof a.abbreviation === 'string' ? { abbreviation: toErpText(a.abbreviation) } : {}),
      ...(Array.isArray(a.allowedValues) ? { allowedValues: toErpDeep(a.allowedValues) } : {}),
    }
  }) as T
}

/** Normaliza toda string dentro de objeto/lista (ex.: technical_attributes, blocos do ERP). Chaves ficam como estão. */
export function toErpDeep<T>(value: T): T {
  if (typeof value === 'string') return toErpText(value) as T
  if (Array.isArray(value)) return value.map((item) => toErpDeep(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toErpDeep(v)])) as T
  }
  return value
}
