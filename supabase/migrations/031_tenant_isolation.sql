-- Migration 031: isolamento por tenant em todo o banco
-- 1. Funções: ninguém sem login executa função do schema public (antes o anon conseguia
--    rejeitar/aprovar solicitação pela chave pública).
-- 2. Ações por id de solicitação (assign, advance, reject, move, resubmit) conferem o tenant em uso.
--    advance_workflow e reject_request não conferiam nada.
-- 3. Policies: o Master fica no tenant em uso (app_metadata.tenant_id, o mesmo de get_user_tenant_id()).
--    A visão de todos os tenants fica só na lista de tenants e em tenant_overview().
-- 4. Histórico só se insere em solicitação do próprio tenant, pelo próprio usuário, e não se altera.
--    Notificação e preferência são do próprio usuário. Perfil (users) só se grava pelo servidor.
--    Papéis (roles) só se gravam com can_manage_roles.
-- Pode rodar de novo.

-- ─── 0. Helpers ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_has_permission(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Mesma regra de mergeRolePermissions (web/lib/permissions.ts): grupos, ou o papel de etapa
  -- quando não há grupo, mais as permissões avulsas.
  SELECT public.is_master_user()
    OR EXISTS (
      SELECT 1
      FROM public.users u
      JOIN public.roles r
        ON r.id IN (SELECT g.role_id FROM public.user_role_groups g WHERE g.user_id = u.id)
        OR (r.id = u.role_id AND NOT EXISTS (SELECT 1 FROM public.user_role_groups g WHERE g.user_id = u.id))
      WHERE u.id = auth.uid()
        AND coalesce(u.is_active, true)
        AND (r.permissions ->> p_key) = 'true'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_permission_grants pg
      WHERE pg.user_id = auth.uid() AND pg.permission_key = p_key
    )
$$;

-- Totais por tenant para a tela de tenants do Master (antes lia users e material_database inteiros no navegador).
CREATE OR REPLACE FUNCTION public.tenant_overview()
RETURNS TABLE (tenant_id INTEGER, users_count BIGINT, materials_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master_user() THEN
    RAISE EXCEPTION 'Apenas usuário master' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT t.id,
    (SELECT count(*) FROM public.users u WHERE u.tenant_id = t.id),
    (SELECT count(*) FROM public.material_database m WHERE m.tenant_id = t.id)
  FROM public.tenants t;
END;
$$;

-- ─── 1. Ações por id de solicitação ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_request(p_request_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING errcode = '42501';
  END IF;

  SELECT tenant_id, assigned_to_id, coalesce(status, 'cadastro') AS status INTO v_row
  FROM public.material_requests
  WHERE id = p_request_id AND tenant_id = public.get_user_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
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
BEGIN
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

CREATE OR REPLACE FUNCTION public.reject_request(p_request_id INTEGER, p_reason TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING errcode = '42501';
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.material_requests
  WHERE id = p_request_id AND tenant_id = public.get_user_tenant_id();

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
  WHERE id = p_request_id AND tenant_id = public.get_user_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING errcode = '42501';
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

-- create_tenant_onboarding é chamada pelo servidor (service role, sem is_master no token),
-- depois de a rota /api/admin/onboarding conferir que quem pede é Master.
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef('public.create_tenant_onboarding(text,text,text,text,text)'::regprocedure) INTO v_def;
  IF position('service_role' IN v_def) = 0 THEN
    EXECUTE replace(
      v_def,
      'IF NOT public.is_master_user() THEN',
      'IF NOT public.is_master_user() AND auth.role() IS DISTINCT FROM ''service_role'' THEN'
    );
  END IF;
END;
$$;

-- ─── 2. Policies ─────────────────────────────────────────────────────────────
-- Tabelas de negócio: tudo do tenant em uso, leitura e escrita.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workflow_header', 'workflow_config', 'pdm_templates', 'material_requests',
    'material_database', 'value_dictionary', 'field_dictionary', 'system_logs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (tenant_id = (SELECT public.get_user_tenant_id())) WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()))',
      t || '_tenant_isolation', t
    );
  END LOOP;
END;
$$;

-- tenants: o próprio (ou o em uso) para todos; a lista inteira e a gravação só para o Master
DROP POLICY IF EXISTS "tenants_tenant_isolation" ON public.tenants;
DROP POLICY IF EXISTS "tenants_select" ON public.tenants;
DROP POLICY IF EXISTS "tenants_master_write" ON public.tenants;
CREATE POLICY "tenants_select" ON public.tenants FOR SELECT TO authenticated
  USING (id = (SELECT public.get_user_tenant_id()) OR (SELECT public.is_master_user()));
CREATE POLICY "tenants_master_write" ON public.tenants FOR ALL TO authenticated
  USING ((SELECT public.is_master_user())) WITH CHECK ((SELECT public.is_master_user()));

-- users: lê o tenant em uso e o próprio perfil (o do Master fica no tenant de origem).
-- Gravação só pelo servidor (service role): sem policy de escrita para authenticated.
DROP POLICY IF EXISTS "users_tenant_isolation" ON public.users;
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) OR id = (SELECT auth.uid()));

-- roles: lê o tenant em uso; grava só quem tem can_manage_roles
DROP POLICY IF EXISTS "roles_tenant_isolation" ON public.roles;
DROP POLICY IF EXISTS "roles_select" ON public.roles;
DROP POLICY IF EXISTS "roles_write" ON public.roles;
CREATE POLICY "roles_select" ON public.roles FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));
CREATE POLICY "roles_write" ON public.roles FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND (SELECT public.user_has_permission('can_manage_roles')))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND (SELECT public.user_has_permission('can_manage_roles')));

