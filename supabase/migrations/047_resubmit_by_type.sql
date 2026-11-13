-- Migration 047: reenvio da rejeitada pelo caminho do tipo
-- 1. resubmit_check: quem pode reenviar (dono, Admin ou Master), só rejeitada, do tenant em uso.
-- 2. resubmit_request (cadastro): recusa Alteração e Ampliação, que não trocam PDM nem atributos livres.
-- 3. resubmit_change_request (Alteração): campos escolhidos e valores novos, com as travas da abertura
--    (sem Tipo de Material, material do tenant e não obsoleto, sem outra alteração aberta); o "antes"
--    é relido do material, que pode ter mudado desde a rejeição.
-- 4. resubmit_expansion_request (Ampliação): mesmo centro; valores dos campos por centro; recusa se o
--    material já ganhou o centro ou se há outra ampliação aberta para ele. Campos e "antes" pelo banco.
-- Os três voltam a solicitação para a primeira etapa do workflow dela e gravam no histórico.
-- Pode rodar de novo.

-- ─── 1. Quem reenvia ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resubmit_check(p_request_id INTEGER)
RETURNS public.material_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.material_requests;
  v_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING errcode = '42501';
  END IF;
  SELECT * INTO v_req
  FROM public.material_requests
  WHERE id = p_request_id AND tenant_id = public.get_user_tenant_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;
  IF lower(coalesce(v_req.status, '')) NOT IN ('rejected', 'rejeitado') THEN
    RAISE EXCEPTION 'Só solicitação rejeitada pode ser reenviada' USING errcode = '23502';
  END IF;
  v_is_admin := public.is_master_user() OR EXISTS (
    SELECT 1
    FROM public.roles r
    WHERE r.tenant_id = v_req.tenant_id
      AND upper(r.name) = 'ADMIN'
      AND (
        r.id = (SELECT role_id FROM public.users WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.user_role_groups g WHERE g.user_id = auth.uid() AND g.role_id = r.id)
      )
  );
  IF v_req.user_id IS DISTINCT FROM auth.uid() AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Só quem abriu a solicitação, o Admin ou o Master pode reenviar' USING errcode = '42501';
  END IF;
  RETURN v_req;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resubmit_check(INTEGER) FROM PUBLIC, anon, authenticated;

-- Primeira etapa ativa do workflow da solicitação.
CREATE OR REPLACE FUNCTION public.resubmit_first_stage(p_workflow_id INTEGER, OUT status_key TEXT, OUT step_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT c.status_key, c.step_name INTO status_key, step_name
  FROM public.workflow_config c
  WHERE c.workflow_id = p_workflow_id AND c.is_active = true
  ORDER BY c."order" ASC
  LIMIT 1;
  IF status_key IS NULL THEN
    RAISE EXCEPTION 'Workflow sem etapa ativa' USING errcode = '23502';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resubmit_first_stage(INTEGER) FROM PUBLIC, anon, authenticated;

-- Material de Alteração ou Ampliação continua válido para reenviar.
CREATE OR REPLACE FUNCTION public.resubmit_target_ok(p_req public.material_requests)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status INTO v_status
  FROM public.material_database
  WHERE id = p_req.target_material_id AND tenant_id = p_req.tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material da solicitação não encontrado' USING errcode = '42501';
  END IF;
  IF v_status = 'Obsoleto' THEN
    RAISE EXCEPTION 'Material obsoleto não pode ser alterado nem ampliado' USING errcode = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resubmit_target_ok(public.material_requests) FROM PUBLIC, anon, authenticated;

-- ─── 2. Cadastro ─────────────────────────────────────────────────────────────
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

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (v_req.tenant_id, p_request_id, auth.uid(), 'resubmitted', 'Reenviada após correção para ' || v_first.step_name, v_first.status_key,
    jsonb_build_object(
      'descricao_anterior', v_req.generated_description,
      'descricao_nova', p_generated_description,
      'pdm_anterior', v_req.pdm_id,
      'pdm_novo', p_pdm_id,
      'atributos_anteriores', v_req.technical_attributes,
      'por_admin', v_req.user_id IS DISTINCT FROM auth.uid()
    ));

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resubmit_request(INTEGER, INTEGER, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_request(INTEGER, INTEGER, JSONB, TEXT, TEXT, TEXT) TO authenticated;

-- ─── 3. Alteração ────────────────────────────────────────────────────────────
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

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (v_req.tenant_id, p_request_id, auth.uid(), 'resubmitted', 'Alteração reenviada após correção para ' || v_first.step_name, v_first.status_key,
    jsonb_build_object(
      'campos_anteriores', to_jsonb(v_req.change_fields),
      'campos_novos', to_jsonb(v_fields),
      'atributos_anteriores', v_req.technical_attributes,
      'por_admin', v_req.user_id IS DISTINCT FROM auth.uid()
    ));

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resubmit_change_request(INTEGER, TEXT[], JSONB, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_change_request(INTEGER, TEXT[], JSONB, TEXT, TEXT, TEXT) TO authenticated;

-- ─── 4. Ampliação ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resubmit_expansion_request(
  p_request_id INTEGER,
  p_technical_attributes JSONB,
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
  v_fields TEXT[];
  v_attrs JSONB;
BEGIN
  v_req := public.resubmit_check(p_request_id);
  IF v_req.request_type <> 'ampliacao' THEN
    RAISE EXCEPTION 'Esta solicitação não é uma ampliação' USING errcode = '42501';
  END IF;
  PERFORM public.resubmit_target_ok(v_req);
  IF NOT EXISTS (SELECT 1 FROM public.centers c WHERE c.id = v_req.center_id AND c.tenant_id = v_req.tenant_id AND c.is_active) THEN
    RAISE EXCEPTION 'O centro da ampliação está inativo; abra outra ampliação' USING errcode = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.material_centers mc WHERE mc.material_id = v_req.target_material_id AND mc.center_id = v_req.center_id) THEN
    RAISE EXCEPTION 'O material já está neste centro' USING errcode = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.material_requests r
    WHERE r.target_material_id = v_req.target_material_id AND r.request_type = 'ampliacao'
      AND r.center_id = v_req.center_id AND NOT r.is_closed AND r.id <> p_request_id
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
  SET change_fields = v_fields,
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

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (v_req.tenant_id, p_request_id, auth.uid(), 'resubmitted', 'Ampliação reenviada após correção para ' || v_first.step_name, v_first.status_key,
    jsonb_build_object(
      'atributos_anteriores', v_req.technical_attributes,
      'por_admin', v_req.user_id IS DISTINCT FROM auth.uid()
    ));

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resubmit_expansion_request(INTEGER, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_expansion_request(INTEGER, JSONB, TEXT, TEXT) TO authenticated;
