-- Migration 042: histórico do material (Base de Dados → detalhe → Histórico)
-- material_history guarda os momentos do material, gravados por gatilho em material_database
-- (vale para tela, importação, API, aprovação da solicitação e ERP real ou simulado):
--   created     criação (data, origem, solicitação de origem)
--   status      mudança de status (Ativo, Bloqueado, Obsoleto)
--   erp         mudança da situação no ERP (pendente, integrando, integrado, erro) e código ERP
--   edited      alteração de campos (atributos, descrição, colunas do cadastro)
-- Quem fez: auth.uid() quando foi alguém logado; no servidor (service role) fica sem usuário.
-- Solicitante e atendentes vêm de request_history da solicitação de origem (a tela junta).
-- Backfill: criação de todo material existente e os eventos de ERP e de status já no log.
-- Leitura: tenant em uso e can_view_database. Ninguém grava nem altera pela API.
-- Pode rodar de novo.

CREATE TABLE IF NOT EXISTS public.material_history (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES public.material_database(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'status', 'erp', 'edited')),
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_history_material ON public.material_history (material_id, created_at DESC);

ALTER TABLE public.material_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "material_history_select" ON public.material_history;
CREATE POLICY "material_history_select" ON public.material_history FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND (SELECT public.user_has_permission('can_view_database')));
GRANT SELECT ON public.material_history TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.material_history FROM authenticated, anon;

-- Campos do cadastro que contam como edição (além dos atributos).
CREATE OR REPLACE FUNCTION public.material_edited_fields(p_old public.material_database, p_new public.material_database)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(array_agg(k ORDER BY k), '{}')
  FROM (
    SELECT key AS k
    FROM jsonb_each(coalesce(p_new.technical_attributes, '{}'::jsonb)) n
    WHERE n.value IS DISTINCT FROM coalesce(p_old.technical_attributes, '{}'::jsonb) -> n.key
    UNION
    SELECT key
    FROM jsonb_each(coalesce(p_old.technical_attributes, '{}'::jsonb)) o
    WHERE NOT (coalesce(p_new.technical_attributes, '{}'::jsonb) ? o.key)
    UNION
    SELECT c FROM unnest(ARRAY[
      CASE WHEN p_new.description IS DISTINCT FROM p_old.description THEN 'description' END,
      CASE WHEN p_new.detailed_description IS DISTINCT FROM p_old.detailed_description THEN 'detailed_description' END,
      CASE WHEN p_new.pdm_code IS DISTINCT FROM p_old.pdm_code THEN 'pdm_code' END,
      CASE WHEN p_new.material_type IS DISTINCT FROM p_old.material_type THEN 'material_type' END,
      CASE WHEN p_new.unit_of_measure IS DISTINCT FROM p_old.unit_of_measure THEN 'unit_of_measure' END,
      CASE WHEN p_new.material_group IS DISTINCT FROM p_old.material_group THEN 'material_group' END,
      CASE WHEN p_new.ncm IS DISTINCT FROM p_old.ncm THEN 'ncm' END
    ]) AS c
    WHERE c IS NOT NULL
  ) changed
$$;

CREATE OR REPLACE FUNCTION public.record_material_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_fields TEXT[];
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
    VALUES (NEW.tenant_id, NEW.id, 'edited', jsonb_build_object('fields', to_jsonb(v_fields)), v_user);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_material_history() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_record_material_history ON public.material_database;
CREATE TRIGGER trg_record_material_history
  AFTER INSERT OR UPDATE ON public.material_database
  FOR EACH ROW EXECUTE FUNCTION public.record_material_history();

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Criação de todo material que ainda não tem histórico.
INSERT INTO public.material_history (tenant_id, material_id, event_type, event_data, created_at)
SELECT m.tenant_id, m.id, 'created',
  jsonb_strip_nulls(jsonb_build_object('source', m.source, 'request_id', m.request_id, 'backfill', true)),
  m.created_at
FROM public.material_database m
WHERE NOT EXISTS (SELECT 1 FROM public.material_history h WHERE h.material_id = m.id);

-- Eventos de ERP já registrados no log do sistema (real e simulado).
INSERT INTO public.material_history (tenant_id, material_id, event_type, event_data, user_id, created_at)
SELECT l.tenant_id, m.id, 'erp',
  jsonb_strip_nulls(jsonb_build_object(
    'to', CASE l.action
      WHEN 'erp_integrated' THEN 'integrado_erp'
      WHEN 'erp_integration_failed' THEN 'erro_erp'
      WHEN 'erp_eliminated' THEN 'eliminado'
      WHEN 'erp_elimination_failed' THEN 'erro_eliminacao'
      WHEN 'erp_blocked_duplicate' THEN 'barrado_duplicidade'
    END,
    'id_erp', l.event_data ->> 'erp_code',
    'simulated', CASE WHEN l.description ILIKE '%simulação%' THEN true END,
    'backfill', true
  )),
  CASE WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = l.user_id) THEN l.user_id END,
  l.created_at
FROM public.system_logs l
JOIN public.material_database m
  ON m.tenant_id = l.tenant_id AND m.id::text = l.event_data ->> 'material_id'
WHERE l.action IN ('erp_integrated', 'erp_integration_failed', 'erp_eliminated', 'erp_elimination_failed', 'erp_blocked_duplicate')
  AND NOT EXISTS (
    SELECT 1 FROM public.material_history h
    WHERE h.material_id = m.id AND h.event_type = 'erp' AND h.created_at = l.created_at
  );

-- Mudanças de status em lote já no log.
INSERT INTO public.material_history (tenant_id, material_id, event_type, event_data, user_id, created_at)
SELECT l.tenant_id, m.id, 'status',
  jsonb_build_object('to', l.event_data ->> 'status', 'backfill', true),
  CASE WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = l.user_id) THEN l.user_id END,
  l.created_at
FROM public.system_logs l
CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(l.event_data -> 'updated_ids', '[]'::jsonb)) AS ids(material_id)
JOIN public.material_database m ON m.tenant_id = l.tenant_id AND m.id::text = ids.material_id
WHERE l.action = 'materials_status_bulk'
  AND NOT EXISTS (
    SELECT 1 FROM public.material_history h
    WHERE h.material_id = m.id AND h.event_type = 'status' AND h.created_at = l.created_at
  );
