-- Migration 043: tipos de solicitação (Cadastro, Alteração, Ampliação) e a Alteração de material
-- 1. workflow_header.request_type: cada tipo tem o seu workflow, um ativo por tipo e tenant.
-- 2. material_requests: request_type, target_material_id (material da base), change_fields (campos
--    escolhidos na Alteração) e change_previous (valores de antes, gravados na abertura).
-- 3. Workflow de Alteração para todo tenant (cópia das etapas do workflow de cadastro ativo) e no
--    onboarding de tenant novo.
-- 4. guard_material_requests: na abertura, tipo igual ao do workflow; Alteração exige material do
--    tenant, não Obsoleto, do mesmo PDM, com campos escolhidos, sem Tipo de Material (o ERP não deixa
--    trocar) e sem outra Alteração aberta do mesmo material. Tipo, material e campos não mudam depois.
-- 5. advance_workflow: na Alteração, cada etapa cobra só os campos escolhidos que são dela; na
--    aprovação final, aplica os campos no material existente (Pendente ERP) em vez de criar outro.
--    O histórico do material (042) registra a solicitação.
-- Pode rodar de novo.

-- ─── 1. Tipo no workflow ─────────────────────────────────────────────────────
ALTER TABLE public.workflow_header ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'cadastro';
ALTER TABLE public.workflow_header DROP CONSTRAINT IF EXISTS ck_workflow_header_request_type;
ALTER TABLE public.workflow_header
  ADD CONSTRAINT ck_workflow_header_request_type CHECK (request_type IN ('cadastro', 'alteracao', 'ampliacao'));

