-- Migration 034: cada área só atua na própria etapa; visão do campo em código
-- 1. Área da etapa = papel de etapa do usuário (users.role_id) com o nome da etapa (cadastro → CADASTRO).
--    Atender, salvar campos, aprovar e rejeitar: só a área da etapa atual, o ADMIN do tenant ou o Master.
--    Mover entre etapas pelo kanban: só ADMIN e Master (a área não pula as etapas das outras).
--    Rejeitar solicitação já finalizada ou rejeitada deixa de ser possível.
-- 2. field_dictionary.erp_view sempre em código (dados_basicos, compras, mrp, fiscal, contabilidade, vendas);
--    a migration 010 gravou o rótulo ("Dados Básicos", "Compras"), e o filtro da tela não achava nada.
-- Pode rodar de novo.

-- ─── 1. Área da etapa ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_is_tenant_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Mesma regra de seesCurrentPhaseFields (web/lib/permissions.ts): Master, papel ou grupo ADMIN.
  SELECT public.is_master_user() OR EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.roles r
      ON r.id = u.role_id
      OR r.id IN (SELECT g.role_id FROM public.user_role_groups g WHERE g.user_id = u.id)
    WHERE u.id = auth.uid()
      AND coalesce(u.is_active, true)
      AND upper(btrim(r.name)) = 'ADMIN'
  )
$$;

