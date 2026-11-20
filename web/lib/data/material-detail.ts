import type { SupabaseClient } from '@supabase/supabase-js'
import { toProfile, type FieldRuleProfile } from '@/lib/field-rules'

/**
 * Leituras da tela de detalhe do material. Recebem o cliente do Supabase (do servidor, com o cookie
 * do usuário, ou do navegador): o RLS é o mesmo nos dois lados.
 */

export type MaterialRecord = Record<string, unknown> & {
  id: number
  description: string
  status: string
  pdm_code?: string | null
  detailed_description?: string | null
  technical_attributes?: Record<string, unknown> | null
  tenant_id?: number
}

export type FieldDictionaryRow = Record<string, unknown>

export type PdmTemplateRecord = Record<string, unknown> & {
  id: number
  name: string
  internal_code: string
  attributes: unknown[]
}

function fail(error: { message?: string } | null | undefined): never {
  throw new Error(error?.message ?? 'Falha ao consultar o banco')
}

export async function getMaterialRecord(db: SupabaseClient, id: number): Promise<MaterialRecord> {
  const { data, error } = await db.from('material_database').select('*').eq('id', id).single()
  if (error || !data) fail(error ?? { message: 'Material não encontrado' })
  return data as MaterialRecord
}

/** Campos ativos do dicionário (todas as visões ERP), na ordem de exibição. */
export async function listFieldDictionary(db: SupabaseClient): Promise<FieldDictionaryRow[]> {
  const { data, error } = await db.from('field_dictionary').select('*').eq('is_active', true).order('display_order')
  if (error) fail(error)
  return (data ?? []) as FieldDictionaryRow[]
}

export async function listFieldRuleProfiles(db: SupabaseClient, tenantId: number): Promise<FieldRuleProfile[]> {
  const { data, error } = await db.from('field_rule_profiles').select('*').eq('tenant_id', tenantId).order('name')
  if (error) fail(error)
  return (data ?? []).map((row) => toProfile(row as Record<string, unknown>))
}

/**
 * Um PDM pelo código, direto (antes: a lista inteira de PDMs com a contagem de materiais, e depois o PDM).
 * Mesmo critério: o primeiro pelo nome entre os do tenant com esse código.
 */
export async function getPdmTemplateByCode(db: SupabaseClient, tenantId: number, internalCode: string): Promise<PdmTemplateRecord | null> {
  const { data, error } = await db
    .from('pdm_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('internal_code', internalCode)
    .order('name')
    .limit(1)
  if (error) fail(error)
  const row = data?.[0] as Record<string, unknown> | undefined
  if (!row) return null
  return { ...row, id: row.id as number, name: String(row.name ?? ''), internal_code: String(row.internal_code ?? ''), attributes: (row.attributes as unknown[] | null) ?? [] }
}
