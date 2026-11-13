-- Migration 049: etapa sem campo para revisar é pulada
-- Regra (stage_applies):
--   * A Central de Cadastro (chave "cadastro") participa de toda solicitação, sempre: é ela que aprova
--     para integrar com o ERP. A etapa final (finalizado) também nunca é pulada.
--   * Outra etapa só acontece se tiver campo da área dela para revisar nesta solicitação:
--       cadastro  → campo do dicionário da área que aparece para o material (regra por material);
--       alteração → campo escolhido na alteração que é da área;
--       ampliação → campo "Por centro" da área.
--     Etapa sem nenhum campo (inclusive de pura aprovação) é pulada.
-- Onde vale: abertura (gatilho), aprovação (advance_workflow) e reenvio (as três funções de reenvio).
-- Se nenhuma etapa tiver o que revisar, a solicitação fica na primeira (nunca aprova sozinha).
-- material_requests.skipped_stages guarda as chaves puladas (barras da Governança); só o banco grava.
-- O histórico da solicitação registra as etapas puladas.
-- Pode rodar de novo.

ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS skipped_stages TEXT[] NOT NULL DEFAULT '{}';

-- ─── 1. A etapa tem o que revisar? ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stage_applies(p_req public.material_requests, p_status TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(btrim(coalesce(p_status, ''))) = 'cadastro' OR public.is_closed_status(p_status) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.field_dictionary f
    CROSS JOIN LATERAL public.field_effective(
      p_req.tenant_id, f.field_name, f.responsible_role, f.is_required, coalesce(p_req.technical_attributes, '{}'::jsonb)
    ) e
    WHERE f.tenant_id = p_req.tenant_id
      AND f.is_active
      AND f.field_name <> 'descricao_basica'
      AND upper(btrim(e.role)) = upper(btrim(p_status))
      AND e.requirement <> 'hidden'
      AND (p_req.request_type = 'cadastro' OR f.field_name = ANY (p_req.change_fields))
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stage_applies(public.material_requests, TEXT) FROM PUBLIC, anon, authenticated;

-- Próxima etapa que tem o que revisar, depois da ordem p_after (vazio = desde a primeira).
-- status_key vazio = nenhuma sobrou.
CREATE OR REPLACE FUNCTION public.next_applicable_stage(
  p_req public.material_requests,
  p_after INTEGER,
  OUT status_key TEXT,
  OUT step_name TEXT,
  OUT skipped_keys TEXT[],
  OUT skipped_names TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
BEGIN
  skipped_keys := '{}';
  skipped_names := '{}';
  FOR s IN
    SELECT c.status_key, c.step_name
    FROM public.workflow_config c
    WHERE c.workflow_id = p_req.workflow_id AND c.is_active AND (p_after IS NULL OR c."order" > p_after)
    ORDER BY c."order"
  LOOP
    IF public.stage_applies(p_req, s.status_key) THEN
      status_key := s.status_key;
      step_name := s.step_name;
      RETURN;
    END IF;
    skipped_keys := skipped_keys || s.status_key;
    skipped_names := skipped_names || s.step_name;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_applicable_stage(public.material_requests, INTEGER) FROM PUBLIC, anon, authenticated;

-- ─── 2. Abertura ─────────────────────────────────────────────────────────────
-- Roda depois da trava (guard) e de set_change_previous (campos da Ampliação), pela ordem do nome.
CREATE OR REPLACE FUNCTION public.skip_empty_stages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next RECORD;
  v_order INTEGER;
BEGIN
  NEW.skipped_stages := '{}';
  IF public.is_closed_status(NEW.status) OR public.stage_applies(NEW, NEW.status) THEN
    RETURN NEW;
  END IF;
  SELECT c."order" INTO v_order
  FROM public.workflow_config c
  WHERE c.workflow_id = NEW.workflow_id AND c.is_active AND lower(c.status_key) = lower(NEW.status)
  ORDER BY c."order" LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  -- A partir da etapa informada (a primeira, na abertura pela tela), anda até a que tem o que revisar.
  SELECT * INTO v_next FROM public.next_applicable_stage(NEW, v_order);
  IF v_next.status_key IS NOT NULL THEN
    NEW.skipped_stages := ARRAY[NEW.status] || v_next.skipped_keys;
    NEW.status := v_next.status_key;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.skip_empty_stages() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_skip_empty_stages ON public.material_requests;
CREATE TRIGGER trg_skip_empty_stages
  BEFORE INSERT ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.skip_empty_stages();

CREATE OR REPLACE FUNCTION public.record_skipped_on_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF cardinality(NEW.skipped_stages) = 0 THEN
    RETURN NEW;
  END IF;
  IF v_user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_user) THEN
    v_user := NULL;
  END IF;
  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  SELECT NEW.tenant_id, NEW.id, v_user, 'skipped',
    'Etapas puladas, sem campos para revisar: ' || string_agg(c.step_name, ', ' ORDER BY c."order"),
    NEW.status, jsonb_build_object('etapas', to_jsonb(NEW.skipped_stages))
  FROM public.workflow_config c
  WHERE c.workflow_id = NEW.workflow_id AND c.status_key = ANY (NEW.skipped_stages);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_skipped_on_create() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_record_skipped_on_create ON public.material_requests;
CREATE TRIGGER trg_record_skipped_on_create
  AFTER INSERT ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.record_skipped_on_create();

-- Só o banco grava as etapas puladas.
CREATE OR REPLACE FUNCTION public.guard_skipped_stages()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated' AND NEW.skipped_stages IS DISTINCT FROM OLD.skipped_stages THEN
    RAISE EXCEPTION 'Etapas puladas só mudam pelo fluxo' USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_skipped_stages() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_skipped_stages ON public.material_requests;
CREATE TRIGGER trg_guard_skipped_stages
  BEFORE UPDATE ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_skipped_stages();

-- ─── 3. Reenvio: recomeça pela primeira etapa que tem o que revisar ──────────
-- Chamada pelas funções de reenvio depois de gravar a correção (status na primeira etapa).
CREATE OR REPLACE FUNCTION public.restart_request_flow(
  p_request_id INTEGER,
  OUT status_key TEXT,
  OUT step_name TEXT,
  OUT skipped_names TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.material_requests;
  v_next RECORD;
BEGIN
  SELECT * INTO v_row FROM public.material_requests WHERE id = p_request_id;
  SELECT * INTO v_next FROM public.next_applicable_stage(v_row, NULL);
  IF v_next.status_key IS NULL THEN
    SELECT f.status_key, f.step_name INTO status_key, step_name FROM public.resubmit_first_stage(v_row.workflow_id) f;
    skipped_names := '{}';
    UPDATE public.material_requests SET status = status_key, skipped_stages = '{}' WHERE id = p_request_id;
  ELSE
    status_key := v_next.status_key;
    step_name := v_next.step_name;
    skipped_names := v_next.skipped_names;
    UPDATE public.material_requests SET status = v_next.status_key, skipped_stages = v_next.skipped_keys WHERE id = p_request_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restart_request_flow(INTEGER) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.skipped_note(p_names TEXT[])
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN cardinality(coalesce(p_names, '{}')) > 0
    THEN ' (puladas, sem campos para revisar: ' || array_to_string(p_names, ', ') || ')'
    ELSE '' END
$$;

CREATE OR REPLACE FUNCTION public.resubmit_request(
  p_request_id INTEGER,
  p_pdm_id INTEGER,
  p_technical_attributes JSONB,
  p_generated_description TEXT,
  p_urgency TEXT DEFAULT NULL,
  p_justification TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.material_requests;
  v_first RECORD;
  v_stage RECORD;
BEGIN
  v_req := public.resubmit_check(p_request_id);
  IF v_req.request_type <> 'cadastro' THEN
    RAISE EXCEPTION 'Solicitação de % é reenviada pela tela dela', v_req.request_type USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pdm_templates WHERE id = p_pdm_id AND tenant_id = v_req.tenant_id) THEN
    RAISE EXCEPTION 'PDM não pertence a este tenant' USING errcode = '23503';
  END IF;
  SELECT * INTO v_first FROM public.resubmit_first_stage(v_req.workflow_id);

  UPDATE public.material_requests
  SET pdm_id = p_pdm_id,
      technical_attributes = coalesce(p_technical_attributes, '{}'::jsonb),
      generated_description = p_generated_description,
      urgency = coalesce(nullif(trim(p_urgency), ''), urgency),
      justification = coalesce(p_justification, justification),
      status = v_first.status_key,
      assigned_to_id = NULL,
      assigned_at = NULL
  WHERE id = p_request_id;
  SELECT * INTO v_stage FROM public.restart_request_flow(p_request_id);

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (v_req.tenant_id, p_request_id, auth.uid(), 'resubmitted',
    'Reenviada após correção para ' || v_stage.step_name || public.skipped_note(v_stage.skipped_names), v_stage.status_key,
    jsonb_build_object(
      'descricao_anterior', v_req.generated_description,
      'descricao_nova', p_generated_description,
      'pdm_anterior', v_req.pdm_id,
      'pdm_novo', p_pdm_id,
      'atributos_anteriores', v_req.technical_attributes,
      'etapas_puladas', to_jsonb(v_stage.skipped_names),
      'por_admin', v_req.user_id IS DISTINCT FROM auth.uid()
    ));

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resubmit_request(INTEGER, INTEGER, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_request(INTEGER, INTEGER, JSONB, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resubmit_change_request(
  p_request_id INTEGER,
  p_change_fields TEXT[],
  p_technical_attributes JSONB,
  p_generated_description TEXT DEFAULT NULL,
  p_urgency TEXT DEFAULT NULL,
  p_justification TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.material_requests;
  v_first RECORD;
  v_stage RECORD;
  v_fields TEXT[];
  v_attrs JSONB;
BEGIN
  v_req := public.resubmit_check(p_request_id);
  IF v_req.request_type <> 'alteracao' THEN
    RAISE EXCEPTION 'Esta solicitação não é uma alteração' USING errcode = '42501';
  END IF;
  PERFORM public.resubmit_target_ok(v_req);

  SELECT coalesce(array_agg(DISTINCT btrim(f)), '{}') INTO v_fields
  FROM unnest(coalesce(p_change_fields, '{}')) AS f
  WHERE btrim(f) <> '';
  IF cardinality(v_fields) = 0 THEN
    RAISE EXCEPTION 'Escolha ao menos um campo para alterar' USING errcode = '23502';
  END IF;
  IF 'tipo_material' = ANY (v_fields) THEN
    RAISE EXCEPTION 'O Tipo de Material de um material já cadastrado não pode ser alterado (o ERP não permite)' USING errcode = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.material_requests r
    WHERE r.target_material_id = v_req.target_material_id AND r.request_type = 'alteracao'
      AND NOT r.is_closed AND r.id <> p_request_id
  ) THEN
    RAISE EXCEPTION 'Este material já tem uma alteração em andamento' USING errcode = '23505';
  END IF;

  SELECT * INTO v_first FROM public.resubmit_first_stage(v_req.workflow_id);
  SELECT public.material_rule_attributes(m) INTO v_attrs
  FROM public.material_database m WHERE m.id = v_req.target_material_id;

  UPDATE public.material_requests
  SET change_fields = v_fields,
      change_previous = coalesce((
        SELECT jsonb_object_agg(k, coalesce(v_attrs -> k, 'null'::jsonb)) FROM unnest(v_fields) AS k
      ), '{}'::jsonb),
      technical_attributes = coalesce(p_technical_attributes, '{}'::jsonb),
      generated_description = p_generated_description,
      urgency = coalesce(nullif(trim(p_urgency), ''), urgency),
      justification = coalesce(p_justification, justification),
      status = v_first.status_key,
      assigned_to_id = NULL,
      assigned_at = NULL
  WHERE id = p_request_id;
  SELECT * INTO v_stage FROM public.restart_request_flow(p_request_id);

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (v_req.tenant_id, p_request_id, auth.uid(), 'resubmitted',
    'Alteração reenviada após correção para ' || v_stage.step_name || public.skipped_note(v_stage.skipped_names), v_stage.status_key,
    jsonb_build_object(
      'campos_anteriores', to_jsonb(v_req.change_fields),
      'campos_novos', to_jsonb(v_fields),
      'atributos_anteriores', v_req.technical_attributes,
      'etapas_puladas', to_jsonb(v_stage.skipped_names),
      'por_admin', v_req.user_id IS DISTINCT FROM auth.uid()
    ));

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resubmit_change_request(INTEGER, TEXT[], JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_change_request(INTEGER, TEXT[], JSONB, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resubmit_expansion_request(
  p_request_id INTEGER,
  p_technical_attributes JSONB,
  p_urgency TEXT DEFAULT NULL,
  p_justification TEXT DEFAULT NULL,
  p_center_id INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.material_requests;
  v_first RECORD;
  v_stage RECORD;
  v_fields TEXT[];
  v_attrs JSONB;
  v_center INTEGER;
BEGIN
  v_req := public.resubmit_check(p_request_id);
  IF v_req.request_type <> 'ampliacao' THEN
    RAISE EXCEPTION 'Esta solicitação não é uma ampliação' USING errcode = '42501';
  END IF;
  PERFORM public.resubmit_target_ok(v_req);
  v_center := coalesce(p_center_id, v_req.center_id);

  IF NOT EXISTS (SELECT 1 FROM public.centers c WHERE c.id = v_center AND c.tenant_id = v_req.tenant_id AND c.is_active) THEN
    RAISE EXCEPTION 'Centro inválido ou inativo para a ampliação' USING errcode = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.material_centers mc WHERE mc.material_id = v_req.target_material_id AND mc.center_id = v_center) THEN
    RAISE EXCEPTION 'O material já está neste centro' USING errcode = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.material_requests r
    WHERE r.target_material_id = v_req.target_material_id AND r.request_type = 'ampliacao'
      AND r.center_id = v_center AND NOT r.is_closed AND r.id <> p_request_id
  ) THEN
    RAISE EXCEPTION 'Já existe uma ampliação deste material para este centro em andamento' USING errcode = '23505';
  END IF;

  SELECT * INTO v_first FROM public.resubmit_first_stage(v_req.workflow_id);
  SELECT coalesce(array_agg(f.field_name ORDER BY f.display_order, f.field_name), '{}') INTO v_fields
  FROM public.field_dictionary f
  WHERE f.tenant_id = v_req.tenant_id AND f.is_active AND f.per_center AND f.field_name <> 'descricao_basica';
  SELECT public.material_rule_attributes(m) INTO v_attrs
  FROM public.material_database m WHERE m.id = v_req.target_material_id;

  UPDATE public.material_requests
  SET center_id = v_center,
      change_fields = v_fields,
      change_previous = coalesce((
        SELECT jsonb_object_agg(k, coalesce(v_attrs -> k, 'null'::jsonb)) FROM unnest(v_fields) AS k
      ), '{}'::jsonb),
      technical_attributes = coalesce(p_technical_attributes, '{}'::jsonb),
      urgency = coalesce(nullif(trim(p_urgency), ''), urgency),
      justification = coalesce(p_justification, justification),
      status = v_first.status_key,
      assigned_to_id = NULL,
      assigned_at = NULL
  WHERE id = p_request_id;
  SELECT * INTO v_stage FROM public.restart_request_flow(p_request_id);

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (v_req.tenant_id, p_request_id, auth.uid(), 'resubmitted',
    'Ampliação reenviada após correção para ' || v_stage.step_name || public.skipped_note(v_stage.skipped_names), v_stage.status_key,
    jsonb_strip_nulls(jsonb_build_object(
      'atributos_anteriores', v_req.technical_attributes,
      'centro_anterior', CASE WHEN v_center IS DISTINCT FROM v_req.center_id THEN v_req.center_id END,
      'centro_novo', CASE WHEN v_center IS DISTINCT FROM v_req.center_id THEN v_center END,
      'etapas_puladas', to_jsonb(v_stage.skipped_names),
      'por_admin', v_req.user_id IS DISTINCT FROM auth.uid()
    )));

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resubmit_expansion_request(INTEGER, JSONB, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_expansion_request(INTEGER, JSONB, TEXT, TEXT, INTEGER) TO authenticated;

-- ─── 4. Aprovação: avança para a próxima etapa que tem o que revisar ─────────
CREATE OR REPLACE FUNCTION public.advance_workflow(p_request_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
  v_workflow_id INTEGER;
  v_next_status TEXT;
  v_next RECORD;
  v_cur_order INTEGER;
  v_tenant_id INTEGER;
  v_msg TEXT;
  v_req public.material_requests;
  v_pdm RECORD;
  v_new_id_sistema TEXT;
  v_new_material INTEGER;
  v_seq INTEGER;
  v_missing TEXT;
  v_final BOOLEAN;
  v_changes JSONB;
  v_pdm_changed BOOLEAN;
BEGIN
  PERFORM public.require_permission('can_approve');
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING errcode = '42501';
  END IF;

  SELECT mr.* INTO v_req
  FROM public.material_requests mr
  WHERE mr.id = p_request_id AND mr.tenant_id = public.get_user_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  v_current_status := v_req.status;
  v_workflow_id := v_req.workflow_id;
  v_tenant_id := v_req.tenant_id;

  IF public.is_closed_status(v_current_status) THEN
    RAISE EXCEPTION 'Solicitação já está em status final' USING errcode = '23502';
  END IF;

  IF NOT public.can_act_on_stage(v_current_status) THEN
    RAISE EXCEPTION 'Esta etapa é da área %; só ela ou o Admin aprova', upper(v_current_status) USING errcode = '42501';
  END IF;

  IF v_req.request_type IN ('alteracao', 'ampliacao') THEN
    v_missing := public.stage_missing_fields(v_tenant_id, v_current_status, v_req.technical_attributes, v_req.change_fields);
  ELSE
    v_missing := public.stage_missing_fields(v_tenant_id, v_current_status, v_req.technical_attributes);
  END IF;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Campos obrigatórios da etapa não preenchidos: %', v_missing USING errcode = '23502';
  END IF;

  IF lower(coalesce(v_current_status, '')) = 'pending' OR v_current_status = '' THEN
    v_cur_order := NULL;
  ELSE
    SELECT c."order" INTO v_cur_order
    FROM public.workflow_config c
    WHERE c.workflow_id = v_workflow_id AND c.is_active = true AND lower(c.status_key) = lower(v_current_status)
    ORDER BY c."order"
    LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Status atual não encontrado no workflow' USING errcode = '23502';
    END IF;
  END IF;

  -- Pula as etapas sem campo para revisar; sem nenhuma, conclui.
  SELECT * INTO v_next FROM public.next_applicable_stage(v_req, v_cur_order);
  v_next_status := coalesce(v_next.status_key, 'completed');

  v_final := lower(v_next_status) IN ('completed', 'finalizado');

  IF v_final AND v_req.request_type = 'ampliacao' AND EXISTS (
    SELECT 1 FROM public.material_centers mc
    WHERE mc.material_id = v_req.target_material_id AND mc.center_id = v_req.center_id
  ) THEN
    RAISE EXCEPTION 'O material já está neste centro' USING errcode = '23505';
  END IF;

  UPDATE public.material_requests
  SET status = v_next_status,
      assigned_to_id = NULL,
      assigned_at = NULL,
      skipped_stages = skipped_stages || coalesce(v_next.skipped_keys, '{}')
  WHERE id = p_request_id;

  v_msg := CASE
    WHEN v_final AND v_req.request_type = 'alteracao' THEN 'Alteração aprovada e aplicada ao material'
    WHEN v_final AND v_req.request_type = 'ampliacao' THEN 'Ampliação aprovada: centro acrescentado ao material'
    WHEN v_final THEN 'Solicitação finalizada'
    WHEN lower(v_next_status) = 'compras' THEN 'Aprovado e encaminhado para Compras'
    WHEN lower(v_next_status) = 'mrp' THEN 'Aprovado e encaminhado para MRP'
    WHEN lower(v_next_status) = 'fiscal' THEN 'Aprovado e encaminhado para Fiscal'
    WHEN lower(v_next_status) = 'contabilidade' THEN 'Aprovado e encaminhado para Contabilidade'
    ELSE 'Aprovado e encaminhado para ' || v_next_status
  END || public.skipped_note(v_next.skipped_names);

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (v_tenant_id, p_request_id, auth.uid(), 'approved', v_msg, v_next_status,
    CASE WHEN cardinality(coalesce(v_next.skipped_names, '{}')) > 0
      THEN jsonb_build_object('etapas_puladas', to_jsonb(v_next.skipped_names)) ELSE '{}'::jsonb END);

  IF v_final AND v_req.request_type = 'alteracao' THEN
    -- Só os campos escolhidos saem da solicitação para o material.
    SELECT coalesce(jsonb_object_agg(k, v_req.technical_attributes -> k), '{}'::jsonb) INTO v_changes
    FROM unnest(v_req.change_fields) AS k
    WHERE v_req.technical_attributes ? k;
    -- Atributo do PDM (fora do dicionário) muda a descrição: vale a descrição refeita na solicitação.
    SELECT EXISTS (
      SELECT 1 FROM unnest(v_req.change_fields) AS k
      WHERE NOT EXISTS (SELECT 1 FROM public.field_dictionary f WHERE f.tenant_id = v_tenant_id AND f.field_name = k)
    ) INTO v_pdm_changed;

    PERFORM set_config('promat.request_id', p_request_id::text, true);
    UPDATE public.material_database m
    SET technical_attributes = coalesce(m.technical_attributes, '{}'::jsonb) || v_changes,
        description = CASE WHEN v_pdm_changed AND nullif(btrim(coalesce(v_req.generated_description, '')), '') IS NOT NULL
          THEN v_req.generated_description ELSE m.description END,
        erp_status = 'pendente_erp',
        erp_error_message = NULL,
        updated_at = now()
    WHERE m.id = v_req.target_material_id AND m.tenant_id = v_tenant_id;
    PERFORM set_config('promat.request_id', '', true);
  ELSIF v_final AND v_req.request_type = 'ampliacao' THEN
    -- Os campos por centro revisados nas etapas ficam no centro novo; o material não muda.
    SELECT coalesce(jsonb_object_agg(k, v_req.technical_attributes -> k), '{}'::jsonb) INTO v_changes
    FROM unnest(v_req.change_fields) AS k
    WHERE v_req.technical_attributes ? k
      AND nullif(btrim(coalesce(v_req.technical_attributes ->> k, '')), '') IS NOT NULL;
    INSERT INTO public.material_centers (tenant_id, material_id, center_id, is_origin, attributes, request_id, created_by)
    VALUES (v_tenant_id, v_req.target_material_id, v_req.center_id, false, v_changes, p_request_id, auth.uid());
  ELSIF v_final AND v_req.request_type = 'cadastro' THEN
    SELECT p.name, p.internal_code INTO v_pdm
    FROM public.pdm_templates p
    WHERE p.id = v_req.pdm_id AND p.tenant_id = v_tenant_id;

    PERFORM pg_advisory_xact_lock(hashtext('material_database.id_sistema'));
    SELECT COALESCE(MAX(
      NULLIF(REGEXP_REPLACE(id_sistema, '[^0-9]', '', 'g'), '')::integer
    ), 0) + 1 INTO v_seq
    FROM public.material_database
    WHERE id_sistema ~ '^MDM-[0-9]+$';

    v_new_id_sistema := 'MDM-' || LPAD(v_seq::text, 6, '0');

    INSERT INTO public.material_database (
      tenant_id, id_sistema, description, status, pdm_code, pdm_name,
      technical_attributes, erp_status, source, request_id
    ) VALUES (
      v_tenant_id,
      v_new_id_sistema,
      COALESCE(v_req.generated_description, 'Material ' || v_new_id_sistema),
      'Ativo',
      COALESCE(v_pdm.internal_code, ''),
      COALESCE(v_pdm.name, ''),
      v_req.technical_attributes,
      'pendente_erp',
      'manual',
      p_request_id
    )
    RETURNING id INTO v_new_material;

    IF v_req.center_id IS NOT NULL THEN
      INSERT INTO public.material_centers (tenant_id, material_id, center_id, is_origin, request_id, created_by)
      VALUES (v_tenant_id, v_new_material, v_req.center_id, true, p_request_id, auth.uid());
    END IF;
  END IF;

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;
