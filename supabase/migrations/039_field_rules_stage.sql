-- Migration 039: a regra por material define também a etapa do campo
-- Refaz o formato da 038 (nenhuma regra gravada ainda):
-- 1. field_rule_profiles.rules: { campo: { "role": "MRP", "requirement": "required" | "optional" | "hidden" } }.
--    Só o que difere do padrão do dicionário (field_dictionary.responsible_role e is_required); sem "role",
--    o campo fica na etapa padrão.
-- 2. Os campos de condição saem das próprias regras (chaves de "conditions" das regras ativas):
--    field_rule_settings deixa de existir.
-- 3. field_effective(): etapa e exigência do campo para o material. Mesma regra de web/lib/field-rules.ts:
--    vence a regra mais específica (mais condições); empate, a mais exigente (obrigatório > opcional > oculto).
-- 4. stage_missing_fields() e guard_request_area() passam a usar a regra nova.
-- Pode rodar de novo.

-- ─── 1. Formato das regras ───────────────────────────────────────────────────
ALTER TABLE public.field_rule_profiles DROP CONSTRAINT IF EXISTS ck_field_rule_profiles_rules;

CREATE OR REPLACE FUNCTION public.field_rules_valid(p_rules JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(p_rules) = 'object'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(p_rules) e
      WHERE jsonb_typeof(e.value) <> 'object'
        OR coalesce(e.value ->> 'requirement', '') NOT IN ('required', 'optional', 'hidden')
        OR (e.value ? 'role' AND jsonb_typeof(e.value -> 'role') <> 'null'
            AND (jsonb_typeof(e.value -> 'role') <> 'string' OR btrim(e.value ->> 'role') = ''))
    )
$$;

-- Regras no formato da 038 (texto) viram objeto, mantendo a etapa padrão.
UPDATE public.field_rule_profiles p
SET rules = (
  SELECT coalesce(jsonb_object_agg(e.key,
    CASE WHEN jsonb_typeof(e.value) = 'string' THEN jsonb_build_object('requirement', e.value #>> '{}') ELSE e.value END
  ), '{}'::jsonb)
  FROM jsonb_each(p.rules) e
)
WHERE EXISTS (SELECT 1 FROM jsonb_each(p.rules) e WHERE jsonb_typeof(e.value) = 'string');

ALTER TABLE public.field_rule_profiles
  ADD CONSTRAINT ck_field_rule_profiles_rules CHECK (public.field_rules_valid(rules));

-- ─── 2. Campos de condição ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.field_requirement(INTEGER, TEXT, BOOLEAN, JSONB);

CREATE OR REPLACE FUNCTION public.field_rule_conditions(p_tenant_id INTEGER)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT k.key), '{}')
  FROM public.field_rule_profiles p
  CROSS JOIN LATERAL jsonb_object_keys(p.conditions) AS k(key)
  WHERE p.tenant_id = p_tenant_id AND p.is_active
$$;

REVOKE EXECUTE ON FUNCTION public.field_rule_conditions(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.field_rule_conditions(INTEGER) TO authenticated, service_role;

-- ─── 3. Etapa e exigência efetivas ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.field_effective(
  p_tenant_id INTEGER,
  p_field_name TEXT,
  p_base_role TEXT,
  p_base_required BOOLEAN,
  p_attributes JSONB,
  OUT role TEXT,
  OUT requirement TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule JSONB;
BEGIN
  role := p_base_role;
  requirement := CASE WHEN p_base_required THEN 'required' ELSE 'optional' END;

  -- Campo de condição não depende de regra: é ele que escolhe a regra.
  IF p_field_name = ANY (public.field_rule_conditions(p_tenant_id)) THEN
    RETURN;
  END IF;

  SELECT p.rules -> p_field_name INTO v_rule
  FROM public.field_rule_profiles p
  WHERE p.tenant_id = p_tenant_id
    AND p.is_active
    AND p.rules ? p_field_name
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each_text(p.conditions) c
      WHERE public.field_rule_value(c.value) IS DISTINCT FROM public.field_rule_value(coalesce(p_attributes, '{}'::jsonb) ->> c.key)
    )
  ORDER BY
    (SELECT count(*) FROM jsonb_object_keys(p.conditions)) DESC,
    CASE p.rules -> p_field_name ->> 'requirement' WHEN 'required' THEN 0 WHEN 'optional' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_rule IS NOT NULL THEN
    requirement := v_rule ->> 'requirement';
    role := coalesce(nullif(btrim(v_rule ->> 'role'), ''), p_base_role);
  END IF;
END;
$$;

-- Recebe o tenant por parâmetro: só o banco (advance_workflow roda como dono) e o service role.
REVOKE EXECUTE ON FUNCTION public.field_effective(INTEGER, TEXT, TEXT, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.field_effective(INTEGER, TEXT, TEXT, BOOLEAN, JSONB) TO service_role;

-- ─── 4. Obrigatórios da etapa ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stage_missing_fields(p_tenant_id INTEGER, p_status TEXT, p_attributes JSONB)
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
    AND f.is_active
    AND f.field_name <> 'descricao_basica'
    AND upper(btrim(e.role)) = upper(btrim(coalesce(p_status, '')))
    AND e.requirement = 'required'
    AND nullif(btrim(coalesce(p_attributes ->> f.field_name, '')), '') IS NULL
$$;

REVOKE EXECUTE ON FUNCTION public.stage_missing_fields(INTEGER, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_missing_fields(INTEGER, TEXT, JSONB) TO service_role;

-- ─── Campo de condição só muda na etapa padrão dele ──────────────────────────
CREATE OR REPLACE FUNCTION public.guard_request_area()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_field RECORD;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.workflow_id IS DISTINCT FROM OLD.workflow_id THEN
    RETURN NEW;
  END IF;
  IF NOT public.can_act_on_stage(OLD.status) THEN
    RAISE EXCEPTION 'Esta etapa é da área %; só ela ou o Admin altera os campos', upper(OLD.status) USING errcode = '42501';
  END IF;

  IF NEW.technical_attributes IS DISTINCT FROM OLD.technical_attributes THEN
    FOR v_field IN
      SELECT f.field_name, f.field_label, f.responsible_role
      FROM public.field_dictionary f
      WHERE f.tenant_id = OLD.tenant_id
        AND f.field_name = ANY (public.field_rule_conditions(OLD.tenant_id))
    LOOP
      IF nullif(btrim(coalesce(OLD.technical_attributes ->> v_field.field_name, '')), '')
           IS DISTINCT FROM nullif(btrim(coalesce(NEW.technical_attributes ->> v_field.field_name, '')), '')
         AND upper(btrim(v_field.responsible_role)) <> upper(btrim(coalesce(OLD.status, ''))) THEN
        RAISE EXCEPTION '% só pode ser alterado na etapa %', v_field.field_label, v_field.responsible_role USING errcode = '42501';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_request_area() FROM PUBLIC, anon;

DROP TABLE IF EXISTS public.field_rule_settings;
