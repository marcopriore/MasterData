-- Migration 024: Limite de chamadas das APIs de material
-- O servidor conta as chamadas do último minuto por chave em integration_logs.

CREATE INDEX IF NOT EXISTS idx_integration_logs_client_created
  ON public.integration_logs (api_client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_logs_unauthenticated
  ON public.integration_logs (created_at DESC)
  WHERE api_client_id IS NULL AND direction = 'inbound';
