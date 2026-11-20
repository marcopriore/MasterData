import type { SupabaseClient } from '@supabase/supabase-js'
import type { Center, MeasurementUnit } from '@/lib/supabase-api'

/** Dados de referência do tenant (servidor e navegador; o RLS isola o tenant). */

export async function listCenters(db: SupabaseClient, opts?: { activeOnly?: boolean }): Promise<Center[]> {
  let q = db.from('centers').select('id, code, name, is_active').order('code')
  if (opts?.activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as Center[]
}

export async function listMeasurementUnits(db: SupabaseClient): Promise<MeasurementUnit[]> {
  const { data, error } = await db
    .from('measurement_units')
    .select('id, name, abbreviation, category')
    .eq('is_active', true)
    .order('category')
  if (error) throw new Error(error.message)
  return (data ?? []) as MeasurementUnit[]
}
