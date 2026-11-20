import 'server-only'
import { cache } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { identityFromMetadata, loadCurrentUser, type CurrentUser } from '@/lib/current-user'

export type ServerUser = {
  /** false: o servidor não conseguiu decidir (erro); o navegador carrega de novo. */
  resolved: boolean
  user: CurrentUser | null
}

/**
 * Usuário da requisição, uma vez por requisição. getClaims valida a assinatura do token
 * com as chaves públicas do projeto (sem ida ao Auth), como o proxy.ts.
 */
export const getServerUser = cache(async (): Promise<ServerUser> => {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.getClaims()
    if (error) return { resolved: false, user: null }
    const claims = data?.claims
    if (!claims?.sub) return { resolved: true, user: null }

    const identity = identityFromMetadata(
      claims.sub,
      typeof claims.email === 'string' ? claims.email : undefined,
      claims.app_metadata as Record<string, unknown> | undefined
    )
    const user = await loadCurrentUser(supabase, identity)
    return { resolved: user !== null, user }
  } catch {
    return { resolved: false, user: null }
  }
})
