-- Migration 028: reenviar solicitação rejeitada
-- A mesma solicitação (mesmo REQ) recebe a correção e volta para a primeira etapa ativa do workflow,
-- sem atendente. O histórico guarda a rejeição anterior e o reenvio com o que mudou.
-- Pode reenviar: quem abriu, quem está no grupo ADMIN do tenant e o master.

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
  v_req RECORD;
  v_first_key TEXT;
  v_first_name TEXT;
  v_is_admin BOOLEAN;
  v_is_owner BOOLEAN;
BEGIN
  SELECT id, tenant_id, status, workflow_id, user_id, pdm_id, technical_attributes, generated_description
  INTO v_req
  FROM public.material_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  IF v_req.tenant_id IS DISTINCT FROM (SELECT tenant_id FROM public.users WHERE id = auth.uid())
     AND NOT public.is_master_user() THEN
    RAISE EXCEPTION 'Acesso negado' USING errcode = '42501';
  END IF;

  IF lower(coalesce(v_req.status, '')) NOT IN ('rejected', 'rejeitado') THEN
    RAISE EXCEPTION 'Só solicitação rejeitada pode ser reenviada' USING errcode = '23502';
  END IF;

  v_is_owner := v_req.user_id IS NOT DISTINCT FROM auth.uid();
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

  IF NOT v_is_owner AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Só quem abriu a solicitação, o Admin ou o Master pode reenviar' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pdm_templates WHERE id = p_pdm_id AND tenant_id = v_req.tenant_id) THEN
    RAISE EXCEPTION 'PDM não pertence a este tenant' USING errcode = '23503';
  END IF;

  SELECT status_key, step_name INTO v_first_key, v_first_name
  FROM public.workflow_config
  WHERE workflow_id = v_req.workflow_id AND is_active = true
  ORDER BY "order" ASC
  LIMIT 1;

  IF v_first_key IS NULL THEN
    RAISE EXCEPTION 'Workflow sem etapa ativa' USING errcode = '23502';
  END IF;

  UPDATE public.material_requests
  SET pdm_id = p_pdm_id,
      technical_attributes = coalesce(p_technical_attributes, '{}'::jsonb),
      generated_description = p_generated_description,
      urgency = coalesce(nullif(trim(p_urgency), ''), urgency),
      justification = coalesce(p_justification, justification),
      status = v_first_key,
      assigned_to_id = NULL,
      assigned_at = NULL
  WHERE id = p_request_id;

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (
    v_req.tenant_id,
    p_request_id,
    auth.uid(),
    'resubmitted',
    'Reenviada após correção para ' || v_first_name,
    v_first_key,
    jsonb_build_object(
      'descricao_anterior', v_req.generated_description,
      'descricao_nova', p_generated_description,
      'pdm_anterior', v_req.pdm_id,
      'pdm_novo', p_pdm_id,
      'atributos_anteriores', v_req.technical_attributes,
      'por_admin', NOT v_is_owner
    )
  );

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resubmit_request(INTEGER, INTEGER, JSONB, TEXT, TEXT, TEXT) TO authenticated;
