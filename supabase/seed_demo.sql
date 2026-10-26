-- Seed Demo — Empresa Demo
-- Executar no SQL Editor do Supabase Dashboard após rodar create-demo-users.js
--
-- ORDEM DE EXECUÇÃO:
-- 1) cd web && npm run create-demo-users
-- 2) Supabase Dashboard → SQL Editor → colar e executar este arquivo
--
-- Usa subqueries para obter UUIDs: (SELECT id FROM auth.users WHERE email = '...')

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. TENANT (criado pelo script JS; aqui só para idempotência se rodar só o SQL)
-- O script create-demo-users.js cria o tenant. Se executar apenas este SQL,
-- o tenant precisa existir. Caso contrário, descomente e execute primeiro:

/*
INSERT INTO public.tenants (name, slug, is_active, max_description_length)
VALUES ('Empresa Demo', 'empresa-demo', true, 40)
ON CONFLICT (slug) DO NOTHING;
*/

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ROLES (criados pelo script JS)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. WORKFLOW (criado pelo script JS)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. PDMs (5 templates variados)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.pdm_templates (tenant_id, name, internal_code, is_active, attributes)
SELECT t.id, 'Rolamento', 'ROLA001', true,
'[
  {"id":"tipo_rolamento","order":1,"name":"Tipo de Rolamento","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"Esfera","abbreviation":""},{"value":"Agulha","abbreviation":""},{"value":"Conico","abbreviation":""},{"value":"Cilindrico","abbreviation":""}]},
  {"id":"diametro_interno","order":2,"name":"Diametro Interno (mm)","dataType":"numeric","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[]},
  {"id":"diametro_externo","order":3,"name":"Diametro Externo (mm)","dataType":"numeric","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[]},
  {"id":"largura","order":4,"name":"Largura (mm)","dataType":"numeric","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[]},
  {"id":"material","order":5,"name":"Material","dataType":"text","isRequired":false,"includeInDescription":true,"abbreviation":"","allowedValues":[]}
]'::jsonb
FROM public.tenants t WHERE t.slug = 'empresa-demo'
ON CONFLICT ON CONSTRAINT uq_pdm_templates_tenant_internal_code DO NOTHING;

INSERT INTO public.pdm_templates (tenant_id, name, internal_code, is_active, attributes)
SELECT t.id, 'Parafuso', 'PARA001', true,
'[
  {"id":"tipo_cabeca","order":1,"name":"Tipo de Cabeca","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"Sextavado","abbreviation":""},{"value":"Phillips","abbreviation":""},{"value":"Allen","abbreviation":""},{"value":"Torx","abbreviation":""}]},
  {"id":"diametro","order":2,"name":"Diametro","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"M4","abbreviation":""},{"value":"M5","abbreviation":""},{"value":"M6","abbreviation":""},{"value":"M8","abbreviation":""},{"value":"M10","abbreviation":""},{"value":"M12","abbreviation":""}]},
  {"id":"comprimento","order":3,"name":"Comprimento (mm)","dataType":"numeric","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[]},
  {"id":"material","order":4,"name":"Material","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"Aco Carbono","abbreviation":""},{"value":"Inox 304","abbreviation":""},{"value":"Inox 316","abbreviation":""},{"value":"Latao","abbreviation":""}]},
  {"id":"acabamento","order":5,"name":"Acabamento","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"Zincado","abbreviation":""},{"value":"Galvanizado","abbreviation":""},{"value":"Passivado","abbreviation":""},{"value":"Natural","abbreviation":""}]}
]'::jsonb
FROM public.tenants t WHERE t.slug = 'empresa-demo'
ON CONFLICT ON CONSTRAINT uq_pdm_templates_tenant_internal_code DO NOTHING;

INSERT INTO public.pdm_templates (tenant_id, name, internal_code, is_active, attributes)
SELECT t.id, 'Motor Eletrico', 'MOTO001', true,
'[
  {"id":"potencia","order":1,"name":"Potencia (CV)","dataType":"numeric","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[]},
  {"id":"rotacao","order":2,"name":"Rotacao","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"3600 RPM","abbreviation":""},{"value":"1800 RPM","abbreviation":""},{"value":"1200 RPM","abbreviation":""},{"value":"900 RPM","abbreviation":""}]},
  {"id":"tensao","order":3,"name":"Tensao","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"220V","abbreviation":""},{"value":"380V","abbreviation":""},{"value":"440V","abbreviation":""}]},
  {"id":"frequencia","order":4,"name":"Frequencia","dataType":"lov","isRequired":false,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"50Hz","abbreviation":""},{"value":"60Hz","abbreviation":""}]},
  {"id":"carcaca","order":5,"name":"Carcaca","dataType":"text","isRequired":false,"includeInDescription":false,"abbreviation":"","allowedValues":[]},
  {"id":"ip","order":6,"name":"IP","dataType":"lov","isRequired":false,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"IP21","abbreviation":""},{"value":"IP55","abbreviation":""},{"value":"IP56","abbreviation":""},{"value":"IP65","abbreviation":""}]}
]'::jsonb
FROM public.tenants t WHERE t.slug = 'empresa-demo'
ON CONFLICT ON CONSTRAINT uq_pdm_templates_tenant_internal_code DO NOTHING;

INSERT INTO public.pdm_templates (tenant_id, name, internal_code, is_active, attributes)
SELECT t.id, 'Valvula', 'VALV001', true,
'[
  {"id":"tipo","order":1,"name":"Tipo","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"Gaveta","abbreviation":""},{"value":"Globo","abbreviation":""},{"value":"Esfera","abbreviation":""},{"value":"Borboleta","abbreviation":""},{"value":"Agulha","abbreviation":""}]},
  {"id":"diametro","order":2,"name":"Diametro","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"1/2\"","abbreviation":""},{"value":"3/4\"","abbreviation":""},{"value":"1\"","abbreviation":""},{"value":"1.1/2\"","abbreviation":""},{"value":"2\"","abbreviation":""},{"value":"3\"","abbreviation":""},{"value":"4\"","abbreviation":""}]},
  {"id":"pressao","order":3,"name":"Pressao","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"150#","abbreviation":""},{"value":"300#","abbreviation":""},{"value":"600#","abbreviation":""}]},
  {"id":"material_corpo","order":4,"name":"Material Corpo","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"Aco Carbono","abbreviation":""},{"value":"Inox","abbreviation":""},{"value":"Bronze","abbreviation":""}]},
  {"id":"conexao","order":5,"name":"Conexao","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"Flangeada","abbreviation":""},{"value":"Rosqueada","abbreviation":""},{"value":"Soldada","abbreviation":""}]}
]'::jsonb
FROM public.tenants t WHERE t.slug = 'empresa-demo'
ON CONFLICT ON CONSTRAINT uq_pdm_templates_tenant_internal_code DO NOTHING;

INSERT INTO public.pdm_templates (tenant_id, name, internal_code, is_active, attributes)
SELECT t.id, 'Correia', 'CORR001', true,
'[
  {"id":"tipo","order":1,"name":"Tipo","dataType":"lov","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[{"value":"V","abbreviation":""},{"value":"Sincronizadora","abbreviation":""},{"value":"Plana","abbreviation":""},{"value":"Dentada","abbreviation":""}]},
  {"id":"perfil","order":2,"name":"Perfil","dataType":"text","isRequired":false,"includeInDescription":true,"abbreviation":"","allowedValues":[]},
  {"id":"comprimento","order":3,"name":"Comprimento (mm)","dataType":"numeric","isRequired":true,"includeInDescription":true,"abbreviation":"","allowedValues":[]},
  {"id":"largura","order":4,"name":"Largura (mm)","dataType":"numeric","isRequired":false,"includeInDescription":true,"abbreviation":"","allowedValues":[]}
]'::jsonb
FROM public.tenants t WHERE t.slug = 'empresa-demo'
ON CONFLICT ON CONSTRAINT uq_pdm_templates_tenant_internal_code DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. VALUE DICTIONARY (LOVs dos PDMs)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.value_dictionary (tenant_id, value)
SELECT t.id, v.val
FROM public.tenants t
CROSS JOIN (VALUES
  ('Esfera'), ('Agulha'), ('Conico'), ('Cilindrico'),
  ('Sextavado'), ('Phillips'), ('Allen'), ('Torx'),
  ('M4'), ('M5'), ('M6'), ('M8'), ('M10'), ('M12'),
  ('Aco Carbono'), ('Inox 304'), ('Inox 316'), ('Latao'),
  ('Zincado'), ('Galvanizado'), ('Passivado'), ('Natural'),
  ('3600 RPM'), ('1800 RPM'), ('1200 RPM'), ('900 RPM'),
  ('220V'), ('380V'), ('440V'), ('50Hz'), ('60Hz'),
  ('IP21'), ('IP55'), ('IP56'), ('IP65'),
  ('Gaveta'), ('Globo'), ('Borboleta'),
  ('1/2"'), ('3/4"'), ('1"'), ('1.1/2"'), ('2"'), ('3"'), ('4"'),
  ('150#'), ('300#'), ('600#'), ('Inox'), ('Bronze'),
  ('Flangeada'), ('Rosqueada'), ('Soldada'),
  ('V'), ('Sincronizadora'), ('Plana'), ('Dentada')
) AS v(val)
WHERE t.slug = 'empresa-demo'
ON CONFLICT ON CONSTRAINT uq_value_dict_tenant_value DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. MATERIAL REQUESTS (10 solicitações em diferentes fases)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tenant_id INT;
  v_workflow_id INT;
  v_pdm_rol INT; v_pdm_par INT; v_pdm_mot INT; v_pdm_val INT; v_pdm_cor INT;
  v_lucia UUID; v_joao UUID; v_maria UUID; v_pedro UUID; v_ana UUID; v_carlos UUID;
  v_req1 INT; v_req2 INT; v_req3 INT; v_req7 INT; v_req8 INT; v_req9 INT;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants WHERE slug = 'empresa-demo';
  SELECT id INTO v_workflow_id FROM public.workflow_header WHERE tenant_id = v_tenant_id LIMIT 1;
  SELECT id INTO v_pdm_rol FROM public.pdm_templates WHERE tenant_id = v_tenant_id AND internal_code = 'ROLA001';
  SELECT id INTO v_pdm_par FROM public.pdm_templates WHERE tenant_id = v_tenant_id AND internal_code = 'PARA001';
  SELECT id INTO v_pdm_mot FROM public.pdm_templates WHERE tenant_id = v_tenant_id AND internal_code = 'MOTO001';
  SELECT id INTO v_pdm_val FROM public.pdm_templates WHERE tenant_id = v_tenant_id AND internal_code = 'VALV001';
  SELECT id INTO v_pdm_cor FROM public.pdm_templates WHERE tenant_id = v_tenant_id AND internal_code = 'CORR001';
  SELECT u.id INTO v_lucia FROM public.users u JOIN auth.users au ON u.id = au.id WHERE au.email = 'lucia.solicitante@empresademo.com';
  SELECT u.id INTO v_joao FROM public.users u JOIN auth.users au ON u.id = au.id WHERE au.email = 'joao.cadastro@empresademo.com';
  SELECT u.id INTO v_maria FROM public.users u JOIN auth.users au ON u.id = au.id WHERE au.email = 'maria.compras@empresademo.com';
  SELECT u.id INTO v_pedro FROM public.users u JOIN auth.users au ON u.id = au.id WHERE au.email = 'pedro.mrp@empresademo.com';
  SELECT u.id INTO v_ana FROM public.users u JOIN auth.users au ON u.id = au.id WHERE au.email = 'ana.fiscal@empresademo.com';
  SELECT u.id INTO v_carlos FROM public.users u JOIN auth.users au ON u.id = au.id WHERE au.email = 'carlos.contab@empresademo.com';

  IF v_tenant_id IS NULL OR v_workflow_id IS NULL OR v_lucia IS NULL THEN
    RAISE NOTICE 'Tenant, workflow ou usuarios nao encontrados. Execute create-demo-users.js primeiro.';
    RETURN;
  END IF;

  INSERT INTO public.material_requests (id_sistema, tenant_id, pdm_id, workflow_id, status, user_id, requester, urgency, generated_description, technical_attributes, assigned_to_id)
  VALUES
    ('MDM-000001', v_tenant_id, v_pdm_rol, v_workflow_id, 'cadastro', v_lucia, 'Lucia Solicitante', 'high', 'ROLAMENTO ESFERA 25 52 15 ACO', '{"tipo_rolamento":"Esfera","diametro_interno":25,"diametro_externo":52,"largura":15,"material":"Aco"}'::jsonb, v_joao),
    ('MDM-000002', v_tenant_id, v_pdm_par, v_workflow_id, 'cadastro', v_lucia, 'Lucia Solicitante', 'low', 'PARAFUSO ALLEN M6 X 20 INOX 304 PASSIVADO', '{"tipo_cabeca":"Allen","diametro":"M6","comprimento":20,"material":"Inox 304","acabamento":"Passivado"}'::jsonb, NULL),
    ('MDM-000003', v_tenant_id, v_pdm_mot, v_workflow_id, 'compras', v_lucia, 'Lucia Solicitante', 'medium', 'MOTOR ELETRICO 5CV 1800RPM 380V 60HZ', '{"potencia":5,"rotacao":"1800 RPM","tensao":"380V","frequencia":"60Hz"}'::jsonb, v_maria),
    ('MDM-000004', v_tenant_id, v_pdm_val, v_workflow_id, 'mrp', v_lucia, 'Lucia Solicitante', 'high', 'VALVULA ESFERA 2" 300# INOX FLANGEADA', '{"tipo":"Esfera","diametro":"2\"","pressao":"300#","material_corpo":"Inox","conexao":"Flangeada"}'::jsonb, v_pedro),
    ('MDM-000005', v_tenant_id, v_pdm_cor, v_workflow_id, 'fiscal', v_lucia, 'Lucia Solicitante', 'medium', 'CORREIA DENTADA 1250MM LARGURA 25MM', '{"tipo":"Dentada","perfil":"XL","comprimento":1250,"largura":25}'::jsonb, v_ana),
    ('MDM-000006', v_tenant_id, v_pdm_rol, v_workflow_id, 'contabilidade', v_lucia, 'Lucia Solicitante', 'low', 'ROLAMENTO CONICO 30 62 18', '{"tipo_rolamento":"Conico","diametro_interno":30,"diametro_externo":62,"largura":18}'::jsonb, v_carlos),
    ('MDM-000007', v_tenant_id, v_pdm_par, v_workflow_id, 'finalizado', v_lucia, 'Lucia Solicitante', 'high', 'PARAFUSO SEXTAVADO M8 X 50 ACO CARBONO ZINCADO', '{"tipo_cabeca":"Sextavado","diametro":"M8","comprimento":50,"material":"Aco Carbono","acabamento":"Zincado"}'::jsonb, NULL),
    ('MDM-000008', v_tenant_id, v_pdm_mot, v_workflow_id, 'finalizado', v_lucia, 'Lucia Solicitante', 'medium', 'MOTOR ELETRICO 5CV 1800RPM 380V 60HZ', '{"potencia":5,"rotacao":"1800 RPM","tensao":"380V","frequencia":"60Hz"}'::jsonb, NULL),
    ('MDM-000009', v_tenant_id, v_pdm_val, v_workflow_id, 'rejected', v_lucia, 'Lucia Solicitante', 'low', 'VALVULA GAVETA 3" 150# ACO CARBONO ROSQUEADA', '{"tipo":"Gaveta","diametro":"3\"","pressao":"150#","material_corpo":"Aco Carbono","conexao":"Rosqueada"}'::jsonb, NULL),
    ('MDM-000010', v_tenant_id, v_pdm_cor, v_workflow_id, 'cadastro', v_lucia, 'Lucia Solicitante', 'high', 'CORREIA V 850MM', '{"tipo":"V","comprimento":850}'::jsonb, NULL)
  ON CONFLICT (id_sistema) DO NOTHING;

  -- 7. REQUEST HISTORY (progressão das solicitações)
  SELECT id INTO v_req1 FROM material_requests WHERE id_sistema = 'MDM-000001' AND tenant_id = v_tenant_id;
  SELECT id INTO v_req3 FROM material_requests WHERE id_sistema = 'MDM-000003' AND tenant_id = v_tenant_id;
  SELECT id INTO v_req7 FROM material_requests WHERE id_sistema = 'MDM-000007' AND tenant_id = v_tenant_id;
  SELECT id INTO v_req8 FROM material_requests WHERE id_sistema = 'MDM-000008' AND tenant_id = v_tenant_id;
  SELECT id INTO v_req9 FROM material_requests WHERE id_sistema = 'MDM-000009' AND tenant_id = v_tenant_id;

  IF v_req7 IS NOT NULL THEN
    INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage) VALUES
    (v_tenant_id, v_req7, v_joao, 'stage_change', 'Solicitacao criada', 'cadastro'),
    (v_tenant_id, v_req7, v_joao, 'stage_change', 'Aprovado e encaminhado para Compras', 'compras'),
    (v_tenant_id, v_req7, v_maria, 'stage_change', 'Aprovado e encaminhado para MRP', 'mrp'),
    (v_tenant_id, v_req7, v_pedro, 'stage_change', 'Aprovado e encaminhado para Fiscal', 'fiscal'),
    (v_tenant_id, v_req7, v_ana, 'stage_change', 'Aprovado e encaminhado para Contabilidade', 'contabilidade'),
    (v_tenant_id, v_req7, v_carlos, 'stage_change', 'Solicitacao finalizada', 'finalizado');
  END IF;

  IF v_req3 IS NOT NULL THEN
    INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage) VALUES
    (v_tenant_id, v_req3, v_joao, 'stage_change', 'Solicitacao criada', 'cadastro'),
    (v_tenant_id, v_req3, v_joao, 'stage_change', 'Aprovado e encaminhado para Compras', 'compras');
  END IF;

  IF v_req9 IS NOT NULL THEN
    INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage) VALUES
    (v_tenant_id, v_req9, v_joao, 'stage_change', 'Solicitacao criada', 'cadastro'),
    (v_tenant_id, v_req9, NULL, 'rejected', 'Solicitacao rejeitada por duplicidade', 'rejected');
  END IF;

  -- 8. MATERIAL DATABASE (para #7 e #8 finalizados)
  IF v_req7 IS NOT NULL AND v_req8 IS NOT NULL THEN
    INSERT INTO public.material_database (id_sistema, tenant_id, description, status, pdm_code, pdm_name, erp_status, source)
    VALUES
      ('MDM-000007', v_tenant_id, 'PARAFUSO SEXTAVADO M8 X 50 ACO CARBONO ZINCADO', 'finalizado', 'PARA001', 'Parafuso', 'pendente_erp', 'manual'),
      ('MDM-000008', v_tenant_id, 'MOTOR ELETRICO 5CV 1800RPM 380V 60HZ', 'finalizado', 'MOTO001', 'Motor Eletrico', 'integrado_erp', 'manual')
    ON CONFLICT (id_sistema) DO NOTHING;
  END IF;

  -- 9. NOTIFICAÇÕES (10 variadas)
  IF v_req1 IS NOT NULL THEN
    INSERT INTO public.notifications (tenant_id, user_id, request_id, event_type, title, message, is_read) VALUES
    (v_tenant_id, v_joao, v_req1, 'request_created', 'Nova solicitacao MDM-000001', 'Solicitacao MDM-000001 criada por Lucia Solicitante', false),
    (v_tenant_id, v_maria, v_req3, 'stage_change', 'Solicitacao MDM-000003 avancou', 'Solicitacao MDM-000003 avancou para Compras', false),
    (v_tenant_id, (SELECT u.id FROM users u JOIN auth.users au ON u.id=au.id WHERE au.email='admin@empresademo.com'), v_req7, 'request_completed', 'Solicitacao MDM-000007 finalizada', 'Solicitacao MDM-000007 foi finalizada com sucesso', false),
    (v_tenant_id, v_lucia, v_req1, 'request_created', 'Sua solicitacao MDM-000001 foi criada', 'Solicitacao MDM-000001 registrada com sucesso', true),
    (v_tenant_id, v_pedro, v_req3, 'request_assigned', 'Solicitacao MDM-000003 atribuida', 'Solicitacao MDM-000003 atribuida a Maria Compras', false),
    (v_tenant_id, v_ana, v_req7, 'request_completed', 'Solicitacao MDM-000007 finalizada', 'Parafuso Sextavado M8 x 50 foi cadastrado', false),
    (v_tenant_id, v_carlos, v_req8, 'request_completed', 'Solicitacao MDM-000008 finalizada', 'Motor 5CV 1800RPM integrado ao ERP', false),
    (v_tenant_id, v_lucia, v_req9, 'request_rejected', 'Solicitacao MDM-000009 rejeitada', 'Solicitacao MDM-000009 foi rejeitada', true),
    (v_tenant_id, v_joao, v_req1, 'request_assigned', 'Solicitacao MDM-000001 atribuida a voce', 'Atenda a solicitacao MDM-000001', false),
    (v_tenant_id, (SELECT u.id FROM users u JOIN auth.users au ON u.id=au.id WHERE au.email='admin@empresademo.com'), v_req8, 'request_completed', 'Material MDM-000008 integrado', 'Motor Eletrico 5CV integrado ao ERP', false);
  END IF;

  -- 10. SYSTEM LOGS (20 entradas de auditoria)
  INSERT INTO public.system_logs (tenant_id, user_id, category, action, description) VALUES
  (v_tenant_id, v_lucia, 'request', 'create', 'Criou solicitacao MDM-000001'),
  (v_tenant_id, v_lucia, 'request', 'create', 'Criou solicitacao MDM-000002'),
  (v_tenant_id, v_joao, 'request', 'approve', 'Aprovou e avancou MDM-000003 de cadastro para compras'),
  (v_tenant_id, v_maria, 'request', 'approve', 'Aprovou e avancou MDM-000003 de compras para mrp'),
  (v_tenant_id, v_joao, 'request', 'reject', 'Rejeitou solicitacao MDM-000009'),
  (v_tenant_id, v_joao, 'pdm', 'create', 'Criou PDM Rolamento'),
  (v_tenant_id, v_joao, 'pdm', 'create', 'Criou PDM Parafuso'),
  (v_tenant_id, v_maria, 'request', 'assign', 'Atribuiu MDM-000001 a Joao Cadastro'),
  (v_tenant_id, v_pedro, 'request', 'approve', 'Aprovou MDM-000004 em MRP'),
  (v_tenant_id, v_ana, 'request', 'approve', 'Aprovou MDM-000005 em Fiscal'),
  (v_tenant_id, v_carlos, 'request', 'approve', 'Aprovou MDM-000006 em Contabilidade'),
  (v_tenant_id, v_carlos, 'request', 'complete', 'Finalizou solicitacao MDM-000007'),
  (v_tenant_id, v_carlos, 'request', 'complete', 'Finalizou solicitacao MDM-000008'),
  (v_tenant_id, v_lucia, 'request', 'create', 'Criou solicitacao MDM-000010'),
  (v_tenant_id, v_joao, 'request', 'edit', 'Editou atributos da solicitacao MDM-000001'),
  (v_tenant_id, (SELECT u.id FROM users u JOIN auth.users au ON u.id=au.id WHERE au.email='admin@empresademo.com'), 'tenant', 'view', 'Visualizou dashboard Empresa Demo'),
  (v_tenant_id, v_maria, 'request', 'assign', 'Assumiu atendimento MDM-000003'),
  (v_tenant_id, v_pedro, 'request', 'assign', 'Assumiu atendimento MDM-000004'),
  (v_tenant_id, v_ana, 'database', 'standardize', 'Padronizou material MDM-000008'),
  (v_tenant_id, v_carlos, 'database', 'export', 'Exportou lista de materiais');
END $$;