CREATE OR REPLACE FUNCTION public.can_act_on_stage(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.role() = 'service_role'
    OR public.user_is_tenant_admin()
    OR EXISTS (
      SELECT 1
      FROM public.users u
      JOIN public.roles r ON r.id = u.role_id
      WHERE u.id = auth.uid()
        AND coalesce(u.is_active, true)
        AND upper(btrim(r.name)) = upper(btrim(coalesce(p_status, '')))
    )
$$;

REVOKE EXECUTE ON FUNCTION public.user_is_tenant_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_act_on_stage(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_is_tenant_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_act_on_stage(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assign_request(p_request_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  PERFORM public.require_permission('can_attend');
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING errcode = '42501';
  END IF;

  SELECT tenant_id, assigned_to_id, coalesce(status, 'cadastro') AS status INTO v_row
  FROM public.material_requests
  WHERE id = p_request_id AND tenant_id = public.get_user_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  IF NOT public.can_act_on_stage(v_row.status) THEN
    RAISE EXCEPTION 'Esta etapa é da área %; só ela ou o Admin atende', upper(v_row.status) USING errcode = '42501';
  END IF;

  IF v_row.assigned_to_id IS NOT NULL AND v_row.assigned_to_id != auth.uid() THEN
    RAISE EXCEPTION 'Solicitação já está sendo atendida por outro usuário' USING errcode = '23505';
  END IF;

  UPDATE public.material_requests
  SET assigned_to_id = auth.uid(), assigned_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage)
  VALUES (v_row.tenant_id, p_request_id, auth.uid(), 'assigned', 'Iniciou atendimento', v_row.status);

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_request(p_request_id INTEGER, p_reason TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
BEGIN
  PERFORM public.require_permission('can_reject');
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING errcode = '42501';
  END IF;

  SELECT tenant_id, status INTO v_req
  FROM public.material_requests
  WHERE id = p_request_id AND tenant_id = public.get_user_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  IF lower(coalesce(v_req.status, '')) IN ('completed', 'approved', 'concluído', 'concluido', 'finalizado', 'rejected', 'rejeitado') THEN
    RAISE EXCEPTION 'Solicitação finalizada ou já rejeitada' USING errcode = '23502';
  END IF;

  IF NOT public.can_act_on_stage(v_req.status) THEN
    RAISE EXCEPTION 'Esta etapa é da área %; só ela ou o Admin rejeita', upper(v_req.status) USING errcode = '42501';
  END IF;

  UPDATE public.material_requests
  SET status = 'Rejected', assigned_to_id = NULL, assigned_at = NULL
  WHERE id = p_request_id;

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (
    v_req.tenant_id,
    p_request_id,
    auth.uid(),
    'rejected',
    'Solicitação rejeitada',
    'rejected',
    jsonb_build_object('justification', nullif(trim(p_reason), ''), 'etapa', v_req.status)
  );

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

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
  v_steps RECORD;
  v_idx INT;
  v_tenant_id INTEGER;
  v_msg TEXT;
  v_req RECORD;
  v_pdm RECORD;
  v_new_id_sistema TEXT;
  v_seq INTEGER;
  v_missing TEXT;
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

  IF lower(v_current_status) IN ('completed', 'approved', 'concluído', 'finalizado', 'rejected') THEN
    RAISE EXCEPTION 'Solicitação já está em status final' USING errcode = '23502';
  END IF;

  IF NOT public.can_act_on_stage(v_current_status) THEN
    RAISE EXCEPTION 'Esta etapa é da área %; só ela ou o Admin aprova', upper(v_current_status) USING errcode = '42501';
  END IF;

  v_missing := public.stage_missing_fields(v_tenant_id, v_current_status, v_req.technical_attributes);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Campos obrigatórios da etapa não preenchidos: %', v_missing USING errcode = '23502';
  END IF;

  IF lower(coalesce(v_current_status, '')) = 'pending' OR v_current_status = '' THEN
    SELECT status_key INTO v_next_status
    FROM public.workflow_config
    WHERE workflow_id = v_workflow_id AND is_active = true
    ORDER BY "order" ASC LIMIT 1;
  ELSE
    v_idx := 0;
    FOR v_steps IN
      SELECT status_key, row_number() OVER (ORDER BY "order") AS rn
      FROM public.workflow_config
      WHERE workflow_id = v_workflow_id AND is_active = true
      ORDER BY "order"
    LOOP
      IF lower(v_steps.status_key) = lower(v_current_status) THEN
        v_idx := v_steps.rn;
        EXIT;
      END IF;
    END LOOP;

    IF v_idx = 0 THEN
      RAISE EXCEPTION 'Status atual não encontrado no workflow' USING errcode = '23502';
    END IF;

    SELECT status_key INTO v_next_status
    FROM (
      SELECT status_key, row_number() OVER (ORDER BY "order") AS rn
      FROM public.workflow_config
      WHERE workflow_id = v_workflow_id AND is_active = true
    ) sub WHERE rn = v_idx + 1;

    IF v_next_status IS NULL THEN
      v_next_status := 'completed';
    END IF;
  END IF;

  UPDATE public.material_requests
  SET status = v_next_status, assigned_to_id = NULL, assigned_at = NULL
  WHERE id = p_request_id;

  v_msg := CASE
    WHEN lower(v_next_status) IN ('completed', 'finalizado') THEN 'Solicitação finalizada'
    WHEN lower(v_next_status) = 'compras' THEN 'Aprovado e encaminhado para Compras'
    WHEN lower(v_next_status) = 'mrp' THEN 'Aprovado e encaminhado para MRP'
    WHEN lower(v_next_status) = 'fiscal' THEN 'Aprovado e encaminhado para Fiscal'
    WHEN lower(v_next_status) = 'contabilidade' THEN 'Aprovado e encaminhado para Contabilidade'
    ELSE 'Aprovado e encaminhado para ' || v_next_status
  END;

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage)
  VALUES (v_tenant_id, p_request_id, auth.uid(), 'approved', v_msg, v_next_status);

  IF lower(v_next_status) IN ('completed', 'finalizado') THEN
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
    );
  END IF;

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.move_request_stage(p_request_id INTEGER, p_status_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_from_name TEXT;
  v_to_key TEXT;
  v_to_name TEXT;
  v_last_key TEXT;
BEGIN
  SELECT id, tenant_id, status, workflow_id, assigned_to_id INTO v_req
  FROM public.material_requests
  WHERE id = p_request_id AND tenant_id = public.get_user_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING errcode = '42501';
  END IF;

  IF NOT public.user_is_tenant_admin() THEN
    RAISE EXCEPTION 'Mover entre etapas pelo kanban é do Admin; a área aprova ou rejeita a própria etapa' USING errcode = '42501';
  END IF;

  IF lower(coalesce(v_req.status, '')) IN ('completed', 'approved', 'concluído', 'concluido', 'finalizado', 'rejected', 'rejeitado') THEN
    RAISE EXCEPTION 'Solicitação finalizada ou rejeitada não volta para o fluxo pelo arraste' USING errcode = '23502';
  END IF;

  SELECT status_key, step_name INTO v_to_key, v_to_name
  FROM public.workflow_config
  WHERE workflow_id = v_req.workflow_id AND is_active = true AND lower(status_key) = lower(trim(p_status_key))
  LIMIT 1;

  IF v_to_key IS NULL THEN
    RAISE EXCEPTION 'Etapa não existe neste workflow' USING errcode = '23502';
  END IF;

  SELECT status_key INTO v_last_key
  FROM public.workflow_config
  WHERE workflow_id = v_req.workflow_id AND is_active = true
  ORDER BY "order" DESC
  LIMIT 1;

  IF lower(v_to_key) = lower(v_last_key) THEN
    RAISE EXCEPTION 'Para finalizar, use Aprovar: a última etapa cria o material e envia ao ERP' USING errcode = '23502';
  END IF;

  IF lower(v_to_key) = lower(coalesce(v_req.status, '')) THEN
    RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
  END IF;

  SELECT step_name INTO v_from_name
  FROM public.workflow_config
  WHERE workflow_id = v_req.workflow_id AND lower(status_key) = lower(coalesce(v_req.status, ''))
  LIMIT 1;

  UPDATE public.material_requests
  SET status = v_to_key, assigned_to_id = NULL, assigned_at = NULL
  WHERE id = p_request_id;

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (
    v_req.tenant_id,
    p_request_id,
    auth.uid(),
    'stage_change',
    'Movida de ' || coalesce(v_from_name, v_req.status, '—') || ' para ' || v_to_name || ' pelo kanban',
    v_to_key,
    jsonb_build_object(
      'de', v_req.status,
      'para', v_to_key,
      'origem', 'kanban',
      'atendente_anterior', v_req.assigned_to_id
    )
  );

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

-- Salvar campos da solicitação direto (governança): só a área da etapa atual ou o Admin.
-- A troca de etapa/workflow segue com guard_material_requests (só can_edit_workflows).
CREATE OR REPLACE FUNCTION public.guard_request_area()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
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
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_request_area() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_request_area ON public.material_requests;
CREATE TRIGGER trg_guard_request_area
  BEFORE UPDATE ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_request_area();

-- ─── 2. Visão do campo em código ─────────────────────────────────────────────
UPDATE public.field_dictionary
SET erp_view = CASE v.code
    WHEN 'classificacao_fiscal' THEN 'fiscal'
    WHEN 'dados_basicos_1' THEN 'dados_basicos'
    ELSE v.code
  END
FROM (
  SELECT id, regexp_replace(lower(btrim(public.erp_text(erp_view))), '[^a-z0-9]+', '_', 'g') AS code
  FROM public.field_dictionary
  WHERE erp_view IS NOT NULL
) v
WHERE v.id = field_dictionary.id
  AND field_dictionary.erp_view IS DISTINCT FROM (CASE v.code
    WHEN 'classificacao_fiscal' THEN 'fiscal'
    WHEN 'dados_basicos_1' THEN 'dados_basicos'
    ELSE v.code
  END);
