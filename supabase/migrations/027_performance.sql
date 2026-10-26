-- Migration 027: desempenho
-- 1. RLS: get_user_tenant_id(), is_master_user() e auth.uid() eram avaliadas uma vez POR LINHA
--    (funções SECURITY DEFINER não são "inline"). Envolvidas em (SELECT ...), viram um initPlan
--    calculado uma vez por consulta. A regra de cada policy não muda, só a forma.
-- 2. Índices para as listas, filtros e buscas mais usadas.
-- 3. pdm_material_counts: contagem por PDM no banco (antes: todas as linhas no navegador,
--    cortadas em 1000 pelo PostgREST, então a contagem saía errada em base grande).
-- 4. material_duplicate_candidates: candidatos a duplicado só dos materiais da página.
-- Pode rodar de novo: policies já envolvidas são puladas; índices e funções usam IF NOT EXISTS / OR REPLACE.

-- ─── 1. Policies ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  v_using TEXT;
  v_check TEXT;
  v_sql TEXT;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    v_using := r.qual;
    v_check := r.with_check;

    IF v_using IS NOT NULL THEN
      IF v_using !~ 'SELECT\s+(public\.)?get_user_tenant_id\(\)' THEN
        v_using := regexp_replace(v_using, '(public\.)?get_user_tenant_id\(\)', '(SELECT public.get_user_tenant_id())', 'g');
      END IF;
      IF v_using !~ 'SELECT\s+(public\.)?is_master_user\(\)' THEN
        v_using := regexp_replace(v_using, '(public\.)?is_master_user\(\)', '(SELECT public.is_master_user())', 'g');
      END IF;
      IF v_using !~ 'SELECT\s+auth\.uid\(\)' THEN
        v_using := regexp_replace(v_using, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      END IF;
    END IF;

    IF v_check IS NOT NULL THEN
      IF v_check !~ 'SELECT\s+(public\.)?get_user_tenant_id\(\)' THEN
        v_check := regexp_replace(v_check, '(public\.)?get_user_tenant_id\(\)', '(SELECT public.get_user_tenant_id())', 'g');
      END IF;
      IF v_check !~ 'SELECT\s+(public\.)?is_master_user\(\)' THEN
        v_check := regexp_replace(v_check, '(public\.)?is_master_user\(\)', '(SELECT public.is_master_user())', 'g');
      END IF;
      IF v_check !~ 'SELECT\s+auth\.uid\(\)' THEN
        v_check := regexp_replace(v_check, 'auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      END IF;
    END IF;

    IF v_using IS DISTINCT FROM r.qual OR v_check IS DISTINCT FROM r.with_check THEN
      v_sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
      IF v_using IS NOT NULL THEN v_sql := v_sql || ' USING (' || v_using || ')'; END IF;
      IF v_check IS NOT NULL THEN v_sql := v_sql || ' WITH CHECK (' || v_check || ')'; END IF;
      EXECUTE v_sql;
    END IF;
  END LOOP;
END;
$$;

-- ─── 2. Índices ───────────────────────────────────────────────────────────────
-- Base de dados: lista por data, filtros de PDM e ERP, busca por descrição
CREATE INDEX IF NOT EXISTS idx_material_database_tenant_created ON public.material_database (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_database_tenant_pdm ON public.material_database (tenant_id, pdm_code);
CREATE INDEX IF NOT EXISTS idx_material_database_tenant_erp_status ON public.material_database (tenant_id, erp_status);
CREATE INDEX IF NOT EXISTS idx_material_database_request_id ON public.material_database (request_id);
CREATE INDEX IF NOT EXISTS idx_material_database_description_trgm ON public.material_database USING gin (description gin_trgm_ops);
-- Duplicidade: mesma descrição curta no PDM, ou mesma descrição detalhada (md5 porque o texto pode passar do limite do btree)
CREATE INDEX IF NOT EXISTS idx_material_database_dup_short
  ON public.material_database (tenant_id, lower(btrim(description)), pdm_code);
CREATE INDEX IF NOT EXISTS idx_material_database_dup_detailed
  ON public.material_database (tenant_id, md5(lower(btrim(detailed_description))))
  WHERE detailed_description IS NOT NULL AND btrim(detailed_description) <> '';

-- Solicitações: governança (por workflow), Minhas Solicitações e painel
CREATE INDEX IF NOT EXISTS idx_material_requests_workflow_created ON public.material_requests (workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_requests_tenant_user_created ON public.material_requests (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_requests_tenant_created ON public.material_requests (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_history_request_created ON public.request_history (request_id, created_at DESC);

-- Sino e log do sistema
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON public.notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_created ON public.system_logs (tenant_id, created_at DESC);

-- ─── 3. Contagem de materiais por PDM ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pdm_material_counts()
RETURNS TABLE (pdm_code TEXT, total BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT m.pdm_code::TEXT, count(*)::BIGINT
  FROM public.material_database m
  WHERE m.tenant_id = (SELECT public.get_user_tenant_id())
    AND m.pdm_code IS NOT NULL
  GROUP BY m.pdm_code
$$;

GRANT EXECUTE ON FUNCTION public.pdm_material_counts() TO authenticated;

-- ─── 4. Candidatos a duplicado ────────────────────────────────────────────────
-- Só localiza candidatos; a regra final (Obsoleto não conta etc.) continua em web/lib/material-duplicates.ts.
CREATE OR REPLACE FUNCTION public.material_duplicate_candidates(p_ids INTEGER[])
RETURNS TABLE (
  id INTEGER,
  id_sistema TEXT,
  description TEXT,
  detailed_description TEXT,
  pdm_code TEXT,
  status TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH alvo AS (
    SELECT t.tenant_id, t.description, t.detailed_description, t.pdm_code
    FROM public.material_database t
    WHERE t.id = ANY (p_ids)
  )
  SELECT DISTINCT m.id, m.id_sistema::TEXT, m.description::TEXT, m.detailed_description, m.pdm_code::TEXT, m.status::TEXT
  FROM alvo a
  JOIN public.material_database m ON m.tenant_id = a.tenant_id
  WHERE (
      a.detailed_description IS NOT NULL AND btrim(a.detailed_description) <> ''
      AND m.detailed_description IS NOT NULL AND btrim(m.detailed_description) <> ''
      AND md5(lower(btrim(m.detailed_description))) = md5(lower(btrim(a.detailed_description)))
    )
    OR (
      (a.detailed_description IS NULL OR btrim(a.detailed_description) = '')
      AND lower(btrim(m.description)) = lower(btrim(a.description))
      AND m.pdm_code IS NOT DISTINCT FROM a.pdm_code
    )
$$;

GRANT EXECUTE ON FUNCTION public.material_duplicate_candidates(INTEGER[]) TO authenticated;
