'use client'

import { useState, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { useUser } from '@/contexts/user-context'
import { makeQueryClient } from '@/lib/query/client'

function ScopedQueryClient({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient)
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/**
 * Um cache por usuário e empresa: login, logout e troca de empresa descartam o cache inteiro,
 * e nenhum dado de uma sessão aparece em outra.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const { user } = useUser()
  const scope = user ? `${user.id}:${user.tenant_id ?? ''}` : 'anon'
  return <ScopedQueryClient key={scope}>{children}</ScopedQueryClient>
}
