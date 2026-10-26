/**
 * Texto de busca seguro para filtros .or() do PostgREST: vírgula, parênteses, ponto e aspas
 * mudariam a expressão do filtro. Fica letra, número, espaço, - _ /.
 */
export function safeSearchTerm(raw: string | null | undefined, max = 100): string {
  return (raw ?? '').replace(/[^\p{L}\p{N}\s\-_/]/gu, '').trim().slice(0, max)
}
