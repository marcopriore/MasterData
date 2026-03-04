'use client'

/**
 * UserContext — session store backed by localStorage + a session cookie.
 *
 * localStorage  → full user object (name, role, permissions, preferences)
 * Cookie        → "mdm_session=1"  (readable by the Edge middleware for
 *                 route protection; contains no sensitive data)
 *
 * Flow:
 *   login()   → calls POST /admin/auth/login, stores user in localStorage,
 *               sets the session cookie, applies the saved theme.
 *   logout()  → clears localStorage + cookie, redirects to /login.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RolePermissions = {
  can_approve: boolean
  can_reject: boolean
  can_submit_request: boolean

  can_view_pdm: boolean
  can_edit_pdm: boolean

  can_view_workflows: boolean
  can_edit_workflows: boolean

  can_manage_users: boolean
  can_view_logs: boolean
  can_manage_fields: boolean
}

export type UserPreferences = {
  theme: 'light' | 'dark'
  language: 'pt' | 'en'
}

export type CurrentUser = {
  id: number
  name: string
  email: string
  role_id: number
  role_name: string
  role_type?: 'sistema' | 'etapa'  // default 'sistema' when absent (legacy)
  role_permissions: RolePermissions
  is_active: boolean
  preferences: UserPreferences
  created_at: string | null
}

type LoginResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; error: string }

type UserContextValue = {
  user: CurrentUser | null
  /** JWT for API auth (Authorization: Bearer) */
  accessToken: string | null
  /** True after the initial localStorage read has completed (avoids SSR flash) */
  ready: boolean
  /** Calls the API, persists the session and returns the result */
  login: (email: string, password: string) => Promise<LoginResult>
  /** Clears the session and navigates to /login */
  logout: () => void
  /** Low-level setter used by the profile page to update in-memory + storage */
  setUser: (u: CurrentUser) => void
  clearUser: () => void
  isAdmin: boolean
  can: (permission: keyof RolePermissions) => boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'mdm_user'
const TOKEN_KEY = 'mdm_access_token'
/** Cookie name read by the middleware — value is always "1" */
const SESSION_COOKIE = 'mdm_session'

// ─── Cookie helpers (client-side only) ───────────────────────────────────────

function setSessionCookie() {
  // SameSite=Lax, no Secure flag (dev uses http); 8-hour expiry
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${SESSION_COOKIE}=1; path=/; expires=${expires}; SameSite=Lax`
}

function clearSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
}

// ─── Context ──────────────────────────────────────────────────────────────────

const UserContext = createContext<UserContextValue>({
  user: null,
  accessToken: null,
  ready: false,
  login: async () => ({ ok: false, error: 'Provider not mounted' }),
  logout: () => {},
  setUser: () => {},
  clearUser: () => {},
  isAdmin: false,
  can: () => false,
})

// ─── Provider ─────────────────────────────────────────────────────────────────

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const token = localStorage.getItem(TOKEN_KEY)
      if (raw) {
        setUserState(JSON.parse(raw) as CurrentUser)
      }
      if (token) {
        setAccessToken(token)
      }
    } catch {
      // corrupted — ignore
    } finally {
      setReady(true)
    }
  }, [])

  // ── Persist helpers ────────────────────────────────────────────────────────

  const persistUser = useCallback((u: CurrentUser, token?: string) => {
    setUserState(u)
    if (token) {
      setAccessToken(token)
      try { localStorage.setItem(TOKEN_KEY, token) } catch {}
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(u)) } catch {}
    setSessionCookie()
  }, [])

  const setUser = useCallback((u: CurrentUser) => {
    persistUser(u)
  }, [persistUser])

  const clearUser = useCallback(() => {
    setUserState(null)
    setAccessToken(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(TOKEN_KEY)
    } catch {}
    clearSessionCookie()
  }, [])

  // ── login ──────────────────────────────────────────────────────────────────

  const login = useCallback(async (
    email: string,
    password: string
  ): Promise<LoginResult> => {
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL
    try {
      const res = await fetch(`${BASE_URL}/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
          const json = await res.json()
          if (typeof json?.detail === 'string') {
            detail = json.detail
          } else if (Array.isArray(json?.detail) && json.detail.length > 0) {
            // Pydantic 422 validation errors: [{ loc, msg, type }]
            const msgs = (json.detail as Array<{ msg: string; loc?: string[] }>)
              .map((e) => e.msg)
              .join('; ')
            detail = msgs || detail
            console.error('[login] 422 detail:', json.detail)
          }
        } catch {}
        return { ok: false, error: detail }
      }

      const data = await res.json() as { ok: boolean; user: CurrentUser; access_token?: string }
      persistUser(data.user, data.access_token)
      return { ok: true, user: data.user }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Erro de conexão com o servidor',
      }
    }
  }, [persistUser])

  // ── logout ─────────────────────────────────────────────────────────────────

  const logout = useCallback(() => {
    clearUser()
    window.location.href = '/login'
  }, [clearUser])

  // ── Derived ────────────────────────────────────────────────────────────────

  const isAdmin = user?.role_name === 'ADMIN'

  const can = useCallback(
    (permission: keyof RolePermissions) =>
      user?.role_permissions?.[permission] ?? false,
    [user]
  )

  return (
    <UserContext.Provider
      value={{ user, accessToken, ready, login, logout, setUser, clearUser, isAdmin, can }}
    >
      {children}
    </UserContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUser() {
  return useContext(UserContext)
}
