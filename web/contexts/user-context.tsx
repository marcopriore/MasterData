'use client'

/**
 * UserContext — sessão via Supabase Auth + perfil de public.users.
 *
 * O layout carrega o usuário no servidor (getServerUser) e entrega pronto: a tela não espera o navegador.
 * O navegador só carrega quando o servidor não conseguiu decidir, e no login.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import { invalidateApiCache, logAction } from '@/lib/supabase-api'
import { identityFromMetadata, loadCurrentUser, type CurrentUser } from '@/lib/current-user'
import type { RolePermissions } from '@/lib/permissions'

export type { RolePermissions }
export type { CurrentUser, UserPreferences } from '@/lib/current-user'

type LoginResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; error: string }

type UserContextValue = {
  user: CurrentUser | null
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

const INACTIVE_MESSAGE = 'Usuário inativo. Fale com o administrador da sua empresa.'

// ─── Context ──────────────────────────────────────────────────────────────────

const UserContext = createContext<UserContextValue>({
  user: null,
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

export function UserProvider({
  children,
  initialUser = null,
  initialResolved = false,
}: {
  children: React.ReactNode
  /** Usuário que o servidor já carregou (layout). */
  initialUser?: CurrentUser | null
  /** O servidor decidiu (com ou sem usuário); false faz o navegador carregar. */
  initialResolved?: boolean
}) {
  const [user, setUserState] = useState<CurrentUser | null>(initialUser)
  const [ready, setReady] = useState(initialResolved)

  const loadUserFromSession = useCallback(async (): Promise<CurrentUser | null> => {
    let loaded: CurrentUser | null = null
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const identity = identityFromMetadata(session.user.id, session.user.email, session.user.app_metadata)
        loaded = await loadCurrentUser(supabase, identity)
        if (!loaded) console.error('[UserContext] perfil não encontrado para', session.user.id)
      }
    } catch (err) {
      console.error('[UserContext] loadUserFromSession error:', err)
    }
    setUserState(loaded)
    setReady(true)
    return loaded
  }, [])

  // Exceção documentada: sincroniza o contexto com a sessão do Supabase, uma fonte externa ao React
  // que só o navegador lê. Roda uma vez, e só quando o servidor não resolveu o usuário.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronização com a sessão externa do Supabase
    if (!initialResolved) void loadUserFromSession()
  }, [initialResolved, loadUserFromSession])

  const setUser = useCallback((u: CurrentUser) => {
    setUserState(u)
  }, [])

  const clearUser = useCallback(() => {
    setUserState(null)
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
              : /banned/i.test(error.message)
                ? INACTIVE_MESSAGE
                : error.message
          return { ok: false, error: msg }
        }

        if (!data.session?.user) {
          return { ok: false, error: 'Sessão não criada' }
        }

        const { data: status } = await supabase.from('users').select('is_active').eq('id', data.session.user.id).single()
        if (status?.is_active === false) {
          await supabase.auth.signOut()
          return { ok: false, error: INACTIVE_MESSAGE }
        }

        // O login não recarrega a página: nada lido pelo usuário anterior pode sobrar em memória.
        invalidateApiCache()
        const loaded = await loadUserFromSession()
        if (!loaded) {
          return {
            ok: false,
            error:
              'Perfil não encontrado. Verifique se o usuário existe em public.users.',
          }
        }
        void logAction({
          category: 'auth',
          action: 'login',
          description: `Login realizado por ${loaded.email}`,
        })
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

  // Sem a troca no servidor nada muda (a tela não pode mostrar um tenant e o banco usar outro).
  // O token novo vem do refreshSession; o log sai depois, já no tenant de destino.
  const switchTenant = useCallback(async (tenantId: number) => {
    const { switchTenantApi } = await import('@/lib/supabase-api')
    await switchTenantApi(tenantId)
    const supabase = createClient()
    const { error } = await supabase.auth.refreshSession()
    if (error) console.error('[switchTenant] refresh error:', error)
    await logAction({
      category: 'auth',
      action: 'switch_tenant',
      description: `Master entrou no tenant ${tenantId}`,
      event_data: { tenant_id: tenantId },
    })
    window.location.href = '/'
  }, [])

  const switchTenantBack = useCallback(async () => {
    const { switchTenantBackApi } = await import('@/lib/supabase-api')
    await switchTenantBackApi()
    const supabase = createClient()
    const { error } = await supabase.auth.refreshSession()
    if (error) console.error('[switchTenantBack] refresh error:', error)
    window.location.href = '/'
  }, [])

  const logout = useCallback(async () => {
    await logAction({
      category: 'auth',
      action: 'logout',
      description: `Logout de ${user?.email ?? 'usuário'}`,
    })
    const supabase = createClient()
    await supabase.auth.signOut()
    setUserState(null)
    window.location.href = '/login'
  }, [user?.email])

  const isAdmin = user?.has_admin_group === true || user?.role_name === 'ADMIN'

  const can = useCallback(
    (permission: keyof RolePermissions) => {
      if (user?.is_master) return true
      return user?.role_permissions?.[permission] ?? false
    },
    [user]
  )

  const value = useMemo<UserContextValue>(
    () => ({ user, ready, login, logout, setUser, clearUser, switchTenant, switchTenantBack, isAdmin, can }),
    [user, ready, login, logout, setUser, clearUser, switchTenant, switchTenantBack, isAdmin, can]
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  return useContext(UserContext)
}
