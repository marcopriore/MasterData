-- Migration 009: Renomear colunas sap_* para erp_* na tabela field_dictionary

ALTER TABLE public.field_dictionary RENAME COLUMN sap_field TO erp_field;
ALTER TABLE public.field_dictionary RENAME COLUMN sap_view TO erp_view;

-- Atualizar create_tenant_onboarding para usar erp_field, erp_view
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
  INSERT INTO public.field_dictionary (tenant_id, field_name, field_label, erp_field, erp_view, field_type, responsible_role, is_required, display_order)
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
