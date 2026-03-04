// Máscaras e validações de campos
// Uso: import { maskNCM, maskCFOP, ... } from '@/lib/masks'

// NCM: 0000.00.00
export function maskNCM(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`
}

// CFOP: 0000 (4 dígitos)
export function maskCFOP(value: string): string {
  return value.replace(/\D/g, '').slice(0, 4)
}

// CNPJ: 00.000.000/0000-00
export function maskCNPJ(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

// CPF: 000.000.000-00
export function maskCPF(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

// Telefone: (00) 00000-0000
export function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// CEP: 00000-000
export function maskCEP(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

// Moeda: R$ 0.000,00
export function maskCurrency(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  const num = parseInt(digits, 10) / 100
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

// Decimal: permite número com vírgula ou ponto
export function maskDecimal(value: string): string {
  return value.replace(/[^0-9.,]/g, '').slice(0, 15)
}

// Validações (retornam true se válido)
export function isValidNCM(v: string): boolean {
  return /^\d{4}\.\d{2}\.\d{2}$/.test(v)
}
export function isValidCFOP(v: string): boolean {
  return /^\d{4}$/.test(v)
}
export function isValidCNPJ(v: string): boolean {
  return /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(v)
}
export function isValidCPF(v: string): boolean {
  return /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(v)
}
export function isValidPhone(v: string): boolean {
  return /^\(\d{2}\) \d{5}-\d{4}$/.test(v)
}
export function isValidCEP(v: string): boolean {
  return /^\d{5}-\d{3}$/.test(v)
}

// Mapeamento field_name → máscara (para uso em forms)
export const FIELD_MASKS: Record<string, (v: string) => string> = {
  ncm: maskNCM,
  cfop: maskCFOP,
  cnpj: maskCNPJ,
  cpf: maskCPF,
  telefone: maskPhone,
  phone: maskPhone,
  cep: maskCEP,
  peso_bruto: maskDecimal,
  peso_liquido: maskDecimal,
  peso: maskDecimal,
  preco: maskCurrency,
  valor: maskCurrency,
  preco_padrao: maskCurrency,
  standard_price: maskCurrency,
}

/** Retorna o valor mascarado ou o rawValue se não houver máscara. */
export function applyFieldMask(fieldNameOrId: string, rawValue: string): string {
  const key = fieldNameOrId.toLowerCase().replace(/\s+/g, '_')
  const maskFn = FIELD_MASKS[key]
  return maskFn ? maskFn(rawValue) : rawValue
}
