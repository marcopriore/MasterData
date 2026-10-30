-- Migration 035: contagem de solicitações no banco para o painel inicial
-- Antes o painel lia todas as solicitações do tenant e contava no navegador; acima de 1000 linhas o
-- PostgREST corta e os números saíam errados. SECURITY INVOKER: a RLS vale (tenant em uso).
-- Pode rodar de novo.

CREATE OR REPLACE FUNCTION public.request_counts(p_user_id UUID DEFAULT NULL, p_status TEXT DEFAULT NULL)
RETURNS TABLE (status TEXT, urgency TEXT, total BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT lower(coalesce(r.status, '')), coalesce(r.urgency, ''), count(*)
  FROM public.material_requests r
  WHERE r.tenant_id = (SELECT public.get_user_tenant_id())
    AND (p_user_id IS NULL OR r.user_id = p_user_id)
    AND (p_status IS NULL OR lower(r.status) = lower(p_status))
  GROUP BY 1, 2
$$;

REVOKE EXECUTE ON FUNCTION public.request_counts(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_counts(UUID, TEXT) TO authenticated, service_role;
