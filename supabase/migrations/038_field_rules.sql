-- Migration 038: campos obrigatórios, opcionais ou ocultos conforme o material (ex.: Tipo de Material)
-- 1. field_rule_settings: campos de condição de cada empresa (um ou mais campos de lista).
-- 2. field_rule_profiles: combinação de valores dos campos de condição (campo ausente = qualquer) e,
--    para cada campo, required / optional / hidden. Campo sem regra segue o dicionário.
-- 3. field_requirement(): mesma regra de web/lib/field-rules.ts. Vence o perfil mais específico (mais
--    campos de condição fixados); empate, o mais exigente (obrigatório > opcional > oculto).
-- 4. stage_missing_fields(): cobra a regra e vale para qualquer etapa (área = nome da etapa em
--    maiúsculas, como em can_act_on_stage), não só as cinco padrão.
-- 5. Campo de condição só muda na etapa responsável por ele.
-- Pode rodar de novo.

-- ─── 1 e 2. Tabelas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.field_rule_settings (
  tenant_id INTEGER PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  condition_fields TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.field_rules_valid(p_rules JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(p_rules) = 'object'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(p_rules) e
      WHERE jsonb_typeof(e.value) <> 'string' OR e.value #>> '{}' NOT IN ('required', 'optional', 'hidden')
    )
$$;

CREATE OR REPLACE FUNCTION public.field_conditions_valid(p_conditions JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(p_conditions) = 'object'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(p_conditions) e
      WHERE jsonb_typeof(e.value) <> 'string' OR btrim(e.value #>> '{}') = ''
    )
$$;

CREATE TABLE IF NOT EXISTS public.field_rule_profiles (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_field_rule_profiles_rules CHECK (public.field_rules_valid(rules)),
  CONSTRAINT ck_field_rule_profiles_conditions CHECK (public.field_conditions_valid(conditions))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_field_rule_profiles_tenant_name
  ON public.field_rule_profiles (tenant_id, upper(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_field_rule_profiles_tenant ON public.field_rule_profiles (tenant_id) WHERE is_active;

-- Leitura do tenant para todos (a governança aplica a regra na tela); escrita com can_manage_fields.
ALTER TABLE public.field_rule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_rule_profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['field_rule_settings', 'field_rule_profiles'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = (SELECT public.get_user_tenant_id()))',
      t || '_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (tenant_id = (SELECT public.get_user_tenant_id()) AND (SELECT public.user_has_permission(%L)))
         WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND (SELECT public.user_has_permission(%L)))',
      t || '_write', t, 'can_manage_fields', 'can_manage_fields'
    );
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_rule_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_rule_profiles TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.field_rule_profiles_id_seq TO authenticated;

-- ─── 3. Regra efetiva de um campo ────────────────────────────────────────────
-- Valor comparado como no ERP: sem acento e sem diferença de maiúscula.
CREATE OR REPLACE FUNCTION public.field_rule_value(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(upper(btrim(public.erp_text(coalesce(p, '')))), '')
$$;

CREATE OR REPLACE FUNCTION public.field_requirement(
  p_tenant_id INTEGER,
  p_field_name TEXT,
  p_base_required BOOLEAN,
  p_attributes JSONB
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH matching AS (
    SELECT
      p.rules ->> p_field_name AS requirement,
      (SELECT count(*) FROM jsonb_object_keys(p.conditions)) AS specificity
    FROM public.field_rule_profiles p
    WHERE p.tenant_id = p_tenant_id
      AND p.is_active
      AND p.rules ? p_field_name
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_each_text(p.conditions) c
        WHERE public.field_rule_value(c.value) IS DISTINCT FROM public.field_rule_value(coalesce(p_attributes, '{}'::jsonb) ->> c.key)
      )
  )
  SELECT CASE
    -- Campo de condição não depende de perfil: é ele que escolhe o perfil.
    WHEN EXISTS (
      SELECT 1 FROM public.field_rule_settings s
      WHERE s.tenant_id = p_tenant_id AND p_field_name = ANY (s.condition_fields)
    ) THEN CASE WHEN p_base_required THEN 'required' ELSE 'optional' END
    ELSE coalesce(
      (SELECT m.requirement FROM matching m
       ORDER BY m.specificity DESC,
         CASE m.requirement WHEN 'required' THEN 0 WHEN 'optional' THEN 1 ELSE 2 END
       LIMIT 1),
      CASE WHEN p_base_required THEN 'required' ELSE 'optional' END
    )
  END
$$;

-- Recebe o tenant por parâmetro: fica só para o banco (advance_workflow roda como dono) e o service role.
REVOKE EXECUTE ON FUNCTION public.field_requirement(INTEGER, TEXT, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.field_requirement(INTEGER, TEXT, BOOLEAN, JSONB) TO service_role;

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
  WHERE f.tenant_id = p_tenant_id
    AND f.is_active
    AND f.field_name <> 'descricao_basica'
    AND upper(btrim(f.responsible_role)) = upper(btrim(coalesce(p_status, '')))
    AND public.field_requirement(p_tenant_id, f.field_name, f.is_required, p_attributes) = 'required'
    AND nullif(btrim(coalesce(p_attributes ->> f.field_name, '')), '') IS NULL
$$;

-- Também recebe o tenant por parâmetro; quem logou lia os campos de outro tenant chamando direto.
REVOKE EXECUTE ON FUNCTION public.stage_missing_fields(INTEGER, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_missing_fields(INTEGER, TEXT, JSONB) TO service_role;

-- ─── 5. Campo de condição só muda na etapa dele ──────────────────────────────
-- Depois que a etapa dona aprovou, mudar o tipo mudaria o que as etapas seguintes cobram.
-- Para corrigir, o Admin devolve a solicitação para a etapa pelo kanban.
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
      FROM public.field_rule_settings s
      CROSS JOIN LATERAL unnest(s.condition_fields) AS c(name)
      JOIN public.field_dictionary f ON f.tenant_id = s.tenant_id AND f.field_name = c.name
      WHERE s.tenant_id = OLD.tenant_id
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
