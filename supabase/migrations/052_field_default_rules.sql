-- Migration 052: valores padrão por condição
-- Quando a solicitação entra numa etapa (e na criação), cada campo que essa etapa cobra recebe o valor
-- da regra cuja condição bate (PDM ou campo de lista). Campo já preenchido por alguém não muda.
-- 1. field_default_rules: regras da empresa (condição, campo alvo, valor, fixo, prioridade).
-- 2. Validação ao gravar: condição e alvo existem, valor é opção do campo, o alvo não é campo de condição
--    das regras por material (038) e a condição é preenchida numa etapa anterior à do alvo em todo workflow
--    em que as duas aparecem (senão a regra não teria efeito).
-- 3. material_requests.default_fields: campo → {value, rule_id, rule, fixed}. Só o banco grava.
-- 4. apply_field_defaults(): ao entrar numa etapa (e na criação e no reenvio que troca o PDM):
--    - campo vazio da etapa recebe o valor da regra de maior prioridade (menor número) que bate;
--    - valor que veio de regra e que ninguém editou é trocado quando a regra muda;
--    - valor que veio de regra e cuja regra deixou de valer sai (se ninguém editou).
--    Campo de regra fixa não muda pela tela (guard_default_fields).
-- 5. Histórico da solicitação: evento 'defaults' (preenchido ou retirado).
-- Escopo: Cadastro (todos os campos) e Alteração/Ampliação (só os campos escolhidos na solicitação).
-- Pode rodar de novo.

