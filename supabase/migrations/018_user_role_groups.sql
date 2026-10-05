-- Grupos de perfil (vários por usuário) e permissões extras individuais.
-- users.role_id continua sendo o papel de etapa (um só).

CREATE TABLE IF NOT EXISTS public.user_role_groups (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_role_groups_role_id ON public.user_role_groups(role_id);

CREATE TABLE IF NOT EXISTS public.user_permission_grants (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  PRIMARY KEY (user_id, permission_key)
);

COMMENT ON TABLE public.user_role_groups IS 'Grupos de perfil do usuário. A permissão de tela é a união destes grupos.';
COMMENT ON TABLE public.user_permission_grants IS 'Permissão avulsa, além dos grupos. Não duplica flag que o grupo já cobre.';

INSERT INTO public.user_role_groups (user_id, role_id)
SELECT id, role_id FROM public.users
ON CONFLICT DO NOTHING;

ALTER TABLE public.user_role_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_role_groups_select" ON public.user_role_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_role_groups.user_id
        AND (u.tenant_id = public.get_user_tenant_id() OR public.is_master_user() OR u.id = auth.uid())
    )
  );

CREATE POLICY "user_permission_grants_select" ON public.user_permission_grants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_permission_grants.user_id
        AND (u.tenant_id = public.get_user_tenant_id() OR public.is_master_user() OR u.id = auth.uid())
    )
  );

GRANT SELECT ON public.user_role_groups TO authenticated;
GRANT SELECT ON public.user_permission_grants TO authenticated;
