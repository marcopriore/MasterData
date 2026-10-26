-- Migration 032: permissão de cada ação também no banco
-- A 031 isolou os tenants. Aqui, dentro do tenant, o banco confere a permissão de quem grava,
-- igual às telas: sem isso, um usuário logado alterava pela chave pública o que a tela esconde dele.
-- 1. require_permission() e checagem nas funções (aprovar, rejeitar, atender, mover, dicionário).
-- 2. Policies de escrita por permissão (PDM, campos, workflow, dicionário, solicitações, materiais, logs).
-- 3. Gatilhos que travam colunas que só o servidor ou as funções do banco alteram
--    (situação no ERP, código ERP, etapa, atendente, tenant, autor).
-- 4. search_path fixo em toda função SECURITY DEFINER.
-- Pode rodar de novo.

-- ─── 1. Funções ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.require_permission(p_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  IF auth.uid() IS NULL OR NOT public.user_has_permission(p_key) THEN
    RAISE EXCEPTION 'Sem permissão (%)', p_key USING errcode = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.require_permission(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_permission(TEXT) TO authenticated, service_role;

-- Insere a checagem logo antes de um trecho conhecido do corpo da função (definições da 031 e anteriores).
DO $$
DECLARE
  r RECORD;
  v_def TEXT;
  v_pos INTEGER;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.assign_request(integer)', 'can_attend', 'IF auth.uid() IS NULL THEN'),
      ('public.advance_workflow(integer)', 'can_approve', 'IF auth.uid() IS NULL THEN'),
      ('public.reject_request(integer,text)', 'can_reject', 'IF auth.uid() IS NULL THEN'),
      ('public.move_request_stage(integer,text)', 'can_attend', 'IF auth.uid() IS NULL THEN'),
      ('public.merge_dictionary_entries(integer,integer)', 'can_manage_value_dictionary', 'v_tenant_id := public.get_user_tenant_id();'),
      ('public.propagate_value_to_pdms(text,text,text)', 'can_manage_value_dictionary', 'v_tenant_id := public.get_user_tenant_id();'),
      ('public.propagate_value_to_requests_and_materials(text,text)', 'can_manage_value_dictionary', 'v_tenant_id := public.get_user_tenant_id();'),
      ('public.dismiss_similar_pair(integer,integer)', 'can_manage_value_dictionary', 'v_tenant_id := public.get_user_tenant_id();'),
      ('public.sync_value_dictionary()', 'can_manage_value_dictionary', 'v_tenant_id := public.get_user_tenant_id();')
    ) AS t(sig, perm, anchor)
  LOOP
    v_def := pg_get_functiondef(r.sig::regprocedure);
    IF position('require_permission' IN v_def) > 0 THEN
      CONTINUE;
    END IF;
    v_pos := position(r.anchor IN v_def);
    IF v_pos = 0 THEN
      RAISE EXCEPTION 'Migration 032: trecho de referência não encontrado em %', r.sig;
    END IF;
    -- Insere antes da primeira ocorrência do trecho.
    EXECUTE left(v_def, v_pos - 1)
      || 'PERFORM public.require_permission(''' || r.perm || ''');' || chr(10) || '  '
      || substr(v_def, v_pos);
  END LOOP;
END;
$$;

-- ─── 2. Policies ─────────────────────────────────────────────────────────────
-- Leitura do tenant para todos; escrita do tenant só com a permissão da tela.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('pdm_templates', 'can_edit_pdm'),
      ('field_dictionary', 'can_manage_fields'),
      ('workflow_header', 'can_edit_workflows'),
      ('workflow_config', 'can_edit_workflows'),
      ('value_dictionary', 'can_manage_value_dictionary')
    ) AS t(tbl, perm)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tbl || '_tenant_isolation', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tbl || '_select', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tbl || '_write', r.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = (SELECT public.get_user_tenant_id()))',
      r.tbl || '_select', r.tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (tenant_id = (SELECT public.get_user_tenant_id()) AND (SELECT public.user_has_permission(%L)))
         WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND (SELECT public.user_has_permission(%L)))',
      r.tbl || '_write', r.tbl, r.perm, r.perm
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "tenant_isolation" ON public.value_dictionary_dismissed;
DROP POLICY IF EXISTS "value_dictionary_dismissed_select" ON public.value_dictionary_dismissed;
CREATE POLICY "value_dictionary_dismissed_select" ON public.value_dictionary_dismissed FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));

-- Solicitações: abrir exige can_submit_request e o próprio usuário como autor; alterar exige atender
-- (campos da etapa) ou editar workflow (migração entre workflows). Excluir, só pelo servidor.
DROP POLICY IF EXISTS "material_requests_tenant_isolation" ON public.material_requests;
DROP POLICY IF EXISTS "material_requests_select" ON public.material_requests;
DROP POLICY IF EXISTS "material_requests_insert" ON public.material_requests;
DROP POLICY IF EXISTS "material_requests_update" ON public.material_requests;
CREATE POLICY "material_requests_select" ON public.material_requests FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));
CREATE POLICY "material_requests_insert" ON public.material_requests FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_user_tenant_id())
    AND user_id = (SELECT auth.uid())
    AND (SELECT public.user_has_permission('can_submit_request'))
  );
CREATE POLICY "material_requests_update" ON public.material_requests FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.get_user_tenant_id())
    AND ((SELECT public.user_has_permission('can_attend')) OR (SELECT public.user_has_permission('can_edit_workflows')))
  )
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

-- Materiais: nascem pelo banco (advance_workflow) ou pelo servidor (importação, API).
-- Pelo navegador só se altera com padronizar ou editar PDM (descrições regeradas).
DROP POLICY IF EXISTS "material_database_tenant_isolation" ON public.material_database;
DROP POLICY IF EXISTS "material_database_select" ON public.material_database;
DROP POLICY IF EXISTS "material_database_update" ON public.material_database;
CREATE POLICY "material_database_select" ON public.material_database FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));
CREATE POLICY "material_database_update" ON public.material_database FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.get_user_tenant_id())
    AND ((SELECT public.user_has_permission('can_standardize')) OR (SELECT public.user_has_permission('can_edit_pdm')))
  )
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()));

-- Log do sistema: lê quem tem can_view_logs; cada um registra em nome próprio; ninguém altera nem apaga.
DROP POLICY IF EXISTS "system_logs_tenant_isolation" ON public.system_logs;
DROP POLICY IF EXISTS "system_logs_select" ON public.system_logs;
DROP POLICY IF EXISTS "system_logs_insert" ON public.system_logs;
CREATE POLICY "system_logs_select" ON public.system_logs FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND (SELECT public.user_has_permission('can_view_logs')));
CREATE POLICY "system_logs_insert" ON public.system_logs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "integration_logs_tenant_read" ON public.integration_logs;
CREATE POLICY "integration_logs_tenant_read" ON public.integration_logs FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND (SELECT public.user_has_permission('can_view_logs')));

-- Anexos: lê o tenant; inclui quem abriu a solicitação ou quem atende; não se altera nem apaga.
DROP POLICY IF EXISTS "request_attachments_via_request" ON public.request_attachments;
DROP POLICY IF EXISTS "request_attachments_select" ON public.request_attachments;
DROP POLICY IF EXISTS "request_attachments_insert" ON public.request_attachments;
CREATE POLICY "request_attachments_select" ON public.request_attachments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.material_requests mr
    WHERE mr.id = request_attachments.request_id AND mr.tenant_id = (SELECT public.get_user_tenant_id())
  ));
CREATE POLICY "request_attachments_insert" ON public.request_attachments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.material_requests mr
    WHERE mr.id = request_attachments.request_id
      AND mr.tenant_id = (SELECT public.get_user_tenant_id())
      AND (mr.user_id = (SELECT auth.uid()) OR (SELECT public.user_has_permission('can_attend')))
  ));

-- Arquivos: pasta {tenant}/{solicitação}/, a solicitação precisa ser do tenant; sem sobrescrever nem apagar.
DROP POLICY IF EXISTS "tenant_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "tenant_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "tenant_attachments_update" ON storage.objects;
DROP POLICY IF EXISTS "tenant_attachments_delete" ON storage.objects;
CREATE POLICY "tenant_attachments_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'request-attachments'
    AND (storage.foldername(name))[1] = (SELECT public.get_user_tenant_id())::text
  );
CREATE POLICY "tenant_attachments_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'request-attachments'
    AND (storage.foldername(name))[1] = (SELECT public.get_user_tenant_id())::text
    AND EXISTS (
      SELECT 1 FROM public.material_requests mr
      WHERE mr.id::text = (storage.foldername(name))[2]
        AND mr.tenant_id = (SELECT public.get_user_tenant_id())
    )
  );

-- Tamanho máximo do anexo. Tipo livre: cadastro de material recebe desenho técnico (DWG, STEP etc.);
-- o bucket é privado e o arquivo só sai por URL assinada.
UPDATE storage.buckets
SET file_size_limit = 25 * 1024 * 1024
WHERE id = 'request-attachments';

-- ─── 3. Colunas que o navegador não altera ───────────────────────────────────
-- current_user = 'authenticated' só na chamada direta pela API pública. Dentro das funções
-- SECURITY DEFINER e no servidor (service_role) estas travas não se aplicam.
CREATE OR REPLACE FUNCTION public.guard_material_requests()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_first TEXT;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.workflow_header w
      WHERE w.id = NEW.workflow_id AND w.tenant_id = NEW.tenant_id AND w.is_active = true
    ) THEN
      RAISE EXCEPTION 'Workflow inválido para a solicitação' USING errcode = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pdm_templates p WHERE p.id = NEW.pdm_id AND p.tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'PDM inválido para a solicitação' USING errcode = '42501';
    END IF;
    SELECT status_key INTO v_first
    FROM public.workflow_config
    WHERE workflow_id = NEW.workflow_id AND is_active = true
    ORDER BY "order" ASC
    LIMIT 1;
    IF NEW.status IS DISTINCT FROM v_first THEN
      RAISE EXCEPTION 'Solicitação nova começa na primeira etapa do workflow' USING errcode = '42501';
    END IF;
    NEW.assigned_to_id := NULL;
    NEW.assigned_at := NULL;
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.pdm_id IS DISTINCT FROM OLD.pdm_id
     OR NEW.assigned_to_id IS DISTINCT FROM OLD.assigned_to_id
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
     OR NEW.id_sistema IS DISTINCT FROM OLD.id_sistema THEN
    RAISE EXCEPTION 'Campo da solicitação só muda pelo fluxo' USING errcode = '42501';
  END IF;

  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.workflow_id IS DISTINCT FROM OLD.workflow_id) THEN
    -- Só a migração entre workflows (Configurações → Workflow) muda etapa por fora das funções.
    IF NOT public.user_has_permission('can_edit_workflows') THEN
      RAISE EXCEPTION 'Etapa da solicitação só muda pelo fluxo' USING errcode = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.workflow_config c
      JOIN public.workflow_header w ON w.id = c.workflow_id
      WHERE c.workflow_id = NEW.workflow_id AND w.tenant_id = NEW.tenant_id AND c.status_key = NEW.status
    ) THEN
      RAISE EXCEPTION 'Etapa não existe no workflow' USING errcode = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_material_requests ON public.material_requests;
CREATE TRIGGER trg_guard_material_requests
  BEFORE INSERT OR UPDATE ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_material_requests();

CREATE OR REPLACE FUNCTION public.guard_material_database()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.id_sistema IS DISTINCT FROM OLD.id_sistema
     OR NEW.id_erp IS DISTINCT FROM OLD.id_erp
     OR NEW.erp_integrated_at IS DISTINCT FROM OLD.erp_integrated_at
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.api_client_id IS DISTINCT FROM OLD.api_client_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Campo do material só muda pelo servidor (status, ERP, origem)' USING errcode = '42501';
  END IF;

  -- Editar o material o devolve para pendente_erp (reenvio); qualquer outra situação no ERP é do servidor.
  IF NEW.erp_status IS DISTINCT FROM OLD.erp_status THEN
    IF NEW.erp_status <> 'pendente_erp' OR OLD.erp_status = 'integrando' THEN
      RAISE EXCEPTION 'Situação no ERP só muda pelo servidor' USING errcode = '42501';
    END IF;
  END IF;
  IF NEW.erp_error_message IS DISTINCT FROM OLD.erp_error_message AND NEW.erp_error_message IS NOT NULL THEN
    RAISE EXCEPTION 'Situação no ERP só muda pelo servidor' USING errcode = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_material_database ON public.material_database;
CREATE TRIGGER trg_guard_material_database
  BEFORE UPDATE ON public.material_database
  FOR EACH ROW EXECUTE FUNCTION public.guard_material_database();

-- ─── 4. search_path fixo nas funções SECURITY DEFINER ───────────────────────
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c WHERE c LIKE 'search_path=%')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', f.sig);
  END LOOP;
END;
$$;

-- Funções novas desta migration: sem execução anônima (a 031 já mudou o padrão; aqui reforça).
REVOKE EXECUTE ON FUNCTION public.guard_material_requests() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_material_database() FROM PUBLIC, anon;
