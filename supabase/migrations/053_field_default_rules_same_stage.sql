-- Migration 053: valor padrão pode depender de campo da mesma etapa
-- A 052 exigia a condição numa etapa anterior à do campo que recebe. Mas o pedido de Cadastro já traz o
-- Tipo de Material e o Grupo de Mercadorias, ambos da etapa Cadastro: a regra precisa valer.
-- 1. A condição pode estar na mesma etapa do campo que recebe ou antes. Só é recusada se estiver depois
--    (aí a regra nunca teria efeito, porque o campo já foi revisado).
-- 2. A aplicação também roda quando um campo de condição muda numa etapa: salvar o tipo na etapa
--    preenche o campo vazio que a regra cobre. Campo com valor digitado por alguém não muda.
-- Pode rodar de novo.

-- ─── 1. Ordem das etapas: recusa só se a condição vem depois ─────────────────
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
    -- A condição não pode estar depois da etapa do campo que recebe, em nenhum workflow onde as duas aparecem.
    IF EXISTS (
      SELECT 1
      FROM public.workflow_header w
      JOIN public.workflow_config c ON c.workflow_id = w.id AND c.is_active
      JOIN public.workflow_config t ON t.workflow_id = w.id AND t.is_active
      WHERE w.tenant_id = NEW.tenant_id
        AND upper(c.status_key) = upper(v_cond.responsible_role)
        AND upper(t.status_key) = upper(v_target.responsible_role)
        AND c."order" > t."order"
    ) THEN
      RAISE EXCEPTION 'A condição "%" é preenchida na etapa %, depois da etapa %, onde está o campo "%"; a regra não teria efeito',
        v_cond.field_label, upper(v_cond.responsible_role), upper(v_target.responsible_role), v_target.field_label
        USING errcode = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.field_default_rule_check() FROM PUBLIC, anon;

-- ─── 2. Aplicação também quando um campo de condição muda ────────────────────
CREATE OR REPLACE FUNCTION public.apply_field_defaults_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Criação, troca de etapa, troca de PDM (reenvio) ou troca de um campo que é condição de regra ativa.
  -- Edição de campo que não é condição não reaplica a regra (um campo limpo à mão não volta sozinho).
  IF TG_OP = 'INSERT'
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.pdm_id IS DISTINCT FROM OLD.pdm_id
     OR EXISTS (
       SELECT 1
       FROM public.field_default_rules d
       WHERE d.tenant_id = NEW.tenant_id
         AND d.is_active
         AND d.condition_field <> 'pdm'
         AND (OLD.technical_attributes ->> d.condition_field) IS DISTINCT FROM (NEW.technical_attributes ->> d.condition_field)
     ) THEN
    RETURN public.apply_field_defaults(NEW);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_field_defaults_trigger() FROM PUBLIC, anon;
