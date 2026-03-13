-- Seed Data — MDM PRO-MAT
-- Baseado em api/seed_data.py e api/constants.py
-- Executado após migrations (supabase db reset)
-- Idempotente: pode ser executado múltiplas vezes

-- ─── 1. Master Tenant ────────────────────────────────────────────────────────
INSERT INTO public.tenants (id, name, slug, is_active, max_description_length)
VALUES (1, 'Master Data Sistemas', 'master', true, 40)
ON CONFLICT (id) DO NOTHING;

-- Garantir que id 1 exista (reset de sequence se necessário)
SELECT setval('tenants_id_seq', GREATEST(1, (SELECT max(id) FROM public.tenants)));

-- ─── 2. Roles padrão para Master tenant ───────────────────────────────────────
INSERT INTO public.roles (tenant_id, name, role_type, permissions) VALUES
(1, 'ADMIN', 'sistema', '{"can_submit_request":true,"can_approve":true,"can_reject":true,"can_edit_pdm":true,"can_view_pdm":true,"can_view_logs":true,"can_bulk_import":true,"can_standardize":true,"can_manage_roles":true,"can_manage_users":true,"can_manage_fields":true,"can_manage_value_dictionary":true,"can_view_database":true,"can_edit_workflows":true,"can_view_workflows":true}'::jsonb),
(1, 'SOLICITANTE', 'operacional', '{"can_submit_request":true,"can_approve":false,"can_reject":false,"can_edit_pdm":false,"can_view_pdm":true,"can_view_logs":false,"can_bulk_import":false,"can_standardize":false,"can_manage_roles":false,"can_manage_users":false,"can_manage_fields":false,"can_manage_value_dictionary":false,"can_view_database":true,"can_edit_workflows":false,"can_view_workflows":true}'::jsonb),
(1, 'CADASTRO', 'operacional', '{"can_submit_request":true,"can_approve":true,"can_reject":true,"can_edit_pdm":true,"can_view_pdm":true,"can_view_logs":false,"can_bulk_import":true,"can_standardize":true,"can_manage_roles":false,"can_manage_users":false,"can_manage_fields":true,"can_manage_value_dictionary":false,"can_view_database":true,"can_edit_workflows":false,"can_view_workflows":true}'::jsonb),
(1, 'COMPRAS', 'operacional', '{"can_submit_request":false,"can_approve":true,"can_reject":true,"can_edit_pdm":false,"can_view_pdm":true,"can_view_logs":false,"can_bulk_import":false,"can_standardize":false,"can_manage_roles":false,"can_manage_users":false,"can_manage_fields":false,"can_manage_value_dictionary":false,"can_view_database":true,"can_edit_workflows":false,"can_view_workflows":true}'::jsonb),
(1, 'MRP', 'operacional', '{"can_submit_request":false,"can_approve":true,"can_reject":true,"can_edit_pdm":false,"can_view_pdm":true,"can_view_logs":false,"can_bulk_import":false,"can_standardize":false,"can_manage_roles":false,"can_manage_users":false,"can_manage_fields":false,"can_manage_value_dictionary":false,"can_view_database":true,"can_edit_workflows":false,"can_view_workflows":true}'::jsonb),
(1, 'FISCAL', 'operacional', '{"can_submit_request":false,"can_approve":true,"can_reject":true,"can_edit_pdm":false,"can_view_pdm":true,"can_view_logs":false,"can_bulk_import":false,"can_standardize":false,"can_manage_roles":false,"can_manage_users":false,"can_manage_fields":false,"can_manage_value_dictionary":false,"can_view_database":true,"can_edit_workflows":false,"can_view_workflows":true}'::jsonb),
(1, 'CONTABILIDADE', 'operacional', '{"can_submit_request":false,"can_approve":true,"can_reject":true,"can_edit_pdm":false,"can_view_pdm":true,"can_view_logs":false,"can_bulk_import":false,"can_standardize":false,"can_manage_roles":false,"can_manage_users":false,"can_manage_fields":false,"can_manage_value_dictionary":false,"can_view_database":true,"can_edit_workflows":false,"can_view_workflows":true}'::jsonb),
(1, 'MASTER', 'sistema', '{"can_submit_request":true,"can_approve":true,"can_reject":true,"can_edit_pdm":true,"can_view_pdm":true,"can_view_logs":true,"can_bulk_import":true,"can_standardize":true,"can_manage_roles":true,"can_manage_users":true,"can_manage_fields":true,"can_manage_value_dictionary":true,"can_view_database":true,"can_edit_workflows":true,"can_view_workflows":true}'::jsonb)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Nota: ON CONFLICT (tenant_id, name) requer a constraint uq_roles_tenant_name que já existe

