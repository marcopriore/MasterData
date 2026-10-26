-- Migration 026: arraste no kanban entre etapas intermediárias, com histórico
-- Antes o kanban fazia UPDATE direto em material_requests: sem request_history e sem validar a etapa.
-- Finalizar e rejeitar continuam só por advance_workflow e reject_request.

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
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  IF v_req.tenant_id IS DISTINCT FROM (SELECT tenant_id FROM public.users WHERE id = auth.uid())
     AND NOT public.is_master_user() THEN
    RAISE EXCEPTION 'Acesso negado' USING errcode = '42501';
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

GRANT EXECUTE ON FUNCTION public.move_request_stage(INTEGER, TEXT) TO authenticated;