-- Um ativo por tipo: se houver mais de um, fica o mais antigo.
UPDATE public.workflow_header w
SET is_active = false
WHERE w.is_active
  AND EXISTS (
    SELECT 1 FROM public.workflow_header o
    WHERE o.tenant_id = w.tenant_id AND o.request_type = w.request_type AND o.is_active AND o.id < w.id
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_header_active_type
  ON public.workflow_header (tenant_id, request_type) WHERE is_active;

-- ─── 2. Tipo e material na solicitação ───────────────────────────────────────
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'cadastro';
ALTER TABLE public.material_requests DROP CONSTRAINT IF EXISTS ck_material_requests_request_type;
ALTER TABLE public.material_requests
  ADD CONSTRAINT ck_material_requests_request_type CHECK (request_type IN ('cadastro', 'alteracao', 'ampliacao'));
ALTER TABLE public.material_requests
  ADD COLUMN IF NOT EXISTS target_material_id INTEGER REFERENCES public.material_database(id) ON DELETE RESTRICT;
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS change_fields TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS change_previous JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_material_requests_target ON public.material_requests (target_material_id) WHERE target_material_id IS NOT NULL;

-- Valores de antes dos campos escolhidos, para a tela mostrar "atual → novo". Vale para qualquer
-- caminho de abertura (navegador ou servidor).
CREATE OR REPLACE FUNCTION public.set_change_previous()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attrs JSONB;
BEGIN
  IF NEW.request_type = 'cadastro' OR NEW.target_material_id IS NULL THEN
    NEW.change_previous := '{}'::jsonb;
    RETURN NEW;
  END IF;
  SELECT public.material_rule_attributes(m) INTO v_attrs
  FROM public.material_database m
  WHERE m.id = NEW.target_material_id AND m.tenant_id = NEW.tenant_id;
  NEW.change_previous := coalesce((
    SELECT jsonb_object_agg(k, coalesce(v_attrs -> k, 'null'::jsonb))
    FROM unnest(NEW.change_fields) AS k
  ), '{}'::jsonb);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_change_previous() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_set_change_previous ON public.material_requests;
CREATE TRIGGER trg_set_change_previous
  BEFORE INSERT ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_change_previous();

-- ─── 3. Workflow de Alteração ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_request_type_workflows(p_tenant_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source INTEGER;
  v_new INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.workflow_header WHERE tenant_id = p_tenant_id AND request_type = 'alteracao') THEN
    RETURN;
  END IF;
  SELECT id INTO v_source
  FROM public.workflow_header
  WHERE tenant_id = p_tenant_id AND request_type = 'cadastro' AND is_active
  ORDER BY id LIMIT 1;
  IF v_source IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.workflow_header (tenant_id, name, description, is_active, request_type)
  VALUES (p_tenant_id, 'Fluxo de Alteração',
    'Alteração de material já cadastrado: cada etapa revisa os campos escolhidos que são dela', true, 'alteracao')
  RETURNING id INTO v_new;
  INSERT INTO public.workflow_config (tenant_id, workflow_id, step_name, status_key, "order", is_active, sla_days)
  SELECT tenant_id, v_new, step_name, status_key, "order", is_active, sla_days
  FROM public.workflow_config
  WHERE workflow_id = v_source;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_request_type_workflows(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_request_type_workflows(INTEGER) TO service_role;

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.ensure_request_type_workflows(t.id);
  END LOOP;
END;
$$;

-- Tenant novo já nasce com o workflow de Alteração.
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef('public.create_tenant_onboarding(text,text,text,text,text)'::regprocedure) INTO v_def;
  IF position('ensure_request_type_workflows' IN v_def) = 0 THEN
    IF position('RETURN jsonb_build_object(' IN v_def) = 0 THEN
      RAISE EXCEPTION 'Migration 043: trecho de referência não encontrado em create_tenant_onboarding';
    END IF;
    EXECUTE replace(
      v_def,
      'RETURN jsonb_build_object(',
      'PERFORM public.ensure_request_type_workflows(v_tenant_id);' || chr(10) || '  RETURN jsonb_build_object('
    );
  END IF;
END;
$$;

-- ─── 4. Trava da solicitação ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_material_requests()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_first TEXT;
  v_material RECORD;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.workflow_header w
      WHERE w.id = NEW.workflow_id AND w.tenant_id = NEW.tenant_id AND w.is_active = true
        AND w.request_type = NEW.request_type
    ) THEN
      RAISE EXCEPTION 'Workflow inválido para a solicitação' USING errcode = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pdm_templates p WHERE p.id = NEW.pdm_id AND p.tenant_id = NEW.tenant_id) THEN
      RAISE EXCEPTION 'PDM inválido para a solicitação' USING errcode = '42501';
    END IF;

    IF NEW.request_type = 'cadastro' THEN
      IF NEW.target_material_id IS NOT NULL OR cardinality(NEW.change_fields) > 0 THEN
        RAISE EXCEPTION 'Solicitação de cadastro não aponta para material existente' USING errcode = '42501';
      END IF;
    ELSE
      SELECT m.id, m.status, m.pdm_code INTO v_material
      FROM public.material_database m
      WHERE m.id = NEW.target_material_id AND m.tenant_id = NEW.tenant_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Material da solicitação não encontrado' USING errcode = '42501';
      END IF;
      IF v_material.status = 'Obsoleto' THEN
        RAISE EXCEPTION 'Material obsoleto não pode ser alterado nem ampliado' USING errcode = '42501';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.pdm_templates p
        WHERE p.id = NEW.pdm_id AND p.tenant_id = NEW.tenant_id AND p.internal_code = v_material.pdm_code
      ) THEN
        RAISE EXCEPTION 'A solicitação precisa usar o PDM do material' USING errcode = '42501';
      END IF;
    END IF;

    IF NEW.request_type = 'alteracao' THEN
      IF cardinality(NEW.change_fields) = 0 THEN
        RAISE EXCEPTION 'Escolha ao menos um campo para alterar' USING errcode = '23502';
      END IF;
      IF 'tipo_material' = ANY (NEW.change_fields) THEN
        RAISE EXCEPTION 'O Tipo de Material de um material já cadastrado não pode ser alterado (o ERP não permite)' USING errcode = '42501';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.material_requests r
        WHERE r.target_material_id = NEW.target_material_id AND r.request_type = 'alteracao' AND NOT r.is_closed
      ) THEN
        RAISE EXCEPTION 'Este material já tem uma alteração em andamento' USING errcode = '23505';
      END IF;
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
     OR NEW.id_sistema IS DISTINCT FROM OLD.id_sistema
     OR NEW.request_type IS DISTINCT FROM OLD.request_type
     OR NEW.target_material_id IS DISTINCT FROM OLD.target_material_id
     OR NEW.change_fields IS DISTINCT FROM OLD.change_fields
     OR NEW.change_previous IS DISTINCT FROM OLD.change_previous THEN
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
        AND w.request_type = NEW.request_type
    ) THEN
      RAISE EXCEPTION 'Etapa não existe no workflow' USING errcode = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 5. Obrigatórios só dos campos escolhidos (Alteração) ────────────────────
CREATE OR REPLACE FUNCTION public.stage_missing_fields(p_tenant_id INTEGER, p_status TEXT, p_attributes JSONB, p_only TEXT[])
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT string_agg(f.field_label, ', ' ORDER BY f.display_order)
  FROM public.field_dictionary f
  CROSS JOIN LATERAL public.field_effective(p_tenant_id, f.field_name, f.responsible_role, f.is_required, p_attributes) e
  WHERE f.tenant_id = p_tenant_id
    AND f.is_active
    AND f.field_name <> 'descricao_basica'
    AND f.field_name = ANY (p_only)
    AND upper(btrim(e.role)) = upper(btrim(coalesce(p_status, '')))
    AND e.requirement = 'required'
    AND nullif(btrim(coalesce(p_attributes ->> f.field_name, '')), '') IS NULL
$$;