-- request_history: lê o tenant; insere só na solicitação do tenant e em nome próprio; não altera nem apaga
DROP POLICY IF EXISTS "request_history_tenant_isolation" ON public.request_history;
DROP POLICY IF EXISTS "request_history_select" ON public.request_history;
DROP POLICY IF EXISTS "request_history_insert" ON public.request_history;
CREATE POLICY "request_history_select" ON public.request_history FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));
CREATE POLICY "request_history_insert" ON public.request_history FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_user_tenant_id())
    AND user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.material_requests mr
      WHERE mr.id = request_history.request_id AND mr.tenant_id = (SELECT public.get_user_tenant_id())
    )
  );

-- request_values e request_attachments: pela solicitação
DROP POLICY IF EXISTS "request_values_via_request" ON public.request_values;
CREATE POLICY "request_values_via_request" ON public.request_values FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.material_requests mr
    WHERE mr.id = request_values.request_id AND mr.tenant_id = (SELECT public.get_user_tenant_id())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.material_requests mr
    WHERE mr.id = request_values.request_id AND mr.tenant_id = (SELECT public.get_user_tenant_id())
  ));

DROP POLICY IF EXISTS "request_attachments_via_request" ON public.request_attachments;
CREATE POLICY "request_attachments_via_request" ON public.request_attachments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.material_requests mr
    WHERE mr.id = request_attachments.request_id AND mr.tenant_id = (SELECT public.get_user_tenant_id())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.material_requests mr
    WHERE mr.id = request_attachments.request_id AND mr.tenant_id = (SELECT public.get_user_tenant_id())
  ));

-- notifications: só as do próprio usuário no tenant em uso; criação pelo servidor
DROP POLICY IF EXISTS "notifications_tenant_isolation" ON public.notifications;
DROP POLICY IF EXISTS "notifications_own_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_own_update" ON public.notifications;
CREATE POLICY "notifications_own_select" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND tenant_id = (SELECT public.get_user_tenant_id()));
CREATE POLICY "notifications_own_update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND tenant_id = (SELECT public.get_user_tenant_id()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND tenant_id = (SELECT public.get_user_tenant_id()));

-- user_notification_prefs: do próprio usuário
DROP POLICY IF EXISTS "user_notification_prefs_tenant_isolation" ON public.user_notification_prefs;
DROP POLICY IF EXISTS "user_notification_prefs_own" ON public.user_notification_prefs;
CREATE POLICY "user_notification_prefs_own" ON public.user_notification_prefs FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- integration_logs: leitura do tenant em uso
DROP POLICY IF EXISTS "integration_logs_tenant_read" ON public.integration_logs;
CREATE POLICY "integration_logs_tenant_read" ON public.integration_logs FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

-- grupos e permissões avulsas: do tenant em uso ou do próprio usuário
DROP POLICY IF EXISTS "user_role_groups_select" ON public.user_role_groups;
CREATE POLICY "user_role_groups_select" ON public.user_role_groups FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_role_groups.user_id AND u.tenant_id = (SELECT public.get_user_tenant_id()))
  );

DROP POLICY IF EXISTS "user_permission_grants_select" ON public.user_permission_grants;
CREATE POLICY "user_permission_grants_select" ON public.user_permission_grants FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_permission_grants.user_id AND u.tenant_id = (SELECT public.get_user_tenant_id()))
  );

DROP POLICY IF EXISTS "tenant_isolation" ON public.value_dictionary_dismissed;
CREATE POLICY "tenant_isolation" ON public.value_dictionary_dismissed FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

-- ─── 3. Execução de funções: só usuário logado (e o servidor) ────────────────
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END;
$$;

-- Função da API continua só do servidor
REVOKE EXECUTE ON FUNCTION public.api_insert_material(INTEGER, JSONB) FROM authenticated;

-- Funções criadas daqui em diante já nascem sem acesso anônimo (anon também recebe pelo PUBLIC)
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
