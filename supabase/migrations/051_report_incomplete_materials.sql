-- Migration 051: relatório de materiais incompletos
-- Materiais da base (menos Obsoleto) sem algum campo obrigatório pela regra por material (o mesmo
-- cálculo que a edição, a importação e a API cobram desde a 040). Para completar em lote os materiais
-- que vieram por planilha ou carga sem os campos do dicionário.
-- Quem vê: can_view_reports, só o tenant em uso.
-- Pode rodar de novo.

CREATE OR REPLACE FUNCTION public.report_incomplete_materials()
RETURNS TABLE (
  material_id INTEGER,
  id_sistema TEXT,
  id_erp TEXT,
  description TEXT,
  pdm_code TEXT,
  status TEXT,
  erp_status TEXT,
  missing TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant INTEGER := public.get_user_tenant_id();
BEGIN
  IF v_tenant IS NULL OR NOT public.user_has_permission('can_view_reports') THEN
    RAISE EXCEPTION 'Sem permissão para ver relatórios' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.id_sistema::TEXT,
    m.id_erp::TEXT,
    m.description::TEXT,
    coalesce(m.pdm_code, '')::TEXT,
    m.status::TEXT,
    coalesce(m.erp_status, '')::TEXT,
    miss.labels
  FROM public.material_database m
  CROSS JOIN LATERAL (SELECT public.material_rule_attributes(m) AS attrs) a
  CROSS JOIN LATERAL (
    SELECT array_agg(f.field_label::TEXT ORDER BY f.display_order, f.field_label) AS labels
    FROM public.field_dictionary f
    CROSS JOIN LATERAL public.field_effective(v_tenant, f.field_name, f.responsible_role, f.is_required, a.attrs) e
    WHERE f.tenant_id = v_tenant
      AND f.is_active
      AND f.field_name <> 'descricao_basica'
      AND e.requirement = 'required'
      AND public.field_value_empty(a.attrs -> f.field_name)
  ) miss
  WHERE m.tenant_id = v_tenant
    AND m.status <> 'Obsoleto'
    AND miss.labels IS NOT NULL
  ORDER BY coalesce(m.pdm_code, ''), m.id_sistema;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_incomplete_materials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_incomplete_materials() TO authenticated, service_role;
