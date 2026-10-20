-- Migration 022: Várias integrações de saída para o ERP por tenant
-- Substitui tenant_erp_settings (021), que guardava uma só. O que estiver lá vira a integração de criação.
-- O segredo continua cifrado pelo servidor com INTEGRATION_SECRET_KEY. Só o service role lê a tabela.

CREATE TABLE IF NOT EXISTS public.tenant_erp_connections (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  operation VARCHAR(30) NOT NULL,
  http_method VARCHAR(10) NOT NULL,
  endpoint_url TEXT NOT NULL,
  timeout_ms INTEGER NOT NULL DEFAULT 15000,
  auth_type VARCHAR(30) NOT NULL DEFAULT 'none',
  auth_header_name VARCHAR(100),
  auth_username VARCHAR(200),
  auth_token_url TEXT,
  auth_scope VARCHAR(500),
  secret_ciphertext TEXT,
  secret_updated_at TIMESTAMPTZ,
  payload_format VARCHAR(30) NOT NULL DEFAULT 'erp_json_v1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT tenant_erp_connections_operation_check
    CHECK (operation IN ('criar_material', 'alterar_material', 'eliminar_material')),
  CONSTRAINT tenant_erp_connections_method_check
    CHECK (http_method IN ('POST', 'PATCH', 'DELETE', 'GET')),
  CONSTRAINT tenant_erp_connections_auth_type_check
    CHECK (auth_type IN ('none', 'api_key', 'bearer', 'basic', 'oauth2_client_credentials')),
  CONSTRAINT tenant_erp_connections_payload_format_check
    CHECK (payload_format IN ('erp_json_v1')),
  CONSTRAINT tenant_erp_connections_timeout_check
    CHECK (timeout_ms BETWEEN 1000 AND 60000)
);

COMMENT ON COLUMN public.tenant_erp_connections.endpoint_url IS 'Aceita {id_erp} e {id_sistema}, trocados pelo código do material na chamada';
COMMENT ON COLUMN public.tenant_erp_connections.auth_username IS 'basic: usuário; oauth2_client_credentials: client_id';
COMMENT ON COLUMN public.tenant_erp_connections.secret_ciphertext IS 'AES-256-GCM, formato v1:iv:tag:dados (base64)';

CREATE INDEX IF NOT EXISTS idx_tenant_erp_connections_tenant ON public.tenant_erp_connections (tenant_id);

-- Uma integração ativa por operação, para o PRO-MAT saber qual chamar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_erp_connections_active_operation
  ON public.tenant_erp_connections (tenant_id, operation)
  WHERE is_active;

ALTER TABLE public.tenant_erp_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_erp_connections FROM anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.tenant_erp_settings') IS NOT NULL THEN
    INSERT INTO public.tenant_erp_connections (
      tenant_id, name, operation, http_method, endpoint_url, timeout_ms,
      auth_type, auth_header_name, auth_username, auth_token_url, auth_scope,
      secret_ciphertext, secret_updated_at, payload_format, is_active, updated_at, updated_by
    )
    SELECT
      s.tenant_id, 'Criação de material', 'criar_material', 'POST', s.base_url, s.timeout_ms,
      s.auth_type, s.auth_header_name, s.auth_username, s.auth_token_url, s.auth_scope,
      s.secret_ciphertext, s.secret_updated_at, s.payload_format, s.is_enabled, s.updated_at, s.updated_by
    FROM public.tenant_erp_settings s
    WHERE COALESCE(trim(s.base_url), '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_erp_connections c
        WHERE c.tenant_id = s.tenant_id AND c.operation = 'criar_material'
      );

    DROP TABLE public.tenant_erp_settings;
  END IF;
END $$;