-- ─── 1. Regras ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.field_default_rules (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  -- 'pdm' ou field_name de um campo de lista do dicionário.
  condition_field VARCHAR(100) NOT NULL,
  condition_value VARCHAR(200) NOT NULL,
  target_field VARCHAR(100) NOT NULL,
  target_value VARCHAR(500) NOT NULL,
  is_fixed BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_field_default_rules_priority CHECK (priority >= 0),
  CONSTRAINT ck_field_default_rules_not_self CHECK (condition_field <> target_field),
  CONSTRAINT ck_field_default_rules_nonblank CHECK (btrim(condition_value) <> '' AND btrim(target_value) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_field_default_rules_name
  ON public.field_default_rules (tenant_id, upper(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_field_default_rules_condition
  ON public.field_default_rules (tenant_id, target_field, condition_field, upper(btrim(condition_value)));
CREATE INDEX IF NOT EXISTS idx_field_default_rules_tenant ON public.field_default_rules (tenant_id) WHERE is_active;

ALTER TABLE public.field_default_rules ENABLE ROW LEVEL SECURITY;

-- Leitura do tenant (a solicitação aplica a regra na tela); escrita com can_manage_fields.
DROP POLICY IF EXISTS field_default_rules_select ON public.field_default_rules;
CREATE POLICY field_default_rules_select ON public.field_default_rules
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

DROP POLICY IF EXISTS field_default_rules_write ON public.field_default_rules;
CREATE POLICY field_default_rules_write ON public.field_default_rules
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND (SELECT public.user_has_permission('can_manage_fields')))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND (SELECT public.user_has_permission('can_manage_fields')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_default_rules TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.field_default_rules_id_seq TO authenticated;

-- ─── 2. Validação ────────────────────────────────────────────────────────────
-- Valores de um campo de lista, no formato que o dicionário guarda (lista, {values} ou [{value,label}]).
CREATE OR REPLACE FUNCTION public.field_option_values(p_options JSONB)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(s.v), '{}')
  FROM (
    SELECT CASE WHEN jsonb_typeof(e) = 'object' THEN coalesce(e ->> 'value', e ->> 'label') ELSE e #>> '{}' END AS v
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(p_options) = 'array' THEN p_options
        WHEN jsonb_typeof(p_options) = 'object' AND jsonb_typeof(p_options -> 'values') = 'array' THEN p_options -> 'values'
        ELSE '[]'::jsonb
      END
    ) AS e
  ) s
  WHERE s.v IS NOT NULL AND btrim(s.v) <> ''
$$;

CREATE OR REPLACE FUNCTION public.field_default_rule_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cond RECORD;
  v_target RECORD;
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.condition_value := btrim(NEW.condition_value);
  NEW.target_value := btrim(NEW.target_value);
  NEW.updated_at := now();

  -- Alvo: campo ativo do dicionário, que não é condição de regra por material.
  SELECT f.* INTO v_target
  FROM public.field_dictionary f
  WHERE f.tenant_id = NEW.tenant_id AND f.field_name = NEW.target_field AND f.is_active;
  IF NOT FOUND OR NEW.target_field = 'descricao_basica' THEN
    RAISE EXCEPTION 'Campo alvo não existe ou não recebe valor padrão' USING errcode = '23503';
  END IF;
  IF NEW.target_field = ANY (public.field_rule_conditions(NEW.tenant_id)) THEN
    RAISE EXCEPTION 'O campo "%" é condição de alguma regra por material e não recebe valor padrão', v_target.field_label
      USING errcode = '23514';
  END IF;
  IF cardinality(public.field_option_values(v_target.options)) > 0
     AND NOT (NEW.target_value = ANY (public.field_option_values(v_target.options))) THEN
    RAISE EXCEPTION 'Valor "%" não é opção do campo "%"', NEW.target_value, v_target.field_label USING errcode = '23514';
  END IF;

  IF NEW.condition_field = 'pdm' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pdm_templates p
      WHERE p.tenant_id = NEW.tenant_id AND upper(p.internal_code) = upper(NEW.condition_value)
    ) THEN
      RAISE EXCEPTION 'PDM "%" não existe nesta empresa', NEW.condition_value USING errcode = '23503';
    END IF;
  ELSE
    -- Condição: campo ativo do dicionário, com valor que é opção dele quando é lista.
    SELECT f.* INTO v_cond
    FROM public.field_dictionary f
    WHERE f.tenant_id = NEW.tenant_id AND f.field_name = NEW.condition_field AND f.is_active;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Campo da condição não existe' USING errcode = '23503';
    END IF;
    IF cardinality(public.field_option_values(v_cond.options)) > 0
       AND NOT (NEW.condition_value = ANY (public.field_option_values(v_cond.options))) THEN
      RAISE EXCEPTION 'Valor "%" não é opção do campo "%"', NEW.condition_value, v_cond.field_label USING errcode = '23514';
    END IF;
    -- A condição precisa estar preenchida antes da etapa do alvo, em todo workflow em que as duas aparecem.
    IF EXISTS (
      SELECT 1
      FROM public.workflow_header w
      JOIN public.workflow_config c ON c.workflow_id = w.id AND c.is_active
      JOIN public.workflow_config t ON t.workflow_id = w.id AND t.is_active
      WHERE w.tenant_id = NEW.tenant_id
        AND upper(c.status_key) = upper(v_cond.responsible_role)
        AND upper(t.status_key) = upper(v_target.responsible_role)
        AND c."order" >= t."order"
    ) THEN
      RAISE EXCEPTION 'A condição "%" é preenchida na etapa %, que não vem antes da etapa %, onde está o campo "%"; a regra não teria efeito',
        v_cond.field_label, upper(v_cond.responsible_role), upper(v_target.responsible_role), v_target.field_label
        USING errcode = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.field_default_rule_check() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_field_default_rule_check ON public.field_default_rules;
CREATE TRIGGER trg_field_default_rule_check
  BEFORE INSERT OR UPDATE ON public.field_default_rules
  FOR EACH ROW EXECUTE FUNCTION public.field_default_rule_check();

-- ─── 3. Coluna da solicitação ────────────────────────────────────────────────
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS default_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Só o banco grava os valores padrão, e campo com regra fixa não muda pela mão de quem usa a tela.
CREATE OR REPLACE FUNCTION public.guard_default_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.default_fields IS DISTINCT FROM '{}'::jsonb THEN
      RAISE EXCEPTION 'Valores padrão só mudam pelo fluxo' USING errcode = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.default_fields IS DISTINCT FROM OLD.default_fields THEN
    RAISE EXCEPTION 'Valores padrão só mudam pelo fluxo' USING errcode = '42501';
  END IF;

  FOR v_key IN SELECT k FROM jsonb_object_keys(OLD.default_fields) AS k WHERE OLD.default_fields -> k ->> 'fixed' = 'true' LOOP
    IF NEW.technical_attributes -> v_key IS DISTINCT FROM OLD.technical_attributes -> v_key THEN
      RAISE EXCEPTION 'O campo "%" tem valor padrão fixo e só muda pela regra', v_key USING errcode = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_default_fields() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_default_fields ON public.material_requests;
CREATE TRIGGER trg_guard_default_fields
  BEFORE INSERT OR UPDATE ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_default_fields();

-- ─── 4. Aplicação ────────────────────────────────────────────────────────────
-- Preenche (ou troca, ou retira) só os campos que a etapa atual cobra. Chamada pelo gatilho ao criar,
-- ao entrar numa etapa e ao reenviar com PDM diferente.
CREATE OR REPLACE FUNCTION public.apply_field_defaults(p_req public.material_requests)
RETURNS public.material_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attrs JSONB := coalesce(p_req.technical_attributes, '{}'::jsonb);
  v_defaults JSONB := coalesce(p_req.default_fields, '{}'::jsonb);
  v_pdm_code TEXT;
  v_done TEXT[] := '{}';
  v_rule RECORD;
  v_key TEXT;
  v_role TEXT;
  v_req TEXT;
  v_cur TEXT;
  v_prev TEXT;
BEGIN
  IF public.is_closed_status(p_req.status) THEN
    RETURN p_req;
  END IF;

  SELECT p.internal_code INTO v_pdm_code
  FROM public.pdm_templates p
  WHERE p.id = p_req.pdm_id AND p.tenant_id = p_req.tenant_id;

  -- 1. Regras que batem, por ordem de prioridade; uma por campo (a primeira).
  FOR v_rule IN
    SELECT d.id, d.name, d.target_field, d.target_value, d.is_fixed, f.responsible_role, f.is_required
    FROM public.field_default_rules d
    JOIN public.field_dictionary f ON f.tenant_id = d.tenant_id AND f.field_name = d.target_field AND f.is_active
    WHERE d.tenant_id = p_req.tenant_id
      AND d.is_active
      AND (p_req.request_type = 'cadastro' OR d.target_field = ANY (coalesce(p_req.change_fields, '{}')))
      AND CASE
            WHEN d.condition_field = 'pdm'
              THEN public.field_rule_value(d.condition_value) = public.field_rule_value(v_pdm_code)
            ELSE public.field_rule_value(d.condition_value) = public.field_rule_value(v_attrs ->> d.condition_field)
          END
    ORDER BY d.priority, d.id
  LOOP
    IF v_rule.target_field = ANY (v_done) THEN
      CONTINUE;
    END IF;

    -- Só o campo que a etapa que entra cobra (etapa e obrigatoriedade já com as regras por material).
    SELECT e.role, e.requirement INTO v_role, v_req
    FROM public.field_effective(p_req.tenant_id, v_rule.target_field, v_rule.responsible_role, v_rule.is_required, v_attrs) e;
    IF upper(btrim(coalesce(v_role, ''))) <> upper(btrim(p_req.status)) OR v_req = 'hidden' THEN
      CONTINUE;
    END IF;

    v_done := v_done || v_rule.target_field;
    v_cur := nullif(btrim(coalesce(v_attrs ->> v_rule.target_field, '')), '');
    v_prev := v_defaults -> v_rule.target_field ->> 'value';

    -- Vazio, ou ainda com o valor da regra anterior (ninguém editou): recebe o valor da regra atual.
    -- Valor digitado por alguém não muda.
    IF v_cur IS NULL OR (v_prev IS NOT NULL AND v_cur = v_prev) THEN
      IF v_cur IS DISTINCT FROM v_rule.target_value THEN
        v_attrs := jsonb_set(v_attrs, ARRAY[v_rule.target_field], to_jsonb(v_rule.target_value), true);
      END IF;
      v_defaults := jsonb_set(
        v_defaults,
        ARRAY[v_rule.target_field],
        jsonb_build_object('value', v_rule.target_value, 'rule_id', v_rule.id, 'rule', v_rule.name, 'fixed', v_rule.is_fixed),
        true
      );
    END IF;
  END LOOP;

  -- 2. Valor de regra desta etapa que nenhuma regra cobre mais: sai, se ninguém editou.
  FOR v_key IN SELECT k FROM jsonb_object_keys(v_defaults) AS k LOOP
    IF v_key = ANY (v_done) THEN
      CONTINUE;
    END IF;

    SELECT e.role, e.requirement INTO v_role, v_req
    FROM public.field_dictionary f
    CROSS JOIN LATERAL public.field_effective(p_req.tenant_id, f.field_name, f.responsible_role, f.is_required, v_attrs) e
    WHERE f.tenant_id = p_req.tenant_id AND f.field_name = v_key AND f.is_active;
    IF NOT FOUND OR upper(btrim(coalesce(v_role, ''))) <> upper(btrim(p_req.status)) OR v_req = 'hidden' THEN
      CONTINUE;
    END IF;

    v_cur := nullif(btrim(coalesce(v_attrs ->> v_key, '')), '');
    IF v_cur IS NOT DISTINCT FROM nullif(btrim(coalesce(v_defaults -> v_key ->> 'value', '')), '') THEN
      v_attrs := v_attrs - v_key;
    END IF;
    v_defaults := v_defaults - v_key;
  END LOOP;

  p_req.technical_attributes := v_attrs;
  p_req.default_fields := v_defaults;
  RETURN p_req;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_field_defaults(public.material_requests) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.apply_field_defaults_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Criação, troca de etapa ou troca de PDM (reenvio). Edição comum dos campos não reaplica a regra.
  IF TG_OP = 'INSERT'
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.pdm_id IS DISTINCT FROM OLD.pdm_id THEN
    RETURN public.apply_field_defaults(NEW);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_field_defaults_trigger() FROM PUBLIC, anon;

-- Nome começa com "z" de propósito: gatilhos BEFORE do mesmo evento rodam em ordem de nome, então este
-- roda depois de trg_skip_empty_stages (etapa escolhida), que é quem decide a etapa de entrada.
DROP TRIGGER IF EXISTS trg_z_apply_field_defaults ON public.material_requests;
CREATE TRIGGER trg_z_apply_field_defaults
  BEFORE INSERT OR UPDATE ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_field_defaults_trigger();

-- ─── 5. Histórico ────────────────────────────────────────────────────────────
-- Depois da gravação (a solicitação já existe, para o histórico apontar a ela).
CREATE OR REPLACE FUNCTION public.record_field_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_old JSONB := CASE WHEN TG_OP = 'UPDATE' THEN OLD.default_fields ELSE '{}'::jsonb END;
  v_key TEXT;
  v_label TEXT;
BEGIN
  IF v_user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_user) THEN
    v_user := NULL;
  END IF;

  -- Preenchido ou trocado por regra.
  FOR v_key IN SELECT k FROM jsonb_object_keys(NEW.default_fields) AS k
    WHERE NEW.default_fields -> k IS DISTINCT FROM v_old -> k
  LOOP
    SELECT f.field_label INTO v_label
    FROM public.field_dictionary f
    WHERE f.tenant_id = NEW.tenant_id AND f.field_name = v_key;

    INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
    VALUES (
      NEW.tenant_id, NEW.id, v_user, 'defaults',
      left(
        'Valor padrão: ' || coalesce(v_label, v_key) || ' = ' || (NEW.default_fields -> v_key ->> 'value')
          || ' (regra ' || coalesce(NEW.default_fields -> v_key ->> 'rule', '') || ')',
        500
      ),
      NEW.status,
      jsonb_build_object(
        'campo', v_key,
        'valor', NEW.default_fields -> v_key -> 'value',
        'regra_id', NEW.default_fields -> v_key -> 'rule_id',
        'regra', NEW.default_fields -> v_key -> 'rule',
        'fixo', NEW.default_fields -> v_key -> 'fixed'
      )
    );
  END LOOP;

  -- Retirado porque a regra deixou de valer.
  FOR v_key IN SELECT k FROM jsonb_object_keys(v_old) AS k WHERE NOT (NEW.default_fields ? k) LOOP
    SELECT f.field_label INTO v_label
    FROM public.field_dictionary f
    WHERE f.tenant_id = NEW.tenant_id AND f.field_name = v_key;

    INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
    VALUES (
      NEW.tenant_id, NEW.id, v_user, 'defaults',
      left(
        'Valor padrão retirado: ' || coalesce(v_label, v_key) || ' (regra ' || coalesce(v_old -> v_key ->> 'rule', '')
          || ' deixou de valer)',
        500
      ),
      NEW.status,
      jsonb_build_object('campo', v_key, 'valor', v_old -> v_key -> 'value', 'regra', v_old -> v_key ->> 'rule', 'retirado', true)
    );
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_field_defaults() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_record_field_defaults ON public.material_requests;
CREATE TRIGGER trg_record_field_defaults
  AFTER INSERT OR UPDATE ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.record_field_defaults();
