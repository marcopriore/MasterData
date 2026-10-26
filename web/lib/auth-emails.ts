import { supabaseAdmin } from '@/lib/supabase/admin'

const PER_PAGE = 1000

/** E-mail por id do Auth, só dos ids pedidos. listUsers é paginado (50 por página se não informar). */
export async function authEmailsById(ids: string[]): Promise<Record<string, string>> {
  const wanted = new Set(ids)
  const map: Record<string, string> = {}
  if (wanted.size === 0) return map
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) break
    for (const au of data.users) {
      if (au.email && wanted.has(au.id)) map[au.id] = au.email
    }
    if (data.users.length < PER_PAGE || Object.keys(map).length === wanted.size) break
  }
  return map
}
