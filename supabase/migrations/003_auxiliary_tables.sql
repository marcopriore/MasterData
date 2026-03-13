-- Migration 003: Tabelas auxiliares
-- value_dictionary, field_dictionary, measurement_units (já em 001), products, notifications, user_notification_prefs, system_logs

-- ─── Value Dictionary (LOVs centralizados) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.value_dictionary (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  value VARCHAR(200) NOT NULL,
  abbreviation VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ,
  CONSTRAINT uq_value_dict_tenant_value UNIQUE (tenant_id, value)
);

CREATE INDEX IF NOT EXISTS idx_value_dictionary_tenant_id ON public.value_dictionary(tenant_id);

-- ─── Field Dictionary (campos ERP por tenant) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.field_dictionary (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(150) NOT NULL,
  sap_field VARCHAR(50),
  sap_view VARCHAR(50) NOT NULL,
  field_type VARCHAR(20) NOT NULL,
  options JSONB,
  responsible_role VARCHAR(50) NOT NULL,
  is_required BOOLEAN DEFAULT false NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  display_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_field_dictionary_tenant_id ON public.field_dictionary(tenant_id);

-- ─── Products (catálogo — sem tenant_id) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT
);

-- ─── Notifications (in-app) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id INTEGER REFERENCES public.material_requests(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message VARCHAR(500) NOT NULL,
  is_read BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON public.notifications(tenant_id);

-- ─── User Notification Prefs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_notification_prefs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  notify_request_created BOOLEAN DEFAULT true NOT NULL,
  notify_request_assigned BOOLEAN DEFAULT true NOT NULL,
  notify_request_approved BOOLEAN DEFAULT true NOT NULL,
  notify_request_rejected BOOLEAN DEFAULT true NOT NULL,
  notify_request_completed BOOLEAN DEFAULT true NOT NULL,
  email_request_created BOOLEAN DEFAULT true NOT NULL,
  email_request_assigned BOOLEAN DEFAULT true NOT NULL,
  email_request_approved BOOLEAN DEFAULT true NOT NULL,
  email_request_rejected BOOLEAN DEFAULT true NOT NULL,
  email_request_completed BOOLEAN DEFAULT true NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_notification_prefs_user_id ON public.user_notification_prefs(user_id);

-- ─── System Logs (auditoria) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.system_logs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  category VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL,
  event_data JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_id ON public.system_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at);
