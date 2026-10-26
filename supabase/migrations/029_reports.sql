-- Migration 029: tela de Relatórios
-- Três consultas agregadas, sempre no tenant efetivo (SECURITY INVOKER: a RLS também vale).
-- Permissão nova can_view_reports: ligada em ADMIN e MASTER, inclusive em papel criado depois
-- (o gatilho da 025 passa a cuidar das duas chaves).

-- ─── Permissão ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.roles_default_can_attend()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.permissions := coalesce(NEW.permissions, '{}'::jsonb);
  IF NOT (NEW.permissions ? 'can_attend') THEN
    NEW.permissions := NEW.permissions || jsonb_build_object(
      'can_attend',
      upper(trim(NEW.name)) IN ('ADMIN', 'CADASTRO', 'COMPRAS', 'MRP', 'FISCAL', 'CONTABILIDADE')
    );
  END IF;
  IF NOT (NEW.permissions ? 'can_view_reports') THEN
    NEW.permissions := NEW.permissions || jsonb_build_object(
      'can_view_reports',
      upper(trim(NEW.name)) IN ('ADMIN', 'MASTER')
    );
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.roles
SET permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
  'can_view_reports',
  upper(trim(name)) IN ('ADMIN', 'MASTER')
)
WHERE NOT (coalesce(permissions, '{}'::jsonb) ? 'can_view_reports');

-- ─── Fluxo: quantas entraram em cada etapa no período, tempo médio e quantas estão lá agora ─
-- Entrar numa etapa = evento created, approved, stage_change, resubmitted ou rejected com a etapa.
-- Sair = próximo desses eventos da mesma solicitação; quem ainda está na etapa conta até agora.
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
      AND h.event_type IN ('created', 'approved', 'stage_change', 'resubmitted', 'rejected')
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
      AND e.stage NOT IN ('finalizado', 'completed', 'concluído', 'concluido', 'rejected', 'rejeitado')
    GROUP BY e.stage
  ),
  abertas AS (
    SELECT lower(r.status) AS stage, count(*)::BIGINT AS current_open
    FROM public.material_requests r, tenant t
    WHERE r.tenant_id = t.id
      AND lower(r.status) NOT IN ('finalizado', 'completed', 'concluído', 'concluido', 'rejected', 'rejeitado')
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

-- ─── Produtividade: decisões de cada pessoa no período ────────────────────────
-- Tempo de decisão = do "Iniciou atendimento" da própria pessoa até aprovar ou rejeitar.
CREATE OR REPLACE FUNCTION public.report_productivity(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  role_name TEXT,
  attended BIGINT,
  approved BIGINT,
  rejected BIGINT,
  moved BIGINT,
  avg_decision_hours NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH tenant AS (SELECT public.get_user_tenant_id() AS id),
  acoes AS (
    SELECT h.*
    FROM public.request_history h, tenant t
    WHERE h.tenant_id = t.id
      AND h.user_id IS NOT NULL
      AND h.created_at >= p_from AND h.created_at < p_to
      AND h.event_type IN ('assigned', 'approved', 'rejected', 'stage_change')
  ),
  decisoes AS (
    SELECT
      d.user_id,
      extract(epoch FROM (d.created_at - (
        SELECT max(a.created_at)
        FROM public.request_history a
        WHERE a.request_id = d.request_id
          AND a.user_id = d.user_id
          AND a.event_type = 'assigned'
          AND a.created_at <= d.created_at
      ))) / 3600 AS hours
    FROM acoes d
    WHERE d.event_type IN ('approved', 'rejected')
  )
  SELECT
    u.id AS user_id,
    u.name::TEXT AS user_name,
    r.name::TEXT AS role_name,
    count(*) FILTER (WHERE a.event_type = 'assigned')::BIGINT AS attended,
    count(*) FILTER (WHERE a.event_type = 'approved')::BIGINT AS approved,
    count(*) FILTER (WHERE a.event_type = 'rejected')::BIGINT AS rejected,
    count(*) FILTER (WHERE a.event_type = 'stage_change')::BIGINT AS moved,
    (SELECT round(avg(dd.hours)::NUMERIC, 1) FROM decisoes dd WHERE dd.user_id = u.id AND dd.hours IS NOT NULL) AS avg_decision_hours
  FROM acoes a
  JOIN public.users u ON u.id = a.user_id
  LEFT JOIN public.roles r ON r.id = u.role_id
  GROUP BY u.id, u.name, r.name
$$;

-- ─── Base de materiais por PDM: status, situação no ERP e duplicados ──────────
-- Duplicado segue web/lib/material-duplicates.ts: mesma detalhada, ou sem detalhada a mesma curta no PDM;
-- Obsoleto não conta.
CREATE OR REPLACE FUNCTION public.report_material_base()
RETURNS TABLE (
  pdm_code TEXT,
  pdm_name TEXT,
  total BIGINT,
  ativos BIGINT,
  bloqueados BIGINT,
  obsoletos BIGINT,
  pendente_erp BIGINT,
  integrados BIGINT,
  erro_erp BIGINT,
  duplicados BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH tenant AS (SELECT public.get_user_tenant_id() AS id),
  base AS (
    SELECT
      m.*,
      CASE
        WHEN m.status = 'Obsoleto' THEN NULL
        WHEN m.detailed_description IS NOT NULL AND btrim(m.detailed_description) <> ''
          THEN 'd:' || md5(lower(btrim(m.detailed_description)))
        WHEN m.description IS NOT NULL AND btrim(m.description) <> ''
          THEN 's:' || lower(btrim(m.description)) || '|' || coalesce(m.pdm_code, '')
        ELSE NULL
      END AS dup_key
    FROM public.material_database m, tenant t
    WHERE m.tenant_id = t.id
  ),
  marcados AS (
    SELECT b.*, CASE WHEN b.dup_key IS NULL THEN false ELSE count(*) OVER (PARTITION BY b.dup_key) > 1 END AS is_dup
    FROM base b
  )
  SELECT
    coalesce(m.pdm_code, '')::TEXT AS pdm_code,
    coalesce(max(m.pdm_name), '(sem PDM)')::TEXT AS pdm_name,
    count(*)::BIGINT AS total,
    count(*) FILTER (WHERE m.status = 'Ativo')::BIGINT AS ativos,
    count(*) FILTER (WHERE m.status = 'Bloqueado')::BIGINT AS bloqueados,
    count(*) FILTER (WHERE m.status = 'Obsoleto')::BIGINT AS obsoletos,
    count(*) FILTER (WHERE m.erp_status = 'pendente_erp')::BIGINT AS pendente_erp,
    count(*) FILTER (WHERE m.erp_status IN ('integrado', 'integrado_erp'))::BIGINT AS integrados,
    count(*) FILTER (WHERE m.erp_status = 'erro_erp')::BIGINT AS erro_erp,
    count(*) FILTER (WHERE m.is_dup)::BIGINT AS duplicados
  FROM marcados m
  GROUP BY coalesce(m.pdm_code, '')
$$;

GRANT EXECUTE ON FUNCTION public.report_request_flow(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_productivity(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_material_base() TO authenticated;
