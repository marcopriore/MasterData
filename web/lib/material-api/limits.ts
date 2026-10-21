/** Limites das APIs de material. Sem dependência de servidor, para a documentação usar os mesmos números. */
export const MAX_BODY_BYTES = 1024 * 1024
/** Chamadas por minuto por chave. */
export const RATE_LIMIT_PER_KEY = 120
/** Teto geral de chamadas sem chave válida por minuto. Acima disso, nem grava no monitor. */
export const RATE_LIMIT_UNAUTHENTICATED = 60