-- ─── 3. Master User ───────────────────────────────────────────────────────────
-- IMPORTANTE: O usuário master NÃO é criado via SQL.
-- Deve ser criado via:
--   1. Supabase Dashboard → Authentication → Users → Add user (com email e senha)
--   2. Ou via Auth Admin API: supabase.auth.admin.createUser({ email, password })
--   3. Em seguida, inserir o perfil em public.users:
--      INSERT INTO public.users (id, tenant_id, name, role_id)
--      SELECT u.id, 1, 'Master Admin',
--             (SELECT id FROM public.roles WHERE tenant_id=1 AND name='MASTER')
--      FROM auth.users u WHERE u.email = 'master@masterdata.com';
--   4. Marcar como master no app_metadata: auth.users.raw_app_meta_data → { "is_master": true }

-- ─── 4. Unidades de medida (global) ───────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM public.measurement_units) = 0 THEN
    INSERT INTO public.measurement_units (name, abbreviation, category) VALUES
('Milímetro', 'MM', 'Comprimento'),
('Centímetro', 'CM', 'Comprimento'),
('Metro', 'M', 'Comprimento'),
('Quilômetro', 'KM', 'Comprimento'),
('Polegada', 'POL', 'Comprimento'),
('Grama', 'G', 'Massa'),
('Quilograma', 'KG', 'Massa'),
('Tonelada', 'T', 'Massa'),
('Mililitro', 'ML', 'Volume'),
('Litro', 'L', 'Volume'),
('Metro Cúbico', 'M3', 'Volume'),
('Pascal', 'PA', 'Pressão'),
('Bar', 'BAR', 'Pressão'),
('PSI', 'PSI', 'Pressão'),
('Grau Celsius', 'C', 'Temperatura'),
('Ampere', 'A', 'Elétrico'),
('Volt', 'V', 'Elétrico'),
('Watt', 'W', 'Elétrico'),
('RPM', 'RPM', 'Rotação'),
('Hertz', 'HZ', 'Frequência'),
('Newton', 'N', 'Força'),
('Newton Metro', 'NM', 'Torque'),
('Percentual', '%', 'Geral'),
('Unidade', 'UN', 'Geral');
  END IF;
END $$;

-- ─── 5. Workflow padrão Master tenant ─────────────────────────────────────────
INSERT INTO public.workflow_header (tenant_id, name, description, is_active)
SELECT 1, 'Fluxo Padrão de Cadastro',
       'Fluxo padrão: Central de Cadastro → Compras → MRP → Fiscal → Contabilidade → Finalizado',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.workflow_header WHERE tenant_id = 1);

INSERT INTO public.workflow_config (tenant_id, workflow_id, step_name, status_key, "order", is_active)
SELECT 1, (SELECT id FROM public.workflow_header WHERE tenant_id = 1 LIMIT 1),
       v.step_name, v.status_key, v.ord, true
FROM (VALUES
  ('Central de Cadastro', 'cadastro', 1),
  ('Compras', 'compras', 2),
  ('MRP', 'mrp', 3),
  ('Fiscal', 'fiscal', 4),
  ('Contabilidade', 'contabilidade', 5),
  ('Finalizado', 'finalizado', 6)
) AS v(step_name, status_key, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.workflow_config WHERE tenant_id = 1);

