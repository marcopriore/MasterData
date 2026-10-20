-- Chamadas das APIs de material (sistemas externos e ERP). Sem corpo da requisição.

CREATE TABLE IF NOT EXISTS public.integration_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  system TEXT NOT NULL,
  action TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER,
  success BOOLEAN NOT NULL DEFAULT false,
  duration_ms INTEGER,
  error_message TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_tenant_created
  ON public.integration_logs (tenant_id, created_at DESC);

ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integration_logs_tenant_read" ON public.integration_logs
  FOR SELECT USING (
    tenant_id = get_user_tenant_id() OR is_master_user()
  );

GRANT SELECT ON public.integration_logs TO authenticated;
