import { QueryClient } from '@tanstack/react-query'

/**
 * Dado que veio pronto do servidor não é buscado de novo ao hidratar. Cada navegação renderiza
 * a página no servidor outra vez, então a tela aberta pelo menu já chega atualizada.
 */
export const SERVER_FRESH_MS = 15_000

/**
 * Padrão: mostra o que está em cache e atualiza por trás (staleTime 0). Quem precisa de outra
 * janela declara na própria consulta (lib/queries).
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        retry: 1,
      },
    },
  })
}
