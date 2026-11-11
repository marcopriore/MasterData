-- Migration 045: centros e solicitação de Ampliação
-- 1. centers: lista de centros da empresa (Administração → Centros, permissão Dicionário de Dados).
-- 2. field_dictionary.per_center: campo que vale por centro (vem marcado para MRP, Compras e
--    Contabilidade, inclusive nos campos copiados para tenant novo).
-- 3. material_centers: centros do material. O centro inicial (is_origin) usa os campos do próprio
--    material; o centro acrescentado por Ampliação guarda os valores dele em attributes.
-- 4. material_requests.center_id: o cadastro escolhe o centro inicial (obrigatório quando a empresa
--    tem centro ativo); a Ampliação escolhe o centro novo, que o material ainda não tem.
-- 5. Workflow de Ampliação para todo tenant (cópia das etapas do cadastro) e no onboarding.
-- 6. guard_material_requests e set_change_previous: regras do centro; na Ampliação os campos da
--    solicitação são os campos por centro do dicionário, definidos pelo banco.
-- 7. advance_workflow: cadastro grava o centro inicial no material novo; Ampliação acrescenta o
--    centro com os valores revisados e o material volta para Pendente ERP.
-- 8. set_material_origin_center: material antigo sem centro recebe o centro inicial (Editar Materiais).
-- 9. Histórico do material registra o centro acrescentado.
-- Pode rodar de novo.

-- ─── 1. Centros ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.centers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_centers_tenant_code ON public.centers (tenant_id, upper(code));

CREATE OR REPLACE FUNCTION public.normalize_center()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.code := upper(btrim(public.erp_text(NEW.code)));
  NEW.name := upper(btrim(public.erp_text(NEW.name)));
  IF NEW.code = '' OR NEW.name = '' THEN
    RAISE EXCEPTION 'Informe o código e o nome do centro' USING errcode = '23502';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Centro não muda de empresa' USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_center ON public.centers;
CREATE TRIGGER trg_normalize_center
  BEFORE INSERT OR UPDATE ON public.centers
  FOR EACH ROW EXECUTE FUNCTION public.normalize_center();

ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS centers_select ON public.centers;
DROP POLICY IF EXISTS centers_write ON public.centers;
CREATE POLICY centers_select ON public.centers FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()));
CREATE POLICY centers_write ON public.centers FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND (SELECT public.user_has_permission('can_manage_fields')))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND (SELECT public.user_has_permission('can_manage_fields')));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.centers TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.centers_id_seq TO authenticated;
REVOKE ALL ON public.centers FROM anon;

-- ─── 2. Campo por centro ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'field_dictionary' AND column_name = 'per_center'
  ) THEN
    ALTER TABLE public.field_dictionary ADD COLUMN per_center BOOLEAN;
    UPDATE public.field_dictionary
    SET per_center = upper(btrim(coalesce(responsible_role, ''))) IN ('MRP', 'COMPRAS', 'CONTABILIDADE');
    ALTER TABLE public.field_dictionary ALTER COLUMN per_center SET NOT NULL;
  END IF;
END;
$$;

COMMENT ON COLUMN public.field_dictionary.per_center IS
  'Vale por centro: a Ampliação pede este campo para o centro novo. Sem valor na criação, vem marcado para MRP, Compras e Contabilidade.';

-- Campo criado sem dizer (cópia para tenant novo, importação) segue a área responsável.
CREATE OR REPLACE FUNCTION public.default_field_per_center()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.per_center IS NULL THEN
    NEW.per_center := upper(btrim(coalesce(NEW.responsible_role, ''))) IN ('MRP', 'COMPRAS', 'CONTABILIDADE');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_field_per_center ON public.field_dictionary;
CREATE TRIGGER trg_default_field_per_center
  BEFORE INSERT ON public.field_dictionary
  FOR EACH ROW EXECUTE FUNCTION public.default_field_per_center();

-- ─── 3. Centros do material ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_centers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES public.material_database(id) ON DELETE CASCADE,
  center_id INTEGER NOT NULL REFERENCES public.centers(id),
  is_origin BOOLEAN NOT NULL DEFAULT false,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id INTEGER REFERENCES public.material_requests(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_material_centers UNIQUE (material_id, center_id)
);

CREATE INDEX IF NOT EXISTS idx_material_centers_tenant ON public.material_centers (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_material_centers_origin ON public.material_centers (material_id) WHERE is_origin;

COMMENT ON COLUMN public.material_centers.attributes IS
  'Campos por centro deste centro. Vazio no centro inicial, que usa os campos do material.';

-- Material e centro da mesma empresa, em qualquer caminho de gravação.
CREATE OR REPLACE FUNCTION public.check_material_center()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.material_database m WHERE m.id = NEW.material_id AND m.tenant_id = NEW.tenant_id)
     OR NOT EXISTS (SELECT 1 FROM public.centers c WHERE c.id = NEW.center_id AND c.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Material e centro precisam ser da mesma empresa' USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_material_center() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_check_material_center ON public.material_centers;
CREATE TRIGGER trg_check_material_center
  BEFORE INSERT OR UPDATE ON public.material_centers
  FOR EACH ROW EXECUTE FUNCTION public.check_material_center();

-- Leitura: quem vê a base ou abre solicitação (a Ampliação esconde os centros que o material já tem).
-- Gravação só pelas funções do banco.
ALTER TABLE public.material_centers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS material_centers_select ON public.material_centers;
CREATE POLICY material_centers_select ON public.material_centers FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_user_tenant_id())
    AND ((SELECT public.user_has_permission('can_view_database')) OR (SELECT public.user_has_permission('can_submit_request')))
  );
