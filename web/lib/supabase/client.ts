import { createClient as createSupabaseClient } from '@supabase/supabase-js'

function getTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const cookie = document.cookie
    .split(';')
    .find((c) => c.trim().startsWith('sb-') && c.includes('auth-token'))
  if (!cookie) return null
  try {
    const value = cookie.split('=').slice(1).join('=')
    const decoded = JSON.parse(atob(value.replace('base64-', '')))
    return decoded.access_token || null
  } catch {
    return null
  }
}

export function createClient() {
  const token = getTokenFromCookie()

  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  )

  return client
}
