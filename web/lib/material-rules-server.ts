import { supabaseAdmin } from '@/lib/supabase/admin'
import { toProfile, type FieldRuleProfile } from '@/lib/field-rules'
import type { RuleField } from '@/lib/material-rules'

export type MaterialRuleContext = { fields: RuleField[]; profiles: FieldRuleProfile[] }

/** Dicionário ativo e regras ativas do tenant, para validar um material no servidor (service role). */
export async function loadMaterialRuleContext(tenantId: number): Promise<MaterialRuleContext> {
  const [fieldsRes, profilesRes] = await Promise.all([
    supabaseAdmin
      .from('field_dictionary')
      .select('field_name, field_label, responsible_role, is_required, display_order')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('display_order'),
    supabaseAdmin.from('field_rule_profiles').select('*').eq('tenant_id', tenantId).eq('is_active', true),
  ])
  if (fieldsRes.error) throw new Error(fieldsRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  return {
    fields: (fieldsRes.data ?? []) as RuleField[],
    profiles: (profilesRes.data ?? []).map((row) => toProfile(row as Record<string, unknown>)),
  }
}
