-- Migration 036: cancelamento, motivo de rejeição, prazo por etapa
-- 1. is_closed_status(): mesma regra de web/lib/request-status.ts (finalizada, rejeitada, cancelada).
-- 2. Cancelar (status "cancelado"): o solicitante, enquanto ninguém iniciou o atendimento na primeira
--    etapa; depois disso, só o ADMIN do tenant ou o Master.
-- 3. Rejeição exige motivo padrão (event_data.motivo) além do texto livre; relatório report_rejections.
-- 4. Prazo por etapa: workflow_config.sla_days e material_requests.stage_entered_at (quando entrou na
--    etapa atual, mantido por gatilho). A governança conta como atrasada a parada além do prazo.
-- Pode rodar de novo.

-- ─── 1. Status fechado ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_closed_status(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(btrim(coalesce(p_status, ''))) IN (
    'finalizado', 'completed', 'concluido', 'concluído', 'approved',
    'rejected', 'rejeitado',
    'cancelado', 'cancelled'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_closed_status(TEXT) TO authenticated, service_role;

-- assign, advance e move passam a usar a regra única (inclui cancelada).
DO $$
DECLARE
  r RECORD;
  v_def TEXT;
  v_pos INTEGER;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.advance_workflow(integer)',
       'IF lower(v_current_status) IN (''completed'', ''approved'', ''concluído'', ''finalizado'', ''rejected'') THEN',
       'IF public.is_closed_status(v_current_status) THEN'),
      ('public.move_request_stage(integer,text)',
       'IF lower(coalesce(v_req.status, '''')) IN (''completed'', ''approved'', ''concluído'', ''concluido'', ''finalizado'', ''rejected'', ''rejeitado'') THEN',
       'IF public.is_closed_status(v_req.status) THEN'),
      ('public.assign_request(integer)',
       'IF NOT public.can_act_on_stage(v_row.status) THEN',
       'IF public.is_closed_status(v_row.status) THEN' || chr(10)
         || '    RAISE EXCEPTION ''Solicitação já está fechada'' USING errcode = ''23502'';' || chr(10)
         || '  END IF;' || chr(10) || chr(10)
         || '  IF NOT public.can_act_on_stage(v_row.status) THEN')
    ) AS t(sig, old_text, new_text)
  LOOP
    v_def := pg_get_functiondef(r.sig::regprocedure);
    IF position(r.new_text IN v_def) > 0 THEN
      CONTINUE;
    END IF;
    v_pos := position(r.old_text IN v_def);
    IF v_pos = 0 THEN
      RAISE EXCEPTION 'Migration 036: trecho de referência não encontrado em %', r.sig;
    END IF;
    EXECUTE left(v_def, v_pos - 1) || r.new_text || substr(v_def, v_pos + length(r.old_text));
  END LOOP;
END;
$$;

-- ─── 2. Data de entrada na etapa e prazo ─────────────────────────────────────
ALTER TABLE public.material_requests ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ;
ALTER TABLE public.workflow_config ADD COLUMN IF NOT EXISTS sla_days INTEGER;
ALTER TABLE public.workflow_config DROP CONSTRAINT IF EXISTS ck_workflow_config_sla_days;
ALTER TABLE public.workflow_config
  ADD CONSTRAINT ck_workflow_config_sla_days CHECK (sla_days IS NULL OR sla_days BETWEEN 1 AND 365);

-- Entrada na etapa atual: último evento do histórico que levou a ela; sem histórico, a abertura.
UPDATE public.material_requests r
SET stage_entered_at = coalesce((
    SELECT max(h.created_at)
    FROM public.request_history h
    WHERE h.request_id = r.id
      AND h.event_type IN ('created', 'approved', 'stage_change', 'resubmitted')
      AND lower(h.stage) = lower(r.status)
  ), r.created_at)
WHERE r.stage_entered_at IS NULL;

-- Só o gatilho mexe na coluna: muda quando a etapa muda; senão, mantém (ninguém a altera por fora).
CREATE OR REPLACE FUNCTION public.set_stage_entered_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_entered_at := now();
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.stage_entered_at := now();
  ELSE
    NEW.stage_entered_at := OLD.stage_entered_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_stage_entered_at() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_stage_entered_at ON public.material_requests;
CREATE TRIGGER trg_stage_entered_at
  BEFORE INSERT OR UPDATE ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_stage_entered_at();

-- ─── 3. Cancelar ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_request(p_request_id INTEGER, p_reason TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_first TEXT;
  v_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING errcode = '42501';
  END IF;

  SELECT id, tenant_id, status, workflow_id, user_id, assigned_to_id INTO v_req
  FROM public.material_requests
  WHERE id = p_request_id AND tenant_id = public.get_user_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  IF public.is_closed_status(v_req.status) THEN
    RAISE EXCEPTION 'Solicitação já está fechada' USING errcode = '23502';
  END IF;

  v_is_admin := public.user_is_tenant_admin();
  IF NOT v_is_admin THEN
    IF v_req.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Só quem abriu a solicitação ou o Admin pode cancelar' USING errcode = '42501';
    END IF;
    SELECT status_key INTO v_first
    FROM public.workflow_config
    WHERE workflow_id = v_req.workflow_id AND is_active = true
    ORDER BY "order" ASC
    LIMIT 1;
    IF lower(coalesce(v_req.status, '')) IS DISTINCT FROM lower(coalesce(v_first, '')) OR v_req.assigned_to_id IS NOT NULL THEN
      RAISE EXCEPTION 'A solicitação já está em atendimento; peça ao Admin para cancelar' USING errcode = '42501';
    END IF;
  END IF;

  UPDATE public.material_requests
  SET status = 'cancelado', assigned_to_id = NULL, assigned_at = NULL
  WHERE id = p_request_id;

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (
    v_req.tenant_id,
    p_request_id,
    auth.uid(),
    'cancelled',
    'Solicitação cancelada',
    'cancelado',
    jsonb_build_object('motivo', nullif(btrim(p_reason), ''), 'etapa', v_req.status, 'por_admin', v_is_admin AND v_req.user_id IS DISTINCT FROM auth.uid())
  );

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_request(INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_request(INTEGER, TEXT) TO authenticated, service_role;

-- ─── 4. Rejeição com motivo padrão ───────────────────────────────────────────
DROP FUNCTION IF EXISTS public.reject_request(INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.reject_request(p_request_id INTEGER, p_reason TEXT DEFAULT '', p_category TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
BEGIN
  PERFORM public.require_permission('can_reject');
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING errcode = '42501';
  END IF;

  -- Mesma lista de web/lib/rejection-reasons.ts
  IF p_category IS NULL OR p_category NOT IN ('duplicado', 'falta_informacao', 'pdm_incorreto', 'especificacao_incorreta', 'fora_escopo', 'outro') THEN
    RAISE EXCEPTION 'Informe o motivo da rejeição' USING errcode = '23502';
  END IF;

  SELECT tenant_id, status INTO v_req
  FROM public.material_requests
  WHERE id = p_request_id AND tenant_id = public.get_user_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada' USING errcode = 'P0002';
  END IF;

  IF public.is_closed_status(v_req.status) THEN
    RAISE EXCEPTION 'Solicitação já está fechada' USING errcode = '23502';
  END IF;

  IF NOT public.can_act_on_stage(v_req.status) THEN
    RAISE EXCEPTION 'Esta etapa é da área %; só ela ou o Admin rejeita', upper(v_req.status) USING errcode = '42501';
  END IF;

  UPDATE public.material_requests
  SET status = 'Rejected', assigned_to_id = NULL, assigned_at = NULL
  WHERE id = p_request_id;

  INSERT INTO public.request_history (tenant_id, request_id, user_id, event_type, message, stage, event_data)
  VALUES (
    v_req.tenant_id,
    p_request_id,
    auth.uid(),
    'rejected',
    'Solicitação rejeitada',
    'rejected',
    jsonb_build_object('justification', nullif(trim(p_reason), ''), 'motivo', p_category, 'etapa', v_req.status)
  );

  RETURN (SELECT row_to_json(mr.*)::jsonb FROM public.material_requests mr WHERE id = p_request_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_request(INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_request(INTEGER, TEXT, TEXT) TO authenticated, service_role;

-- ─── 5. Relatórios ───────────────────────────────────────────────────────────
-- Rejeições no período por etapa e motivo. Etapa: event_data.etapa (desde a 034) ou a etapa do
-- evento anterior da solicitação; motivo: event_data.motivo (desde a 036) ou "nao_informado".
CREATE OR REPLACE FUNCTION public.report_rejections(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (stage TEXT, reason TEXT, total BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ev AS (
    SELECT
      h.event_type,
      h.created_at,
      h.event_data,
      lag(lower(h.stage)) OVER (PARTITION BY h.request_id ORDER BY h.created_at, h.id) AS prev_stage
    FROM public.request_history h
    WHERE h.tenant_id = (SELECT public.get_user_tenant_id())
      AND h.event_type IN ('created', 'approved', 'stage_change', 'resubmitted', 'rejected')
  )
  SELECT
    coalesce(lower(e.event_data ->> 'etapa'), e.prev_stage, 'nao_informada') AS stage,
    coalesce(e.event_data ->> 'motivo', 'nao_informado') AS reason,
    count(*)::BIGINT AS total
  FROM ev e
  WHERE e.event_type = 'rejected' AND e.created_at >= p_from AND e.created_at < p_to
  GROUP BY 1, 2
$$;

REVOKE EXECUTE ON FUNCTION public.report_rejections(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_rejections(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

-- Fluxo: cancelamento também encerra a passagem pela etapa; cancelada não conta como aberta.
CREATE OR REPLACE FUNCTION public.report_request_flow(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  stage TEXT,
  entered BIGINT,
  avg_hours NUMERIC,
  max_hours NUMERIC,
  current_open BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH tenant AS (SELECT public.get_user_tenant_id() AS id),
  ev AS (
    SELECT
      h.request_id,
      lower(h.stage) AS stage,
      h.created_at,
      lead(h.created_at) OVER (PARTITION BY h.request_id ORDER BY h.created_at, h.id) AS left_at
    FROM public.request_history h, tenant t
    WHERE h.tenant_id = t.id
      AND h.event_type IN ('created', 'approved', 'stage_change', 'resubmitted', 'rejected', 'cancelled')
      AND h.stage IS NOT NULL
  ),
  periodo AS (
    SELECT
      e.stage,
      count(*)::BIGINT AS entered,
      round(avg(extract(epoch FROM (coalesce(e.left_at, now()) - e.created_at)) / 3600)::NUMERIC, 1) AS avg_hours,
      round(max(extract(epoch FROM (coalesce(e.left_at, now()) - e.created_at)) / 3600)::NUMERIC, 1) AS max_hours
    FROM ev e
    WHERE e.created_at >= p_from AND e.created_at < p_to
      AND NOT public.is_closed_status(e.stage)
    GROUP BY e.stage
  ),
  abertas AS (
    SELECT lower(r.status) AS stage, count(*)::BIGINT AS current_open
    FROM public.material_requests r, tenant t
    WHERE r.tenant_id = t.id
      AND NOT public.is_closed_status(r.status)
    GROUP BY lower(r.status)
  )
  SELECT
    coalesce(p.stage, a.stage) AS stage,
    coalesce(p.entered, 0) AS entered,
    p.avg_hours,
    p.max_hours,
    coalesce(a.current_open, 0) AS current_open
  FROM periodo p
  FULL OUTER JOIN abertas a ON a.stage = p.stage
$$;
