const BASE_URL = process.env.NEXT_PUBLIC_API_URL

if (!BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL não definido em .env.local')
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

export async function apiPost<T, B = unknown>(path: string, body: B): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    // Try to surface the FastAPI `detail` field for descriptive errors
    let detail: string | undefined
    try {
      const json = await res.json()
      detail = typeof json?.detail === 'string' ? json.detail : JSON.stringify(json?.detail)
    } catch {
      // ignore parse errors
    }
    throw new Error(detail ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

export async function apiPut<T, B = unknown>(path: string, body: B): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : {}) as T
}

export async function apiPatch<T, B = unknown>(path: string, body: B): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

/**
 * Upload a single File as multipart/form-data.
 * The file must be sent under the field name "file" — matches FastAPI's
 * `file: UploadFile = File(...)` parameter in the uploads router.
 */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    body: form,
    // Do NOT set Content-Type — the browser sets it automatically with the
    // correct boundary when using FormData.
  })
  if (!res.ok) {
    let detail: string | undefined
    try {
      const json = await res.json()
      detail = typeof json?.detail === 'string' ? json.detail : JSON.stringify(json?.detail)
    } catch { /* ignore */ }
    throw new Error(detail ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}