-- ─── 6. Field Dictionary (campos ERP) para Master tenant ──────────────────────
INSERT INTO public.field_dictionary (tenant_id, field_name, field_label, sap_field, sap_view, field_type, options, responsible_role, is_required, display_order)
SELECT 1, f.field_name, f.field_label, f.sap_field, f.sap_view, f.field_type, f.options::jsonb, f.responsible_role, f.is_required, f.display_order
FROM (VALUES
  ('descricao_basica', 'Descrição Básica', 'MAKTX', 'dados_basicos', 'text', NULL::text, 'CADASTRO', true, 1),
  ('grupo_mercadorias', 'Grupo de Mercadorias', 'MATKL', 'dados_basicos', 'select', '["001 - Matéria-prima","002 - Semimanufaturado","003 - Produto acabado","004 - Mercadoria para revenda"]', 'CADASTRO', true, 2),
  ('unidade_medida_base', 'Unidade de Medida Base', 'MEINS', 'dados_basicos', 'select', '["UN","KG","L","M","M2","M3","PC","CX"]', 'CADASTRO', true, 3),
  ('tipo_material', 'Tipo de Material', 'MTART', 'dados_basicos', 'select', '["FERT - Produto acabado","HALB - Semimanufaturado","ROH - Matéria-prima","HAWA - Mercadoria para revenda"]', 'CADASTRO', true, 4),
  ('peso_bruto', 'Peso Bruto (kg)', 'BRGEW', 'dados_basicos', 'number', NULL::text, 'CADASTRO', false, 5),
  ('peso_liquido', 'Peso Líquido (kg)', 'NTGEW', 'dados_basicos', 'number', NULL::text, 'CADASTRO', false, 6),
  ('ncm', 'NCM', 'J_1BNCM', 'fiscal', 'text', NULL::text, 'FISCAL', true, 1),
  ('cfop', 'CFOP', NULL, 'fiscal', 'select', '["5101 - Venda de mercadoria","5102 - Venda de mercadoria","6101 - Compra para industrialização","6102 - Compra para revenda"]', 'FISCAL', true, 2),
  ('origem_material', 'Origem do Material', 'J_1BORIGM', 'fiscal', 'select', '["0 - Nacional","1 - Importado Direto","2 - Importado Adquirido no Mercado Interno"]', 'FISCAL', true, 3),
  ('grupo_compras', 'Grupo de Compras', 'EKGRP', 'compras', 'select', '["001 - Compras Nacionais","002 - Importação","003 - Serviços"]', 'MRP', true, 1),
  ('tipo_mrp', 'Tipo MRP', 'DISMM', 'mrp', 'select', '["PD - MRP","VB - Consumo direto","ND - Sem planejamento"]', 'MRP', true, 1),
  ('conta_estoque', 'Conta de Estoque', NULL, 'contabilidade', 'text', NULL::text, 'CONTABILIDADE', true, 1),
  ('grupo_valoracao', 'Grupo de Valoração', 'BKLAS', 'contabilidade', 'select', '["3000 - Matéria-prima","7900 - Produto acabado","7920 - Mercadoria para revenda"]', 'CONTABILIDADE', true, 3),
  ('controle_preco', 'Controle de Preço', 'VPRSV', 'contabilidade', 'select', '["S - Preço padrão","V - Custo médio móvel","D - Preço de mercado"]', 'CONTABILIDADE', true, 4)
) AS f(field_name, field_label, sap_field, sap_view, field_type, options, responsible_role, is_required, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.field_dictionary WHERE tenant_id = 1 LIMIT 1);

-- ─── 7. PDM Template: Rolamento Industrial ────────────────────────────────────
INSERT INTO public.pdm_templates (tenant_id, name, internal_code, is_active, attributes)
SELECT 1, 'Rolamento Industrial', 'PDM-ROL-001', true,
'[
  {"id":"tipo","order":1,"name":"Tipo de Rolamento","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"ESFERAS","abbreviation":""},{"value":"ROLOS CÔNICOS","abbreviation":""},{"value":"ROLOS CILÍNDRICOS","abbreviation":""},{"value":"AGULHAS","abbreviation":""},{"value":"AUTOCOMPENSADOR","abbreviation":""}]},
  {"id":"modelo","order":2,"name":"Modelo / Referência","dataType":"text","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[]},
  {"id":"vedacao","order":3,"name":"Vedação","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"ABERTO","abbreviation":""},{"value":"ZZ","abbreviation":""},{"value":"2RS","abbreviation":""},{"value":"VEDADO","abbreviation":""}]},
  {"id":"diametro","order":4,"name":"Diâmetro Externo","dataType":"text","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[]}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.pdm_templates WHERE tenant_id = 1 AND internal_code = 'PDM-ROL-001');
