-- Migration 004: Row Level Security (RLS)
-- Funções helper e policies para isolamento multi-tenant

-- ─── Função: obter tenant_id do usuário logado ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS INTEGER AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Função: verificar se é usuário master ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_master_user()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_master')::boolean,
    false
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Tabelas com tenant_id: isolamento por tenant ────────────────────────────

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants_tenant_isolation" ON public.tenants
  FOR ALL USING (
    id = get_user_tenant_id() OR is_master_user()
  );

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_tenant_isolation" ON public.roles
  FOR ALL USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- Usuário vê apenas outros do mesmo tenant
CREATE POLICY "users_tenant_isolation" ON public.users
  FOR ALL USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

ALTER TABLE public.workflow_header ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_header_tenant_isolation" ON public.workflow_header
  FOR ALL USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

ALTER TABLE public.workflow_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_config_tenant_isolation" ON public.workflow_config
  FOR ALL USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

ALTER TABLE public.pdm_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pdm_templates_tenant_isolation" ON public.pdm_templates
  FOR ALL USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_requests_tenant_isolation" ON public.material_requests
  FOR ALL USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

-- request_values: via material_requests
ALTER TABLE public.request_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "request_values_via_request" ON public.request_values
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.material_requests mr
      WHERE mr.id = request_values.request_id
        AND (mr.tenant_id = get_user_tenant_id() OR is_master_user())
    )
  );

ALTER TABLE public.request_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "request_history_tenant_isolation" ON public.request_history
  FOR ALL USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

-- request_attachments: via material_requests
ALTER TABLE public.request_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "request_attachments_via_request" ON public.request_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.material_requests mr
      WHERE mr.id = request_attachments.request_id
        AND (mr.tenant_id = get_user_tenant_id() OR is_master_user())
    )
  );

ALTER TABLE public.material_database ENABLE ROW LEVEL SECURITY;
CREATE POLICY "material_database_tenant_isolation" ON public.material_database
  FOR ALL USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

ALTER TABLE public.value_dictionary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "value_dictionary_tenant_isolation" ON public.value_dictionary
  FOR ALL USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

ALTER TABLE public.field_dictionary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "field_dictionary_tenant_isolation" ON public.field_dictionary
  FOR ALL USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_tenant_isolation" ON public.notifications
  FOR ALL USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

ALTER TABLE public.user_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_notification_prefs_tenant_isolation" ON public.user_notification_prefs
  FOR ALL USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_logs_tenant_isolation" ON public.system_logs
  FOR ALL USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

-- ─── Tabelas sem tenant_id: leitura para usuários autenticados ───────────────

ALTER TABLE public.measurement_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "measurement_units_authenticated_read" ON public.measurement_units
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "measurement_units_service_role_all" ON public.measurement_units
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_authenticated_read" ON public.products
  FOR SELECT USING (auth.role() = 'authenticated');
