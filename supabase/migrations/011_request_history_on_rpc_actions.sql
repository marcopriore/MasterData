-- Migration 011: Inserir em request_history quando assign, advance e reject

-- ─── assign_request: registrar "Iniciou atendimento" ──────────────────────────
CREATE OR REPLACE FUNCTION public.assign_request(p_request_id INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_tenant_id INTEGER;
  v_assigned_to UUID;
  v_row RECORD;
  v_status TEXT;
BEGIN
  SELECT tenant_id, assigned_to_id, status INTO v_row
  FROM public.material_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  v_assigned_to := v_row.assigned_to_id;
  v_tenant_id := v_row.tenant_id;
  v_status := coalesce(v_row.status, 'cadastro');

  IF v_assigned_to IS NOT NULL AND v_assigned_to != auth.uid() THEN
    RAISE EXCEPTION 'Solicitação já está sendo atendida por outro usuário'
      USING errcode = '23505';
  END IF;

  IF v_tenant_id != (SELECT tenant_id FROM public.users WHERE id = auth.uid()) THEN
    IF NOT public.is_master_user() THEN
      RAISE EXCEPTION 'Acesso negado' USING errcode = '42501';
    END IF;
  END IF;

  UPDATE public.material_requests
  SET assigned_to_id = auth.uid(), assigned_at = now()
  WHERE id = p_request_id;

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage)
  VALUES (v_tenant_id, p_request_id, auth.uid(), 'assigned', 'Iniciou atendimento', v_status);

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── advance_workflow: registrar aprovação e novo status ──────────────────────
CREATE OR REPLACE FUNCTION public.advance_workflow(p_request_id INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_current_status TEXT;
  v_workflow_id INTEGER;
  v_next_status TEXT;
  v_steps RECORD;
  v_idx INT;
  v_tenant_id INTEGER;
  v_msg TEXT;
BEGIN
  SELECT status, workflow_id, tenant_id INTO v_current_status, v_workflow_id, v_tenant_id
  FROM public.material_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  IF lower(v_current_status) IN ('completed', 'approved', 'concluído', 'finalizado', 'rejected') THEN
    RAISE EXCEPTION 'Solicitação já está em status final' USING errcode = '23502';
  END IF;

  IF lower(coalesce(v_current_status, '')) = 'pending' OR v_current_status = '' THEN
    SELECT status_key INTO v_next_status
    FROM public.workflow_config
    WHERE workflow_id = v_workflow_id AND is_active = true
    ORDER BY "order" ASC LIMIT 1;
  ELSE
    v_idx := 0;
    FOR v_steps IN
      SELECT status_key, row_number() OVER (ORDER BY "order") as rn
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
      SELECT status_key, row_number() OVER (ORDER BY "order") as rn
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

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── reject_request: registrar rejeição com justificativa ─────────────────────
CREATE OR REPLACE FUNCTION public.reject_request(p_request_id INTEGER, p_reason TEXT DEFAULT '')
RETURNS JSONB AS $$
DECLARE
  v_tenant_id INTEGER;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.material_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  UPDATE public.material_requests
  SET status = 'Rejected'
  WHERE id = p_request_id;

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (
    v_tenant_id,
    p_request_id,
    auth.uid(),
    'rejected',
    'Solicitação rejeitada',
    'rejected',
    jsonb_build_object('justification', nullif(trim(p_reason), ''))
  );

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
