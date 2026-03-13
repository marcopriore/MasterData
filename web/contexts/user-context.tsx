'use client'

/**
 * UserContext — sessão via Supabase Auth + perfil de public.users.
 *
 * - Autenticação: Supabase Auth (signInWithPassword, signOut)
 * - Perfil: public.users + roles + tenants (tenant_id, role, permissions)
 * - accessToken: session.access_token (JWT Supabase para chamadas à API)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, Session } from '@supabase/supabase-js'

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
  can_view_database: boolean
  can_manage_roles: boolean
  can_manage_value_dictionary: boolean
  can_standardize: boolean
  can_bulk_import: boolean
}

export type UserPreferences = {
  theme: 'light' | 'dark'
  language: 'pt' | 'en'
}

export type CurrentUser = {
  id: string
  name: string
  email: string
  role_id: number
  role_name: string
  role_type?: 'sistema' | 'etapa' | 'operacional'
  role_permissions: RolePermissions
  is_active: boolean
  preferences: UserPreferences
  created_at: string | null
  tenant_id?: number
  tenant_name?: string
  is_master?: boolean
  max_description_length?: number
}

type LoginResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; error: string }

type UserContextValue = {
  user: CurrentUser | null
  accessToken: string | null
  ready: boolean
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => void
  setUser: (u: CurrentUser) => void
  clearUser: () => void
  switchTenant: (tenantId: number) => Promise<void>
  switchTenantBack: () => Promise<void>
  isAdmin: boolean
  can: (permission: keyof RolePermissions) => boolean
}

// ─── Default permissions ───────────────────────────────────────────────────────

const EMPTY_PERMISSIONS: RolePermissions = {
  can_approve: false,
  can_reject: false,
  can_submit_request: false,
  can_view_pdm: false,
  can_edit_pdm: false,
  can_view_workflows: false,
  can_edit_workflows: false,
  can_manage_users: false,
  can_view_logs: false,
  can_manage_fields: false,
  can_view_database: true,
  can_manage_roles: false,
  can_manage_value_dictionary: false,
  can_standardize: false,
  can_bulk_import: false,
}

// ─── Profile helpers ───────────────────────────────────────────────────────────

type DbProfile = {
  id: string
  tenant_id: number
  name: string
  role_id: number
  is_active: boolean
  preferences: { theme?: string; language?: string } | null
  max_description_length: number | null
  created_at: string | null
  roles: { name: string; role_type: string; permissions: RolePermissions } | null
  tenants: { name: string } | null
}

function mapProfileToUser(profile: DbProfile, session: Session): CurrentUser {
  const prefs = profile.preferences as UserPreferences | null
  const permissions = (profile.roles?.permissions ?? {}) as Partial<RolePermissions>

  return {
    id: profile.id,
    name: profile.name,
    email: session.user.email ?? '',
    role_id: profile.role_id,
    role_name: profile.roles?.name ?? '',
    role_type: (profile.roles?.role_type as CurrentUser['role_type']) ?? 'sistema',
    role_permissions: { ...EMPTY_PERMISSIONS, ...permissions },
    is_active: profile.is_active,
    preferences: {
      theme: (prefs?.theme as 'light' | 'dark') ?? 'light',
      language: (prefs?.language as 'pt' | 'en') ?? 'pt',
    },
    created_at: profile.created_at,
    tenant_id: profile.tenant_id,
    tenant_name: profile.tenants?.name ?? undefined,
    is_master: (session.user.app_metadata?.is_master as boolean) ?? false,
    max_description_length: profile.max_description_length ?? 40,
  }
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
  switchTenant: async () => {},
  switchTenantBack: async () => {},
  isAdmin: false,
  can: () => false,
})

// ─── Provider ─────────────────────────────────────────────────────────────────

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>(null)
  const [accessToken, setAccessTokenState] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const supabase = createClient()

  const fetchProfile = useCallback(
    async (uid: string): Promise<CurrentUser | null> => {
      const { data: session } = await supabase.auth.getSession()
      if (!session.session) return null

      const { data: profile, error } = await supabase
        .from('users')
        .select('*, roles(name, role_type, permissions), tenants(name)')
        .eq('id', uid)
        .single()

      if (error || !profile) {
        console.error('[UserContext] profile fetch failed:', error)
        return null
      }

      return mapProfileToUser(profile as DbProfile, session.session)
    },
    [supabase]
  )

  const loadUserFromSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session?.user) {
      setUserState(null)
      setAccessTokenState(null)
      setReady(true)
      return
    }

    const profile = await fetchProfile(data.session.user.id)
    if (profile) {
      setUserState(profile)
      setAccessTokenState(data.session.access_token)
    } else {
      setUserState(null)
      setAccessTokenState(null)
    }
    setReady(true)
  }, [supabase, fetchProfile])

  useEffect(() => {
    loadUserFromSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUserState(null)
        setAccessTokenState(null)
      } else if (session?.user) {
        const profile = await fetchProfile(session.user.id)
        if (profile) {
          setUserState(profile)
          setAccessTokenState(session.access_token)
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [loadUserFromSession, supabase.auth, fetchProfile])

  const setUser = useCallback((u: CurrentUser) => {
    setUserState(u)
  }, [])

  const clearUser = useCallback(() => {
    setUserState(null)
    setAccessTokenState(null)
  }, [])

  // ── login ───────────────────────────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          return { ok: false, error: error.message }
        }

        if (!data.session?.user) {
          return { ok: false, error: 'Sessão não criada' }
        }

        const profile = await fetchProfile(data.session.user.id)
        if (!profile) {
          return {
            ok: false,
            error: 'Perfil não encontrado. Verifique se o usuário existe em public.users.',
          }
        }

        setUserState(profile)
        setAccessTokenState(data.session.access_token)
        return { ok: true, user: profile }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Erro de conexão',
        }
      }
    },
    [supabase, fetchProfile]
  )

  // ── switchTenant (MASTER only) — ainda usa FastAPI, requer backend atualizado ─

  const switchTenant = useCallback(async (tenantId: number) => {
    const token = accessToken
    if (!token) throw new Error('Sessão expirada')
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL
    if (!BASE_URL) throw new Error('NEXT_PUBLIC_API_URL não definido')
    const res = await fetch(`${BASE_URL}/admin/auth/switch-tenant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: tenantId }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(typeof json?.detail === 'string' ? json.detail : `HTTP ${res.status}`)
    }
    const data = (await res.json()) as {
      access_token: string
      tenant_id: number
      tenant_name: string
    }
    if (user) {
      setUserState({
        ...user,
        tenant_id: data.tenant_id,
        tenant_name: data.tenant_name,
        is_master: true,
      })
    }
    setAccessTokenState(data.access_token)
    window.location.reload()
  }, [accessToken, user])

  const switchTenantBack = useCallback(async () => {
    const token = accessToken
    if (!token) throw new Error('Sessão expirada')
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL
    if (!BASE_URL) throw new Error('NEXT_PUBLIC_API_URL não definido')
    const res = await fetch(`${BASE_URL}/admin/auth/switch-tenant/back`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(typeof json?.detail === 'string' ? json.detail : `HTTP ${res.status}`)
    }
    const data = (await res.json()) as {
      access_token: string
      tenant_id: number
      tenant_name: string
    }
    if (user) {
      setUserState({
        ...user,
        tenant_id: data.tenant_id,
        tenant_name: data.tenant_name,
        is_master: true,
      })
    }
    setAccessTokenState(data.access_token)
    window.location.reload()
  }, [accessToken, user])

  // ── logout ──────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setUserState(null)
    setAccessTokenState(null)
    window.location.href = '/login'
  }, [supabase])

  // ── Derived ──────────────────────────────────────────────────────────────────

  const isAdmin = user?.role_name === 'ADMIN'

  const can = useCallback(
    (permission: keyof RolePermissions) =>
      user?.role_permissions?.[permission] ?? false,
    [user]
  )

  return (
    <UserContext.Provider
      value={{
        user,
        accessToken,
        ready,
        login,
        logout,
        setUser,
        clearUser,
        switchTenant,
        switchTenantBack,
        isAdmin,
        can,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
