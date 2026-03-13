-- Migration 005: Funções RPC para lógica de negócio
-- assign_request, advance_workflow, reject_request, sync_value_dictionary, merge_dictionary_entries, get_governance_stats

-- ─── assign_request: iniciar atendimento (atribui ao usuário logado) ──────────
CREATE OR REPLACE FUNCTION public.assign_request(p_request_id INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_tenant_id INTEGER;
  v_assigned_to UUID;
  v_row RECORD;
BEGIN
  SELECT tenant_id, assigned_to_id INTO v_row
  FROM public.material_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  v_assigned_to := v_row.assigned_to_id;
  v_tenant_id := v_row.tenant_id;

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

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── advance_workflow: avançar para próximo status ────────────────────────────
CREATE OR REPLACE FUNCTION public.advance_workflow(p_request_id INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_current_status TEXT;
  v_workflow_id INTEGER;
  v_next_status TEXT;
  v_steps RECORD;
  v_idx INT;
BEGIN
  SELECT status, workflow_id INTO v_current_status, v_workflow_id
  FROM public.material_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  IF lower(v_current_status) IN ('completed', 'approved', 'concluído', 'finalizado', 'rejected') THEN
    RAISE EXCEPTION 'Solicitação já está em status final' USING errcode = '23502';
  END IF;

  -- Pending → primeira etapa
  IF lower(coalesce(v_current_status, '')) = 'pending' OR v_current_status = '' THEN
    SELECT status_key INTO v_next_status
    FROM public.workflow_config
    WHERE workflow_id = v_workflow_id AND is_active = true
    ORDER BY "order" ASC LIMIT 1;
  ELSE
    -- Encontrar próximo step
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

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── reject_request: rejeitar solicitação ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_request(p_request_id INTEGER, p_reason TEXT DEFAULT '')
RETURNS JSONB AS $$
BEGIN
  UPDATE public.material_requests
  SET status = 'Rejected'
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── sync_value_dictionary: sincronizar valores dos PDMs para value_dictionary ─
CREATE OR REPLACE FUNCTION public.sync_value_dictionary()
RETURNS JSONB AS $$
DECLARE
  v_tenant_id INTEGER;
  v_created INT := 0;
  v_val TEXT;
  v_attr JSONB;
  v_opt JSONB;
  v_exists BOOLEAN;
BEGIN
  v_tenant_id := public.get_user_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem tenant' USING errcode = 'P0001';
  END IF;

  FOR v_attr IN
    SELECT jsonb_array_elements(COALESCE(p.attributes, '[]'::jsonb)) as elem
    FROM public.pdm_templates p
    WHERE p.tenant_id = v_tenant_id
  LOOP
    IF lower(v_attr->>'dataType') NOT IN ('lov', 'select') THEN
      CONTINUE;
    END IF;

    FOR v_opt IN SELECT jsonb_array_elements(COALESCE(v_attr->'allowedValues', v_attr->'options', '[]'::jsonb))
    LOOP
      v_val := trim(both from coalesce(v_opt->>'value', v_opt #>> '{}', ''));
      IF v_val = '' THEN CONTINUE; END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.value_dictionary
        WHERE tenant_id = v_tenant_id AND lower(trim(value)) = lower(v_val)
      ) INTO v_exists;

      IF NOT v_exists THEN
        INSERT INTO public.value_dictionary (tenant_id, value, abbreviation)
        VALUES (v_tenant_id, v_val, coalesce(v_opt->>'abbreviation', v_val));
        v_created := v_created + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('created', v_created);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── merge_dictionary_entries: unir duplicatas (keep_id sobrevive, discard_id removido) ─
CREATE OR REPLACE FUNCTION public.merge_dictionary_entries(p_keep_id INTEGER, p_discard_id INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_tenant_id INTEGER;
  v_keep RECORD;
  v_discard RECORD;
BEGIN
  v_tenant_id := public.get_user_tenant_id();

  SELECT * INTO v_keep FROM public.value_dictionary WHERE id = p_keep_id AND tenant_id = v_tenant_id;
  SELECT * INTO v_discard FROM public.value_dictionary WHERE id = p_discard_id AND tenant_id = v_tenant_id;

  IF v_keep IS NULL OR v_discard IS NULL THEN
    RAISE EXCEPTION 'Uma ou ambas entradas não encontradas' USING errcode = 'P0002';
  END IF;

  -- Atualizar PDMs, materiais e solicitações: valor discard → valor keep
  -- (simplificado: apenas removemos discard; propagação complexa pode ficar na API)
  DELETE FROM public.value_dictionary WHERE id = p_discard_id;

  RETURN jsonb_build_object('merged', true, 'keep_id', p_keep_id, 'discard_id', p_discard_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── get_governance_stats: estatísticas do Kanban ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_governance_stats()
RETURNS JSONB AS $$
DECLARE
  v_tenant_id INTEGER;
  v_total INT;
  v_em_andamento INT;
  v_atrasadas INT;
  v_rejeitadas INT;
  v_taxa_rejeicao NUMERIC;
  v_finalizadas INT;
BEGIN
  v_tenant_id := public.get_user_tenant_id();
  IF v_tenant_id IS NULL AND NOT public.is_master_user() THEN
    RETURN jsonb_build_object('total', 0, 'em_andamento', 0, 'atrasadas', 0,
      'taxa_rejeicao', 0, 'tempo_medio_ciclo', 0, 'sla_por_etapa', '{}'::jsonb);
  END IF;

  SELECT count(*) INTO v_total FROM public.material_requests
  WHERE tenant_id = COALESCE(v_tenant_id, tenant_id);

  SELECT count(*) INTO v_em_andamento FROM public.material_requests
  WHERE tenant_id = COALESCE(v_tenant_id, tenant_id)
    AND lower(status) NOT IN ('finalizado', 'completed', 'rejected');

  SELECT count(*) INTO v_atrasadas FROM public.material_requests
  WHERE tenant_id = COALESCE(v_tenant_id, tenant_id)
    AND lower(status) NOT IN ('finalizado', 'completed', 'rejected')
    AND created_at < now() - interval '5 days';

  SELECT count(*) INTO v_rejeitadas FROM public.material_requests
  WHERE tenant_id = COALESCE(v_tenant_id, tenant_id) AND lower(status) = 'rejected';

  v_taxa_rejeicao := CASE WHEN v_total > 0 THEN round((v_rejeitadas::numeric / v_total * 100), 1) ELSE 0 END;

  RETURN jsonb_build_object(
    'total', v_total,
    'em_andamento', v_em_andamento,
    'atrasadas', v_atrasadas,
    'taxa_rejeicao', v_taxa_rejeicao,
    'tempo_medio_ciclo', 0,
    'sla_por_etapa', jsonb_build_object(
      'cadastro', 0, 'compras', 0, 'mrp', 0, 'fiscal', 0, 'contabilidade', 0
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── create_tenant_onboarding: criar tenant + roles + workflow + field_dict ───
-- NOTA: O usuário admin deve ser criado via Supabase Auth Admin API (signUp)
--       e em seguida inserido em public.users com o mesmo UUID.
-- Esta função cria: tenant, roles, workflow, field_dictionary.
CREATE OR REPLACE FUNCTION public.create_tenant_onboarding(
  p_tenant_name TEXT,
  p_slug TEXT,
  p_admin_name TEXT,
  p_admin_email TEXT,
  p_admin_password TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_tenant_id INTEGER;
  v_role_admin_id INTEGER;
  v_workflow_id INTEGER;
  v_role_def JSONB;
  v_step JSONB;
  v_field JSONB;
  v_roles_def JSONB := '[
    {"name":"ADMIN","role_type":"sistema","permissions":{"can_submit_request":true,"can_approve":true,"can_reject":true,"can_edit_pdm":true,"can_view_pdm":true,"can_view_logs":true,"can_bulk_import":true,"can_standardize":true,"can_manage_roles":true,"can_manage_users":true,"can_manage_fields":true,"can_manage_value_dictionary":true,"can_view_database":true,"can_edit_workflows":true,"can_view_workflows":true}},
    {"name":"SOLICITANTE","role_type":"operacional","permissions":{"can_submit_request":true,"can_approve":false,"can_reject":false,"can_edit_pdm":false,"can_view_pdm":true,"can_view_logs":false,"can_bulk_import":false,"can_standardize":false,"can_manage_roles":false,"can_manage_users":false,"can_manage_fields":false,"can_manage_value_dictionary":false,"can_view_database":true,"can_edit_workflows":false,"can_view_workflows":true}},
    {"name":"CADASTRO","role_type":"operacional","permissions":{"can_submit_request":true,"can_approve":true,"can_reject":true,"can_edit_pdm":true,"can_view_pdm":true,"can_view_logs":false,"can_bulk_import":true,"can_standardize":true,"can_manage_roles":false,"can_manage_users":false,"can_manage_fields":true,"can_manage_value_dictionary":false,"can_view_database":true,"can_edit_workflows":false,"can_view_workflows":true}},
    {"name":"COMPRAS","role_type":"operacional","permissions":{"can_submit_request":false,"can_approve":true,"can_reject":true,"can_edit_pdm":false,"can_view_pdm":true,"can_view_logs":false,"can_bulk_import":false,"can_standardize":false,"can_manage_roles":false,"can_manage_users":false,"can_manage_fields":false,"can_manage_value_dictionary":false,"can_view_database":true,"can_edit_workflows":false,"can_view_workflows":true}},
    {"name":"MRP","role_type":"operacional","permissions":{"can_submit_request":false,"can_approve":true,"can_reject":true,"can_edit_pdm":false,"can_view_pdm":true,"can_view_logs":false,"can_bulk_import":false,"can_standardize":false,"can_manage_roles":false,"can_manage_users":false,"can_manage_fields":false,"can_manage_value_dictionary":false,"can_view_database":true,"can_edit_workflows":false,"can_view_workflows":true}},
    {"name":"FISCAL","role_type":"operacional","permissions":{"can_submit_request":false,"can_approve":true,"can_reject":true,"can_edit_pdm":false,"can_view_pdm":true,"can_view_logs":false,"can_bulk_import":false,"can_standardize":false,"can_manage_roles":false,"can_manage_users":false,"can_manage_fields":false,"can_manage_value_dictionary":false,"can_view_database":true,"can_edit_workflows":false,"can_view_workflows":true}},
    {"name":"CONTABILIDADE","role_type":"operacional","permissions":{"can_submit_request":false,"can_approve":true,"can_reject":true,"can_edit_pdm":false,"can_view_pdm":true,"can_view_logs":false,"can_bulk_import":false,"can_standardize":false,"can_manage_roles":false,"can_manage_users":false,"can_manage_fields":false,"can_manage_value_dictionary":false,"can_view_database":true,"can_edit_workflows":false,"can_view_workflows":true}},
    {"name":"MASTER","role_type":"sistema","permissions":{"can_submit_request":true,"can_approve":true,"can_reject":true,"can_edit_pdm":true,"can_view_pdm":true,"can_view_logs":true,"can_bulk_import":true,"can_standardize":true,"can_manage_roles":true,"can_manage_users":true,"can_manage_fields":true,"can_manage_value_dictionary":true,"can_view_database":true,"can_edit_workflows":true,"can_view_workflows":true}}
  ]'::jsonb;
  v_steps_def JSONB := '[
    {"step_name":"Central de Cadastro","status_key":"cadastro","order":1},
    {"step_name":"Compras","status_key":"compras","order":2},
    {"step_name":"MRP","status_key":"mrp","order":3},
    {"step_name":"Fiscal","status_key":"fiscal","order":4},
    {"step_name":"Contabilidade","status_key":"contabilidade","order":5},
    {"step_name":"Finalizado","status_key":"finalizado","order":6}
  ]'::jsonb;
BEGIN
  IF NOT public.is_master_user() THEN
    RAISE EXCEPTION 'Apenas usuário master pode criar tenants' USING errcode = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = lower(trim(p_slug))) THEN
    RAISE EXCEPTION 'Slug já existe' USING errcode = '23505';
  END IF;

  INSERT INTO public.tenants (name, slug, is_active)
  VALUES (trim(p_tenant_name), lower(trim(p_slug)), true)
  RETURNING id INTO v_tenant_id;

  FOR v_role_def IN SELECT * FROM jsonb_array_elements(v_roles_def)
  LOOP
    INSERT INTO public.roles (tenant_id, name, role_type, permissions)
    VALUES (v_tenant_id, v_role_def->>'name', v_role_def->>'role_type', v_role_def->'permissions');
    IF v_role_def->>'name' = 'ADMIN' THEN
      v_role_admin_id := currval('roles_id_seq');
    END IF;
  END LOOP;

  INSERT INTO public.workflow_header (tenant_id, name, description, is_active)
  VALUES (v_tenant_id, 'Fluxo Padrão de Cadastro',
    'Fluxo padrão: Central de Cadastro → Compras → MRP → Fiscal → Contabilidade → Finalizado',
    true)
  RETURNING id INTO v_workflow_id;

  FOR v_step IN SELECT * FROM jsonb_array_elements(v_steps_def)
  LOOP
    INSERT INTO public.workflow_config (tenant_id, workflow_id, step_name, status_key, "order", is_active)
    VALUES (v_tenant_id, v_workflow_id, v_step->>'step_name', v_step->>'status_key',
      (v_step->>'order')::int, true);
  END LOOP;

  -- Field dictionary básico (subset)
  INSERT INTO public.field_dictionary (tenant_id, field_name, field_label, sap_field, sap_view, field_type, responsible_role, is_required, display_order)
  VALUES
    (v_tenant_id, 'descricao_basica', 'Descrição Básica', 'MAKTX', 'dados_basicos', 'text', 'CADASTRO', true, 1),
    (v_tenant_id, 'grupo_mercadorias', 'Grupo de Mercadorias', 'MATKL', 'dados_basicos', 'select', 'CADASTRO', true, 2),
    (v_tenant_id, 'unidade_medida_base', 'Unidade de Medida Base', 'MEINS', 'dados_basicos', 'select', 'CADASTRO', true, 3),
    (v_tenant_id, 'ncm', 'NCM', 'J_1BNCM', 'fiscal', 'text', 'FISCAL', true, 1),
    (v_tenant_id, 'tipo_mrp', 'Tipo MRP', 'DISMM', 'mrp', 'select', 'MRP', true, 1);

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'tenant_name', trim(p_tenant_name),
    'admin_email', lower(trim(p_admin_email)),
    'message', 'Tenant criado. Crie o usuário admin via Supabase Auth Admin API e insira em public.users com role_id = ' || v_role_admin_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
