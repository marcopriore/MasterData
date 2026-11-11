-- Migration 040: regras por material também na Base de Dados
-- O material da base precisa ter todo campo que a regra exige (em qualquer etapa), inclusive o
-- material antigo que for alterado. Mesma leitura de web/lib/material-rules.ts:
-- valor do campo em technical_attributes; tipo_material, unidade_medida_base, grupo_mercadorias e
-- ncm usam a coluna própria quando o atributo está vazio. descricao_basica é gerada e não conta.
-- A tela grava direto pelo navegador: o gatilho cobra em INSERT/UPDATE de quem logou quando mudam
-- os campos que a regra avalia. Importação, API e aprovação da solicitação validam no servidor
-- (service role / dono).
-- Pode rodar de novo.

CREATE OR REPLACE FUNCTION public.material_rule_attributes(p_row public.material_database)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(p_row.technical_attributes, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'tipo_material', CASE WHEN nullif(btrim(coalesce(p_row.technical_attributes ->> 'tipo_material', '')), '') IS NULL
        THEN nullif(btrim(coalesce(p_row.material_type, '')), '') END,
      'unidade_medida_base', CASE WHEN nullif(btrim(coalesce(p_row.technical_attributes ->> 'unidade_medida_base', '')), '') IS NULL
        THEN nullif(btrim(coalesce(p_row.unit_of_measure, '')), '') END,
      'grupo_mercadorias', CASE WHEN nullif(btrim(coalesce(p_row.technical_attributes ->> 'grupo_mercadorias', '')), '') IS NULL
        THEN nullif(btrim(coalesce(p_row.material_group, '')), '') END,
      'ncm', CASE WHEN nullif(btrim(coalesce(p_row.technical_attributes ->> 'ncm', '')), '') IS NULL
        THEN nullif(btrim(coalesce(p_row.ncm, '')), '') END
    ))
$$;

-- Valor vazio também quando vem como { "value": "", "unit": "UN" }.
CREATE OR REPLACE FUNCTION public.field_value_empty(p_value JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_value IS NULL
    OR jsonb_typeof(p_value) = 'null'
    OR (jsonb_typeof(p_value) = 'object' AND nullif(btrim(coalesce(p_value ->> 'value', '')), '') IS NULL)
    OR (jsonb_typeof(p_value) <> 'object' AND nullif(btrim(p_value #>> '{}'), '') IS NULL)
$$;

CREATE OR REPLACE FUNCTION public.material_missing_fields(p_tenant_id INTEGER, p_attributes JSONB)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT string_agg(f.field_label, ', ' ORDER BY f.display_order)
  FROM public.field_dictionary f
  CROSS JOIN LATERAL public.field_effective(p_tenant_id, f.field_name, f.responsible_role, f.is_required, p_attributes) e
  WHERE f.tenant_id = p_tenant_id
    -- Quem logou só consulta o próprio tenant (o gatilho roda como o usuário).
    AND (auth.role() IS DISTINCT FROM 'authenticated' OR p_tenant_id = public.get_user_tenant_id())
    AND f.is_active
    AND f.field_name <> 'descricao_basica'
    AND e.requirement = 'required'
    AND public.field_value_empty(p_attributes -> f.field_name)
$$;

REVOKE EXECUTE ON FUNCTION public.material_missing_fields(INTEGER, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.material_missing_fields(INTEGER, JSONB) TO authenticated, service_role;

-- Roda como o usuário (como guard_request_area): dentro de função do banco (advance_workflow cria o
-- material como dono) current_user não é authenticated e o gatilho não cobra.
CREATE OR REPLACE FUNCTION public.guard_material_field_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_missing TEXT;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  -- Só quando muda o que a regra avalia. Status, ERP, PDM e a descrição regerada pelo PDM passam.
  IF TG_OP = 'UPDATE'
     AND NEW.technical_attributes IS NOT DISTINCT FROM OLD.technical_attributes
     AND NEW.material_type IS NOT DISTINCT FROM OLD.material_type
     AND NEW.unit_of_measure IS NOT DISTINCT FROM OLD.unit_of_measure
     AND NEW.material_group IS NOT DISTINCT FROM OLD.material_group
     AND NEW.ncm IS NOT DISTINCT FROM OLD.ncm THEN
    RETURN NEW;
  END IF;

  v_missing := public.material_missing_fields(NEW.tenant_id, public.material_rule_attributes(NEW));
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Campos obrigatórios para este material: %', v_missing USING errcode = '23502';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_material_field_rules() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_material_field_rules ON public.material_database;
CREATE TRIGGER trg_guard_material_field_rules
  BEFORE INSERT OR UPDATE ON public.material_database
  FOR EACH ROW EXECUTE FUNCTION public.guard_material_field_rules();
