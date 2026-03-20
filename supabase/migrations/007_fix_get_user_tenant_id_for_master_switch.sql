-- Migration 007: Fix get_user_tenant_id para Switch Tenant do master
-- Quando master troca de tenant via switch-tenant, app_metadata.tenant_id é atualizado.
-- O RLS deve usar esse valor para filtrar dados do tenant "visualizado".

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS INTEGER AS $$
  SELECT COALESCE(
    -- Para master: usar tenant_id do JWT (alterado pelo switch-tenant), ou users.tenant_id se não houver
    CASE WHEN (auth.jwt() -> 'app_metadata' ->> 'is_master')::boolean = true
      THEN COALESCE(
        (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::integer,
        (SELECT tenant_id FROM public.users WHERE id = auth.uid())
      )
      ELSE NULL
    END,
    -- Para users normais: usar tenant_id da tabela users
    (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;
