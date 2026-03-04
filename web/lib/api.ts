const BASE_URL = process.env.NEXT_PUBLIC_API_URL

if (!BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL não definido em .env.local')
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

/**
 * GET with optional JWT for role-based filtering.
 * Pass accessToken when the endpoint supports auth (e.g. dashboard stats).
 */
export async function apiGetWithAuth<T>(path: string, accessToken?: string | null): Promise<T> {
  const headers: HeadersInit = {}
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: 'no-store',
    headers: Object.keys(headers).length ? headers : undefined,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

export async function apiPost<T, B = unknown>(path: string, body: B): Promise<T> {
  return apiPostWithAuth(path, body)
}

/**
 * POST with optional JWT (e.g. for create_request to set user_id).
 */
export async function apiPostWithAuth<T, B = unknown>(
  path: string,
  body: B,
  accessToken?: string | null
): Promise<T> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
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
  return apiPutWithAuth(path, body)
}

/**
 * PUT with optional JWT (e.g. for admin endpoints).
 */
export async function apiPutWithAuth<T, B = unknown>(
  path: string,
  body: B,
  accessToken?: string | null
): Promise<T> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
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

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : {}) as T
}

/**
 * DELETE with optional JWT (e.g. for admin endpoints).
 */
export async function apiDeleteWithAuth<T>(
  path: string,
  accessToken?: string | null
): Promise<T> {
  const headers: HeadersInit = {}
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: Object.keys(headers).length ? headers : undefined,
  })
  if (!res.ok) {
    let detail: string | undefined
    try {
      const json = await res.json()
      detail = typeof json?.detail === 'string' ? json.detail : JSON.stringify(json?.detail)
    } catch { /* ignore */ }
    throw new Error(detail ?? `HTTP ${res.status}`)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : {}) as T
}

export async function apiPatch<T, B = unknown>(path: string, body: B): Promise<T> {
  return apiPatchWithAuth(path, body)
}

/**
 * PATCH with optional JWT (e.g. for approve/reject with auth).
 */
export async function apiPatchWithAuth<T, B = unknown>(
  path: string,
  body: B,
  accessToken?: string | null
): Promise<T> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
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

/**
 * Upload file with auth header. Used for import endpoints.
 */
export async function apiUploadWithAuth<T>(
  path: string,
  file: File,
  accessToken: string | null
): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const headers: HeadersInit = {}
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: Object.keys(headers).length ? headers : undefined,
    body: form,
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

/**
 * Download a file as blob with auth. Triggers browser download.
 */
export async function apiDownloadWithAuth(
  path: string,
  accessToken: string | null,
  filename: string
): Promise<void> {
  const headers: HeadersInit = {}
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: Object.keys(headers).length ? headers : undefined,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}