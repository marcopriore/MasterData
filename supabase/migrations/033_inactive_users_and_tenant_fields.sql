-- Migration 033: usuário inativo sem acesso, campos obrigatórios conferidos no banco, campos padrão do tenant novo
-- 1. get_user_tenant_id() devolve NULL para usuário inativo: a RLS corta toda leitura e gravação.
--    user_has_permission() também exige usuário ativo nas permissões avulsas.
--    Quem já está inativo fica bloqueado no Auth (banned_until); a Gestão de Usuários passa a fazer isso ao inativar.
-- 2. advance_workflow confere os campos obrigatórios da etapa (antes só a tela conferia).
-- 3. Opções dos campos no texto aceito pelo ERP (sem acento) e copy_default_fields() para o tenant novo
--    receber o dicionário completo, com opções (o onboarding criava só 5 campos, sem opção nenhuma).
-- Pode rodar de novo.

-- ─── 1. Usuário inativo ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (auth.jwt() -> 'app_metadata' ->> 'is_master')::boolean IS TRUE
      THEN COALESCE((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::integer, u.tenant_id)
    ELSE u.tenant_id
  END
  FROM public.users u
  WHERE u.id = auth.uid() AND coalesce(u.is_active, true)
$$;

CREATE OR REPLACE FUNCTION public.user_has_permission(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Mesma regra de mergeRolePermissions (web/lib/permissions.ts): grupos, ou o papel de etapa
  -- quando não há grupo, mais as permissões avulsas. Usuário inativo não tem permissão nenhuma.
  SELECT EXISTS (SELECT 1 FROM public.users a WHERE a.id = auth.uid() AND coalesce(a.is_active, true))
    AND (
      public.is_master_user()
      OR EXISTS (
        SELECT 1
        FROM public.users u
        JOIN public.roles r
          ON r.id IN (SELECT g.role_id FROM public.user_role_groups g WHERE g.user_id = u.id)
          OR (r.id = u.role_id AND NOT EXISTS (SELECT 1 FROM public.user_role_groups g WHERE g.user_id = u.id))
        WHERE u.id = auth.uid()
          AND (r.permissions ->> p_key) = 'true'
      )
      OR EXISTS (
        SELECT 1 FROM public.user_permission_grants pg
        WHERE pg.user_id = auth.uid() AND pg.permission_key = p_key
      )
    )
$$;

UPDATE auth.users a
SET banned_until = '2999-12-31'
FROM public.users u
WHERE u.id = a.id
  AND u.is_active = false
  AND (a.banned_until IS NULL OR a.banned_until < now());

-- ─── 2. Campos obrigatórios da etapa ─────────────────────────────────────────
-- Mesma regra da governança: etapa padrão → área (statusToResponsibleRole); descricao_basica é gerada.
CREATE OR REPLACE FUNCTION public.stage_missing_fields(p_tenant_id INTEGER, p_status TEXT, p_attributes JSONB)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT string_agg(f.field_label, ', ' ORDER BY f.display_order)
  FROM public.field_dictionary f
  WHERE f.tenant_id = p_tenant_id
    AND f.is_active
    AND f.is_required
    AND f.field_name <> 'descricao_basica'
    AND f.responsible_role = CASE lower(coalesce(p_status, ''))
      WHEN 'cadastro' THEN 'CADASTRO'
      WHEN 'compras' THEN 'COMPRAS'
      WHEN 'mrp' THEN 'MRP'
      WHEN 'fiscal' THEN 'FISCAL'
      WHEN 'contabilidade' THEN 'CONTABILIDADE'
    END
    AND nullif(btrim(coalesce(p_attributes ->> f.field_name, '')), '') IS NULL
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
  v_missing TEXT;
BEGIN
  PERFORM public.require_permission('can_approve');
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

  v_missing := public.stage_missing_fields(v_tenant_id, v_current_status, v_req.technical_attributes);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Campos obrigatórios da etapa não preenchidos: %', v_missing USING errcode = '23502';
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

-- ─── 3. Campos do tenant ─────────────────────────────────────────────────────
UPDATE public.field_dictionary
SET options = public.erp_jsonb(options)
WHERE options IS NOT NULL AND options IS DISTINCT FROM public.erp_jsonb(options);

-- Copia para o tenant os campos do tenant modelo (o mais antigo com o dicionário completo, com opções).
-- Campo que o tenant já tem só recebe as opções, se estiver sem nenhuma.
CREATE OR REPLACE FUNCTION public.copy_default_fields(p_tenant_id INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template INTEGER;
  v_count INTEGER;
BEGIN
  -- Usuário logado só se for Master; servidor (service_role) e o SQL Editor (sem token) passam.
  IF auth.role() = 'authenticated' AND NOT public.is_master_user() THEN
    RAISE EXCEPTION 'Apenas usuário master' USING errcode = '42501';
  END IF;

  SELECT min(f.tenant_id) INTO v_template
  FROM public.field_dictionary f
  WHERE f.tenant_id <> p_tenant_id AND f.field_name = 'tipo_mrp' AND f.options IS NOT NULL AND f.is_active;
  IF v_template IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.field_dictionary d
  SET options = public.erp_jsonb(t.options)
  FROM public.field_dictionary t
  WHERE d.tenant_id = p_tenant_id
    AND t.tenant_id = v_template
    AND t.field_name = d.field_name
    AND d.options IS NULL
    AND t.options IS NOT NULL;

  INSERT INTO public.field_dictionary (
    tenant_id, field_name, field_label, erp_field, erp_view, field_type, responsible_role,
    is_required, is_active, display_order, options
  )
  SELECT p_tenant_id, t.field_name, t.field_label, t.erp_field, t.erp_view, t.field_type, t.responsible_role,
    t.is_required, t.is_active, t.display_order, public.erp_jsonb(t.options)
  FROM public.field_dictionary t
  WHERE t.tenant_id = v_template
    AND NOT EXISTS (SELECT 1 FROM public.field_dictionary d WHERE d.tenant_id = p_tenant_id AND d.field_name = t.field_name);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.copy_default_fields(INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.stage_missing_fields(INTEGER, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_default_fields(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stage_missing_fields(INTEGER, TEXT, JSONB) TO authenticated, service_role;

-- Tenants criados antes desta migration com o dicionário incompleto (só os 5 campos do onboarding)
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tn.id FROM public.tenants tn
    WHERE EXISTS (
      SELECT 1 FROM public.field_dictionary f
      WHERE f.tenant_id = tn.id AND f.field_type = 'select' AND f.is_required AND f.is_active AND f.options IS NULL
    )
  LOOP
    PERFORM public.copy_default_fields(t.id);
  END LOOP;
END;
$$;
