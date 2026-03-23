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
import type { Session } from '@supabase/supabase-js'

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
  can_attend: boolean
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
  can_attend: false,
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

type ProfileOverrides = { tenant_id?: number; tenant_name?: string }

function mapProfileToUser(
  profile: DbProfile,
  session: Session,
  overrides?: ProfileOverrides
): CurrentUser {
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
    tenant_id: overrides?.tenant_id ?? profile.tenant_id,
    tenant_name: overrides?.tenant_name ?? profile.tenants?.name ?? undefined,
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

  const loadUserFromSession = useCallback(async (): Promise<CurrentUser | null> => {
    try {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()

      if (!authUser) {
        setUserState(null)
        setAccessTokenState(null)
        setReady(true)
        return null
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setUserState(null)
        setAccessTokenState(null)
        setReady(true)
        return null
      }

      const { data: profile, error } = await supabase
        .from('users')
        .select('*, roles(name, role_type, permissions), tenants(name)')
        .eq('id', authUser.id)
        .single()

      if (error || !profile) {
        console.error('[UserContext] profile fetch failed:', error)
        setUserState(null)
        setAccessTokenState(null)
        setReady(true)
        return null
      }

      const p = profile as DbProfile
      let effectiveTenantId = p.tenant_id
      let effectiveTenantName = p.tenants?.name ?? undefined
      const isMaster = authUser.app_metadata?.is_master === true

      if (isMaster) {
        const cookieTenantId =
          typeof document !== 'undefined'
            ? document.cookie
                .split('; ')
                .find((r) => r.startsWith('mdm_selected_tenant='))
                ?.split('=')[1]
            : null

        if (cookieTenantId) {
          const parsed = parseInt(cookieTenantId, 10)
          if (!isNaN(parsed)) {
            effectiveTenantId = parsed
          }
          if (effectiveTenantId !== p.tenant_id) {
            const { data: tenant } = await supabase
              .from('tenants')
              .select('name')
              .eq('id', effectiveTenantId)
              .single()
            effectiveTenantName = tenant?.name ?? effectiveTenantName
          }
        } else {
          const metaTenantId = authUser.app_metadata?.tenant_id as
            | number
            | undefined
          if (metaTenantId && metaTenantId !== p.tenant_id) {
            effectiveTenantId = metaTenantId
            const { data: tenant } = await supabase
              .from('tenants')
              .select('name')
              .eq('id', metaTenantId)
              .single()
            effectiveTenantName = tenant?.name ?? effectiveTenantName
          }
        }
      }

      const mappedUser = mapProfileToUser(p, session, {
        tenant_id: effectiveTenantId,
        tenant_name: effectiveTenantName,
      })

      setUserState(mappedUser)
      setAccessTokenState(session.access_token ?? null)
      setReady(true)
      return mappedUser
    } catch (err) {
      console.error('[UserContext] loadUserFromSession error:', err)
      setUserState(null)
      setAccessTokenState(null)
      setReady(true)
      return null
    }
  }, [])

  useEffect(() => {
    loadUserFromSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setUser = useCallback((u: CurrentUser) => {
    setUserState(u)
  }, [])

  const clearUser = useCallback(() => {
    setUserState(null)
    setAccessTokenState(null)
  }, [])

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          const msg =
            error.message === 'Invalid login credentials'
              ? 'Credenciais inválidas'
              : error.message
          return { ok: false, error: msg }
        }

        if (!data.session?.user) {
          return { ok: false, error: 'Sessão não criada' }
        }

        const loaded = await loadUserFromSession()
        if (!loaded) {
          return {
            ok: false,
            error:
              'Perfil não encontrado. Verifique se o usuário existe em public.users.',
          }
        }
        return { ok: true, user: loaded }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Erro de conexão',
        }
      }
    },
    [loadUserFromSession]
  )

  const switchTenant = useCallback(async (tenantId: number) => {
    document.cookie = `mdm_selected_tenant=${tenantId}; path=/; max-age=${60 * 60 * 24 * 365}`

    try {
      const { switchTenantApi } = await import('@/lib/supabase-api')
      await switchTenantApi(tenantId)
    } catch (err) {
      console.error('[switchTenant] API error:', err)
    }

    try {
      const supabase = createClient()
      await supabase.auth.refreshSession()
    } catch (err) {
      console.error('[switchTenant] refresh error:', err)
    }

    window.location.href = '/'
  }, [])

  const switchTenantBack = useCallback(async () => {
    document.cookie = 'mdm_selected_tenant=; path=/; max-age=0'

    try {
      const { switchTenantBackApi } = await import('@/lib/supabase-api')
      await switchTenantBackApi()
    } catch (err) {
      console.error('[switchTenantBack] API error:', err)
    }

    try {
      const supabase = createClient()
      await supabase.auth.refreshSession()
    } catch (err) {
      console.error('[switchTenantBack] refresh error:', err)
    }

    window.location.href = '/'
  }, [])

  const logout = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    document.cookie = 'mdm_selected_tenant=; path=/; max-age=0'
    setUserState(null)
    setAccessTokenState(null)
    window.location.href = '/login'
  }, [])

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
