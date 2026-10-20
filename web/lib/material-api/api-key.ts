import { createHash, randomBytes } from 'crypto'

const PREFIX = 'pmat_'

/** Chave nova. Só o hash vai para a base; o texto aparece uma única vez para quem gerou. */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `${PREFIX}${randomBytes(24).toString('base64url')}`
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 12) }
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key.trim()).digest('hex')
}

export function looksLikeApiKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX) && value.length >= 20 && value.length <= 100
}