REVOKE EXECUTE ON FUNCTION public.stage_missing_fields(INTEGER, TEXT, JSONB, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_missing_fields(INTEGER, TEXT, JSONB, TEXT[]) TO service_role;

-- ─── 6. Histórico do material com a solicitação que alterou ─────────────────
CREATE OR REPLACE FUNCTION public.record_material_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_fields TEXT[];
  v_request TEXT := nullif(current_setting('promat.request_id', true), '');
BEGIN
  IF v_user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_user) THEN
    v_user := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.material_history (tenant_id, material_id, event_type, event_data, user_id, created_at)
    VALUES (NEW.tenant_id, NEW.id, 'created',
      jsonb_strip_nulls(jsonb_build_object('source', NEW.source, 'request_id', NEW.request_id, 'status', NEW.status)),
      v_user, coalesce(NEW.created_at, now()));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.material_history (tenant_id, material_id, event_type, event_data, user_id)
    VALUES (NEW.tenant_id, NEW.id, 'status', jsonb_build_object('from', OLD.status, 'to', NEW.status), v_user);
  END IF;

  IF NEW.erp_status IS DISTINCT FROM OLD.erp_status OR NEW.id_erp IS DISTINCT FROM OLD.id_erp THEN
    INSERT INTO public.material_history (tenant_id, material_id, event_type, event_data, user_id)
    VALUES (NEW.tenant_id, NEW.id, 'erp', jsonb_strip_nulls(jsonb_build_object(
      'from', OLD.erp_status,
      'to', NEW.erp_status,
      'id_erp', NEW.id_erp,
      'message', CASE WHEN NEW.erp_status = 'erro_erp' THEN left(NEW.erp_error_message, 300) END
    )), v_user);
  END IF;

  v_fields := public.material_edited_fields(OLD, NEW);
  IF cardinality(v_fields) > 0 THEN
    INSERT INTO public.material_history (tenant_id, material_id, event_type, event_data, user_id)
    VALUES (NEW.tenant_id, NEW.id, 'edited', jsonb_strip_nulls(jsonb_build_object(
      'fields', to_jsonb(v_fields),
      'request_id', v_request::integer
    )), v_user);
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 7. Aprovação ────────────────────────────────────────────────────────────
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
  v_final BOOLEAN;
  v_changes JSONB;
  v_pdm_changed BOOLEAN;
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

  IF public.is_closed_status(v_current_status) THEN
    RAISE EXCEPTION 'Solicitação já está em status final' USING errcode = '23502';
  END IF;

  IF NOT public.can_act_on_stage(v_current_status) THEN
    RAISE EXCEPTION 'Esta etapa é da área %; só ela ou o Admin aprova', upper(v_current_status) USING errcode = '42501';
  END IF;

  IF v_req.request_type = 'alteracao' THEN
    v_missing := public.stage_missing_fields(v_tenant_id, v_current_status, v_req.technical_attributes, v_req.change_fields);
  ELSE
    v_missing := public.stage_missing_fields(v_tenant_id, v_current_status, v_req.technical_attributes);
  END IF;
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

  v_final := lower(v_next_status) IN ('completed', 'finalizado');

  UPDATE public.material_requests
  SET status = v_next_status, assigned_to_id = NULL, assigned_at = NULL
  WHERE id = p_request_id;

  v_msg := CASE
    WHEN v_final AND v_req.request_type = 'alteracao' THEN 'Alteração aprovada e aplicada ao material'
    WHEN v_final THEN 'Solicitação finalizada'
    WHEN lower(v_next_status) = 'compras' THEN 'Aprovado e encaminhado para Compras'
    WHEN lower(v_next_status) = 'mrp' THEN 'Aprovado e encaminhado para MRP'
    WHEN lower(v_next_status) = 'fiscal' THEN 'Aprovado e encaminhado para Fiscal'
    WHEN lower(v_next_status) = 'contabilidade' THEN 'Aprovado e encaminhado para Contabilidade'
    ELSE 'Aprovado e encaminhado para ' || v_next_status
  END;

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage)
  VALUES (v_tenant_id, p_request_id, auth.uid(), 'approved', v_msg, v_next_status);

  IF v_final AND v_req.request_type = 'alteracao' THEN
    -- Só os campos escolhidos saem da solicitação para o material.
    SELECT coalesce(jsonb_object_agg(k, v_req.technical_attributes -> k), '{}'::jsonb) INTO v_changes
    FROM unnest(v_req.change_fields) AS k
    WHERE v_req.technical_attributes ? k;
    -- Atributo do PDM (fora do dicionário) muda a descrição: vale a descrição refeita na solicitação.
    SELECT EXISTS (
      SELECT 1 FROM unnest(v_req.change_fields) AS k
      WHERE NOT EXISTS (SELECT 1 FROM public.field_dictionary f WHERE f.tenant_id = v_tenant_id AND f.field_name = k)
    ) INTO v_pdm_changed;

    PERFORM set_config('promat.request_id', p_request_id::text, true);
    UPDATE public.material_database m
    SET technical_attributes = coalesce(m.technical_attributes, '{}'::jsonb) || v_changes,
        description = CASE WHEN v_pdm_changed AND nullif(btrim(coalesce(v_req.generated_description, '')), '') IS NOT NULL
          THEN v_req.generated_description ELSE m.description END,
        erp_status = 'pendente_erp',
        erp_error_message = NULL,
        updated_at = now()
    WHERE m.id = v_req.target_material_id AND m.tenant_id = v_tenant_id;
    PERFORM set_config('promat.request_id', '', true);
  ELSIF v_final AND v_req.request_type = 'cadastro' THEN
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
