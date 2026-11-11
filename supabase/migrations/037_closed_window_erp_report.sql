-- Migration 037: volume da governança e relatório de integração com o ERP
-- 1. material_requests.is_closed: coluna gerada com is_closed_status(status) (migration 036), para a
--    governança trazer as abertas e só as fechadas recentes (stage_entered_at = quando fechou).
-- 2. report_erp_integrations: integrações, falhas, eliminações e bloqueios por dia, do log do sistema
--    (integração real e simulada). O log só é lido com can_view_logs; o relatório confere
--    can_view_reports e o tenant efetivo.
-- 3. report_erp_errors: materiais hoje com erro no ERP, agrupados pela mensagem.
-- Pode rodar de novo.

-- ─── 1. Fechada ou não ───────────────────────────────────────────────────────
ALTER TABLE public.material_requests
  ADD COLUMN IF NOT EXISTS is_closed BOOLEAN GENERATED ALWAYS AS (public.is_closed_status(status)) STORED;

CREATE INDEX IF NOT EXISTS idx_material_requests_tenant_closed_stage
  ON public.material_requests (tenant_id, is_closed, stage_entered_at DESC);

-- ─── 2. Integrações no período ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_erp_integrations(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (day DATE, action TEXT, simulated BOOLEAN, total BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant INTEGER := public.get_user_tenant_id();
BEGIN
  IF v_tenant IS NULL OR NOT public.user_has_permission('can_view_reports') THEN
    RAISE EXCEPTION 'Sem permissão para ver relatórios' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (l.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE AS day,
    l.action::TEXT,
    (l.description ILIKE '%simulação%') AS simulated,
    count(*)::BIGINT AS total
  FROM public.system_logs l
  WHERE l.tenant_id = v_tenant
    AND l.created_at >= p_from AND l.created_at < p_to
    AND l.action IN ('erp_integrated', 'erp_integration_failed', 'erp_eliminated', 'erp_elimination_failed', 'erp_blocked_duplicate')
  GROUP BY 1, 2, 3;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_erp_integrations(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_erp_integrations(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

-- ─── 3. Erros em aberto ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_erp_errors()
RETURNS TABLE (message TEXT, total BIGINT, last_update TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant INTEGER := public.get_user_tenant_id();
BEGIN
  IF v_tenant IS NULL OR NOT public.user_has_permission('can_view_reports') THEN
    RAISE EXCEPTION 'Sem permissão para ver relatórios' USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT
    coalesce(nullif(btrim(m.erp_error_message), ''), 'Sem mensagem')::TEXT AS message,
    count(*)::BIGINT AS total,
    max(coalesce(m.updated_at, m.created_at)) AS last_update
  FROM public.material_database m
  WHERE m.tenant_id = v_tenant
    AND m.erp_status = 'erro_erp'
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT 50;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.report_erp_errors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_erp_errors() TO authenticated, service_role;
