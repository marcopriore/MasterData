import type { AxisDeskAnexo } from '@/lib/axisdesk/types'

export const AXISDESK_MAX_TITULO = 200
export const AXISDESK_MAX_TEXTO = 2000
export const AXISDESK_MAX_ANEXOS = 5
export const AXISDESK_MAX_ANEXO_BYTES = 4_000_000

export async function filesToAnexos(files: File[]): Promise<AxisDeskAnexo[]> {
  return Promise.all(files.map(async (file) => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result !== 'string') {
          reject(new Error('Falha ao ler arquivo.'))
          return
        }
        const comma = result.indexOf(',')
        resolve(comma >= 0 ? result.slice(comma + 1) : result)
      }
      reader.onerror = () => reject(new Error('Falha ao ler arquivo.'))
      reader.readAsDataURL(file)
    })
    return {
      nome_arquivo: file.name,
      tipo_mime: file.type || 'application/octet-stream',
      conteudo_base64: base64,
    }
  }))
}

export function isValidAnexo(value: unknown): value is AxisDeskAnexo {
  if (!value || typeof value !== 'object') return false
  const anexo = value as Record<string, unknown>
  return (
    typeof anexo.nome_arquivo === 'string' && anexo.nome_arquivo.trim().length > 0 &&
    typeof anexo.tipo_mime === 'string' && anexo.tipo_mime.trim().length > 0 &&
    typeof anexo.conteudo_base64 === 'string' &&
    anexo.conteudo_base64.length > 0 &&
    anexo.conteudo_base64.length <= Math.ceil(AXISDESK_MAX_ANEXO_BYTES * 1.4)
  )
}

export function parseAnexos(value: unknown): AxisDeskAnexo[] | { error: string } {
  if (value == null) return []
  if (!Array.isArray(value)) return { error: 'Anexos inválidos.' }
  if (value.length > AXISDESK_MAX_ANEXOS) return { error: `No máximo ${AXISDESK_MAX_ANEXOS} anexos.` }
  if (!value.every(isValidAnexo)) return { error: 'Anexo inválido ou maior que 4 MB.' }
  return value
}

export function formatLocalFileSize(bytes: number): string {
  if (Number.isNaN(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function mergeSelectedFiles(current: File[], incoming: FileList | null): File[] {
  if (!incoming || incoming.length === 0) return current
  const merged = [...current]
  for (const file of Array.from(incoming)) {
    const exists = merged.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)
    if (!exists) merged.push(file)
  }
  return merged
}

export function removeSelectedFile(current: File[], index: number): File[] {
  return current.filter((_, itemIndex) => itemIndex !== index)
}

export function validateAnexoFiles(files: File[]): string | null {
  if (files.length > AXISDESK_MAX_ANEXOS) return `No máximo ${AXISDESK_MAX_ANEXOS} anexos.`
  const big = files.find((file) => file.size > AXISDESK_MAX_ANEXO_BYTES)
  if (big) return `${big.name} passa de 4 MB.`
  return null
}