GRANT SELECT ON public.material_centers TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.material_centers FROM authenticated, anon;

-- ─── 4. Centro na solicitação ────────────────────────────────────────────────
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS center_id INTEGER REFERENCES public.centers(id);
CREATE INDEX IF NOT EXISTS idx_material_requests_center ON public.material_requests (center_id) WHERE center_id IS NOT NULL;

-- ─── 5. Workflows de Alteração e Ampliação ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_request_type_workflows(p_tenant_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source INTEGER;
  v_new INTEGER;
  v_type RECORD;
BEGIN
  SELECT id INTO v_source
  FROM public.workflow_header
  WHERE tenant_id = p_tenant_id AND request_type = 'cadastro' AND is_active
  ORDER BY id LIMIT 1;
  IF v_source IS NULL THEN
    RETURN;
  END IF;
  FOR v_type IN
    SELECT * FROM (VALUES
      ('alteracao', 'Fluxo de Alteração', 'Alteração de material já cadastrado: cada etapa revisa os campos escolhidos que são dela'),
      ('ampliacao', 'Fluxo de Ampliação', 'Ampliação de material para outro centro: cada etapa preenche os campos por centro que são dela')
    ) AS t(request_type, name, description)
  LOOP
    IF EXISTS (SELECT 1 FROM public.workflow_header WHERE tenant_id = p_tenant_id AND request_type = v_type.request_type) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.workflow_header (tenant_id, name, description, is_active, request_type)
    VALUES (p_tenant_id, v_type.name, v_type.description, true, v_type.request_type)
    RETURNING id INTO v_new;
    INSERT INTO public.workflow_config (tenant_id, workflow_id, step_name, status_key, "order", is_active, sla_days)
    SELECT tenant_id, v_new, step_name, status_key, "order", is_active, sla_days
    FROM public.workflow_config
    WHERE workflow_id = v_source;
  END LOOP;
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

-- ─── 6. Trava da solicitação ─────────────────────────────────────────────────
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

    IF NEW.center_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.centers c WHERE c.id = NEW.center_id AND c.tenant_id = NEW.tenant_id AND c.is_active
    ) THEN
      RAISE EXCEPTION 'Centro inválido para a solicitação' USING errcode = '42501';
    END IF;

    IF NEW.request_type = 'cadastro' THEN
      IF NEW.target_material_id IS NOT NULL OR cardinality(NEW.change_fields) > 0 THEN
        RAISE EXCEPTION 'Solicitação de cadastro não aponta para material existente' USING errcode = '42501';
      END IF;
      IF NEW.center_id IS NULL AND EXISTS (
        SELECT 1 FROM public.centers c WHERE c.tenant_id = NEW.tenant_id AND c.is_active
      ) THEN
        RAISE EXCEPTION 'Escolha o centro do material' USING errcode = '23502';
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
      IF NEW.center_id IS NOT NULL THEN
        RAISE EXCEPTION 'Alteração não escolhe centro; para outro centro, use a Ampliação' USING errcode = '42501';
      END IF;
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

    IF NEW.request_type = 'ampliacao' THEN
      IF NEW.center_id IS NULL THEN
        RAISE EXCEPTION 'Escolha o centro da ampliação' USING errcode = '23502';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.material_centers mc
        WHERE mc.material_id = NEW.target_material_id AND mc.center_id = NEW.center_id
      ) THEN
        RAISE EXCEPTION 'O material já está neste centro' USING errcode = '23505';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.material_requests r
        WHERE r.target_material_id = NEW.target_material_id AND r.request_type = 'ampliacao'
          AND r.center_id = NEW.center_id AND NOT r.is_closed
      ) THEN
        RAISE EXCEPTION 'Já existe uma ampliação deste material para este centro em andamento' USING errcode = '23505';
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
     OR NEW.change_previous IS DISTINCT FROM OLD.change_previous
     OR NEW.center_id IS DISTINCT FROM OLD.center_id THEN
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

-- Ampliação: os campos da solicitação são os campos por centro do dicionário (o banco define, não
-- o navegador), e o "antes" é o valor do material, para a tela mostrar de onde partiu.
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
  IF NEW.request_type = 'ampliacao' THEN
    NEW.change_fields := coalesce((
      SELECT array_agg(f.field_name ORDER BY f.display_order, f.field_name)
      FROM public.field_dictionary f
      WHERE f.tenant_id = NEW.tenant_id AND f.is_active AND f.per_center AND f.field_name <> 'descricao_basica'
    ), '{}');
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

