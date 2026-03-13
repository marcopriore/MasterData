-- Migration 001: Tabelas base do sistema
-- MDM PRO-MAT — Supabase: tenants, roles, users (profile vinculado a auth.users), measurement_units

-- ─── Tenants ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  max_description_length INTEGER DEFAULT 40 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.tenants IS 'Cliente (multi-tenant) — isolamento de dados';

-- ─── Unidades de medida (global, sem tenant_id) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.measurement_units (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  abbreviation VARCHAR(10) NOT NULL,
  category VARCHAR(30),
  is_active BOOLEAN DEFAULT true NOT NULL
);

COMMENT ON TABLE public.measurement_units IS 'Unidades de medida (MM, KG, etc.) — global';

-- ─── Roles (perfis de acesso por tenant) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.roles (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  role_type VARCHAR(20) NOT NULL DEFAULT 'sistema',
  permissions JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT uq_roles_tenant_name UNIQUE (tenant_id, name)
);

COMMENT ON COLUMN public.roles.role_type IS 'sistema | etapa | operacional';
COMMENT ON COLUMN public.roles.permissions IS 'JSON: can_approve, can_reject, can_edit_pdm, can_manage_users, etc.';

CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON public.roles(tenant_id);

-- ─── Users (PROFILE vinculado a auth.users) ───────────────────────────────────
-- id = auth.users.id (UUID); email e hashed_password gerenciados pelo Supabase Auth
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  preferences JSONB DEFAULT '{"theme":"light","language":"pt"}'::jsonb NOT NULL,
  max_description_length INTEGER DEFAULT 40,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.users IS 'Perfil do usuário — id referencia auth.users';

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON public.users(role_id);
