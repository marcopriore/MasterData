/**
 * Código e nome do PDM. Código: até 10 caracteres, A-Z, 0-9, "-" e "_", único no tenant.
 * Padrão sugerido: 4 letras do nome + 3 dígitos (PARA001, MOTO001, SERV002).
 * A migration 030 aplica o mesmo padrão aos PDMs que já existiam.
 */
import { toErpText } from '@/lib/erp-text'

export const PDM_CODE_MAX = 10

const STOPWORDS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'COM', 'PARA', 'POR', 'A', 'O', 'AS', 'OS'])

/** Como o código é gravado: maiúsculo, sem acento, só A-Z 0-9 - _, até 10 caracteres. */
export function normalizePdmCode(raw: string): string {
  return toErpText(raw ?? '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, PDM_CODE_MAX)
}

export function pdmCodeProblem(code: string): string | null {
  if (!code) return 'Informe o código do PDM.'
  if (code.length > PDM_CODE_MAX) return `O código do PDM tem no máximo ${PDM_CODE_MAX} caracteres.`
  if (!/^[A-Z0-9_-]+$/.test(code)) return 'O código do PDM aceita só letras, números, "-" e "_".'
  return null
}

/** Chave para comparar nomes de PDM: sem acento, sem diferença de maiúsculas e espaços. */
export function pdmNameKey(name: string): string {
  return toErpText(name ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** 4 letras a partir das palavras significativas do nome; completa com X. */
export function pdmCodeBase(name: string): string {
  const letters = toErpText(name ?? '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word))
    .join('')
  return (letters + 'XXXX').slice(0, 4)
}

/** Próximo código livre no padrão base + 3 dígitos, considerando os códigos já usados no tenant. */
export function suggestPdmCode(name: string, existingCodes: Iterable<string>): string {
  const base = pdmCodeBase(name)
  const used = new Set([...existingCodes].map((c) => c.toUpperCase()))
  for (let n = 1; n < 1000; n += 1) {
    const code = `${base}${String(n).padStart(3, '0')}`
    if (!used.has(code)) return code
  }
  return base
}
