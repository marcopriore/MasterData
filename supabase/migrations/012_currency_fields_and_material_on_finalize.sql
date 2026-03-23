-- Migration 012: Campos de preço como currency + criar material ao finalizar

-- 1. Atualizar field_type dos campos de preço para 'currency'
UPDATE public.field_dictionary
SET field_type = 'currency'
WHERE field_name IN ('ultimo_preco', 'preco_padrao', 'preco_medio_movel');

-- 2. Adicionar request_id em material_database (se não existir)
ALTER TABLE public.material_database ADD COLUMN IF NOT EXISTS request_id INTEGER REFERENCES public.material_requests(id) ON DELETE SET NULL;

-- 3. advance_workflow: criar material_database quando status = finalizado
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
  v_req RECORD;
  v_pdm RECORD;
  v_new_id_sistema TEXT;
  v_seq INTEGER;
BEGIN
  SELECT mr.*, mr.tenant_id AS t_id INTO v_req
  FROM public.material_requests mr
  WHERE mr.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  v_current_status := v_req.status;
  v_workflow_id := v_req.workflow_id;
  v_tenant_id := v_req.tenant_id;

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

  -- Se finalizado, criar registro em material_database
  IF lower(v_next_status) IN ('completed', 'finalizado') THEN
    SELECT p.name, p.internal_code INTO v_pdm
    FROM public.pdm_templates p
    WHERE p.id = v_req.pdm_id;

    SELECT COALESCE(MAX(
      NULLIF(REGEXP_REPLACE(id_sistema, '[^0-9]', '', 'g'), '')::integer
    ), 0) + 1 INTO v_seq
    FROM public.material_database
    WHERE id_sistema ~ '^MDM-[0-9]+$';

    v_new_id_sistema := 'MDM-' || LPAD(v_seq::text, 6, '0');

    INSERT INTO public.material_database (
      tenant_id,
      id_sistema,
      description,
      status,
      pdm_code,
      pdm_name,
      technical_attributes,
      erp_status,
      source,
      request_id
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
