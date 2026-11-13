-- Migration 048: a Ampliação rejeitada pode trocar de centro no reenvio.
-- resubmit_expansion_request ganha p_center_id (vazio = mantém o centro). O centro novo passa pelas
-- travas da abertura: ativo, do tenant, que o material ainda não tem e sem outra ampliação aberta
-- para ele. O histórico registra a troca.
-- Pode rodar de novo.

DROP FUNCTION IF EXISTS public.resubmit_expansion_request(INTEGER, JSONB, TEXT, TEXT);

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

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (v_req.tenant_id, p_request_id, auth.uid(), 'resubmitted', 'Ampliação reenviada após correção para ' || v_first.step_name, v_first.status_key,
    jsonb_strip_nulls(jsonb_build_object(
      'atributos_anteriores', v_req.technical_attributes,
      'centro_anterior', CASE WHEN v_center IS DISTINCT FROM v_req.center_id THEN v_req.center_id END,
      'centro_novo', CASE WHEN v_center IS DISTINCT FROM v_req.center_id THEN v_center END,
      'por_admin', v_req.user_id IS DISTINCT FROM auth.uid()
    )));

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resubmit_expansion_request(INTEGER, JSONB, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_expansion_request(INTEGER, JSONB, TEXT, TEXT, INTEGER) TO authenticated;