-- ─── 7. Histórico: centro acrescentado ───────────────────────────────────────
ALTER TABLE public.material_history DROP CONSTRAINT IF EXISTS material_history_event_type_check;
ALTER TABLE public.material_history
  ADD CONSTRAINT material_history_event_type_check CHECK (event_type IN ('created', 'status', 'erp', 'edited', 'center'));

CREATE OR REPLACE FUNCTION public.record_material_center()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_center RECORD;
BEGIN
  IF v_user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_user) THEN
    v_user := NULL;
  END IF;
  SELECT code, name INTO v_center FROM public.centers WHERE id = NEW.center_id;
  INSERT INTO public.material_history (tenant_id, material_id, event_type, event_data, user_id)
  VALUES (NEW.tenant_id, NEW.material_id, 'center', jsonb_strip_nulls(jsonb_build_object(
    'code', v_center.code,
    'name', v_center.name,
    'origin', NEW.is_origin,
    'request_id', NEW.request_id
  )), v_user);
  -- O ERP precisa receber o centro novo.
  UPDATE public.material_database
  SET erp_status = 'pendente_erp', erp_error_message = NULL, updated_at = now()
  WHERE id = NEW.material_id AND erp_status IS DISTINCT FROM 'pendente_erp';
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_material_center() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_record_material_center ON public.material_centers;
CREATE TRIGGER trg_record_material_center
  AFTER INSERT ON public.material_centers
  FOR EACH ROW EXECUTE FUNCTION public.record_material_center();

-- ─── 8. Centro inicial de material antigo ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_material_origin_center(p_material_id INTEGER, p_center_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant INTEGER := public.get_user_tenant_id();
  v_status TEXT;
BEGIN
  PERFORM public.require_permission('can_standardize');
  SELECT status INTO v_status FROM public.material_database WHERE id = p_material_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material não encontrado' USING errcode = 'P0002';
  END IF;
  IF v_status = 'Obsoleto' THEN
    RAISE EXCEPTION 'Material obsoleto não recebe centro' USING errcode = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.material_centers WHERE material_id = p_material_id) THEN
    RAISE EXCEPTION 'O material já tem centro; outro centro entra por Ampliação' USING errcode = '23505';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.centers WHERE id = p_center_id AND tenant_id = v_tenant AND is_active) THEN
    RAISE EXCEPTION 'Centro inválido' USING errcode = '42501';
  END IF;
  INSERT INTO public.material_centers (tenant_id, material_id, center_id, is_origin, created_by)
  VALUES (v_tenant, p_material_id, p_center_id, true, auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_material_origin_center(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_material_origin_center(INTEGER, INTEGER) TO authenticated;

-- ─── 9. Aprovação ────────────────────────────────────────────────────────────
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
  v_new_material INTEGER;
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

  IF v_req.request_type IN ('alteracao', 'ampliacao') THEN
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

  IF v_final AND v_req.request_type = 'ampliacao' AND EXISTS (
    SELECT 1 FROM public.material_centers mc
    WHERE mc.material_id = v_req.target_material_id AND mc.center_id = v_req.center_id
  ) THEN
    RAISE EXCEPTION 'O material já está neste centro' USING errcode = '23505';
  END IF;

  UPDATE public.material_requests
  SET status = v_next_status, assigned_to_id = NULL, assigned_at = NULL
  WHERE id = p_request_id;

  v_msg := CASE
    WHEN v_final AND v_req.request_type = 'alteracao' THEN 'Alteração aprovada e aplicada ao material'
    WHEN v_final AND v_req.request_type = 'ampliacao' THEN 'Ampliação aprovada: centro acrescentado ao material'
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
  ELSIF v_final AND v_req.request_type = 'ampliacao' THEN
    -- Os campos por centro revisados nas etapas ficam no centro novo; o material não muda.
    SELECT coalesce(jsonb_object_agg(k, v_req.technical_attributes -> k), '{}'::jsonb) INTO v_changes
    FROM unnest(v_req.change_fields) AS k
    WHERE v_req.technical_attributes ? k
      AND nullif(btrim(coalesce(v_req.technical_attributes ->> k, '')), '') IS NOT NULL;
    INSERT INTO public.material_centers (tenant_id, material_id, center_id, is_origin, attributes, request_id, created_by)
    VALUES (v_tenant_id, v_req.target_material_id, v_req.center_id, false, v_changes, p_request_id, auth.uid());
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
    )
    RETURNING id INTO v_new_material;

    IF v_req.center_id IS NOT NULL THEN
      INSERT INTO public.material_centers (tenant_id, material_id, center_id, is_origin, request_id, created_by)
      VALUES (v_tenant_id, v_new_material, v_req.center_id, true, p_request_id, auth.uid());
    END IF;
  END IF;

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;
