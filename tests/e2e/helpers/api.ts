export const API_URL = process.env.TEST_API_URL || 'http://localhost:8000'

let masterToken: string | null = null

export async function getMasterToken(): Promise<string> {
  if (masterToken) return masterToken
  const res = await fetch(`${API_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.MASTER_EMAIL,
      password: process.env.MASTER_PASSWORD,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Login master falhou: ${JSON.stringify(data)}`)
  masterToken = data.access_token
  return masterToken
}

export async function getAdminToken(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Login admin falhou: ${JSON.stringify(data)}`)
  return data.access_token
}

async function parseJson(res: Response) {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Resposta inválida (${res.status}): ${text.slice(0, 200)}`)
  }
}

export async function apiPost(path: string, body: unknown, token: string) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const data = await parseJson(res)
  if (!res.ok) {
    throw new Error(`API POST ${path} failed (${res.status}): ${JSON.stringify(data)}`)
  }
  return data
}

export async function apiGet(path: string, token: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return parseJson(res)
}

export async function apiPut(path: string, body: unknown, token: string) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const data = await parseJson(res)
  if (!res.ok) {
    throw new Error(`API PUT ${path} failed (${res.status}): ${JSON.stringify(data)}`)
  }
  return data
}

export async function apiPatch(path: string, body: unknown, token: string) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  })
  const data = await parseJson(res)
  if (!res.ok) throw new Error(`API PATCH ${path} failed (${res.status}): ${JSON.stringify(data)}`)
  return data
}

/** PATCH sem lançar — retorna { res, data } para checagem de status. */
export async function apiPatchRaw(path: string, body: unknown, token: string) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body ?? {}),
  })
  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = text
  }
  return { res, data }
}

export async function apiDelete(path: string, token: string) {
  await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}
