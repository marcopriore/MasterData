import 'server-only'
import { cache } from 'react'
import { makeQueryClient } from '@/lib/query/client'

/** Um cliente por requisição: o cache do servidor nunca é dividido entre usuários. */
export const getServerQueryClient = cache(makeQueryClient)
