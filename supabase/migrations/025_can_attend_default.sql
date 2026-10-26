-- Migration 025: can_attend em todo papel novo
-- A 008 só ligou a flag nos papéis que já existiam. Onboarding (create_tenant_onboarding),
-- o script da Empresa Demo e papéis criados depois nasciam sem a chave e não viam
-- "Iniciar atendimento". Papel que já traz a chave (tela de grupos) mantém o valor dele.

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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roles_default_can_attend ON public.roles;
CREATE TRIGGER trg_roles_default_can_attend
  BEFORE INSERT ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.roles_default_can_attend();

-- Papéis criados entre a 008 e esta migration
UPDATE public.roles
SET permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
  'can_attend',
  upper(trim(name)) IN ('ADMIN', 'CADASTRO', 'COMPRAS', 'MRP', 'FISCAL', 'CONTABILIDADE')
)
WHERE NOT (coalesce(permissions, '{}'::jsonb) ? 'can_attend');
