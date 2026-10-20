import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/** Segredos de integração cifrados com AES-256-GCM. A chave vem de INTEGRATION_SECRET_KEY (32 bytes em base64). */

function loadKey(raw = process.env.INTEGRATION_SECRET_KEY): Buffer | null {
  if (!raw?.trim()) return null
  const key = Buffer.from(raw.trim(), 'base64')
  return key.length === 32 ? key : null
}

export function secretBoxReady(raw?: string): boolean {
  return loadKey(raw) != null
}

export function sealSecret(plain: string, raw?: string): string {
  const key = loadKey(raw)
  if (!key) throw new Error('INTEGRATION_SECRET_KEY ausente ou inválida')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':')
}

export function openSecret(sealed: string, raw?: string): string {
  const key = loadKey(raw)
  if (!key) throw new Error('INTEGRATION_SECRET_KEY ausente ou inválida')
  const [version, iv, tag, data] = sealed.split(':')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('segredo em formato desconhecido')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}
