-- Migration 021: Configuração da saída para o ERP, por tenant
-- O segredo (chave, token, senha ou client secret) é gravado cifrado pelo servidor
-- com INTEGRATION_SECRET_KEY. Só o service role lê esta tabela.

CREATE TABLE IF NOT EXISTS public.tenant_erp_settings (
  tenant_id INTEGER PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  base_url TEXT,
  auth_type VARCHAR(30) NOT NULL DEFAULT 'none',
  auth_header_name VARCHAR(100),
  auth_username VARCHAR(200),
  auth_token_url TEXT,
  auth_scope VARCHAR(500),
  secret_ciphertext TEXT,
  secret_updated_at TIMESTAMPTZ,
  payload_format VARCHAR(30) NOT NULL DEFAULT 'erp_json_v1',
  timeout_ms INTEGER NOT NULL DEFAULT 15000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT tenant_erp_settings_auth_type_check
    CHECK (auth_type IN ('none', 'api_key', 'bearer', 'basic', 'oauth2_client_credentials')),
  CONSTRAINT tenant_erp_settings_payload_format_check
    CHECK (payload_format IN ('erp_json_v1')),
  CONSTRAINT tenant_erp_settings_timeout_check
    CHECK (timeout_ms BETWEEN 1000 AND 60000)
);

COMMENT ON COLUMN public.tenant_erp_settings.auth_header_name IS 'api_key: nome do header (ex.: x-api-key)';
COMMENT ON COLUMN public.tenant_erp_settings.auth_username IS 'basic: usuário; oauth2_client_credentials: client_id';
COMMENT ON COLUMN public.tenant_erp_settings.secret_ciphertext IS 'AES-256-GCM, formato v1:iv:tag:dados (base64)';

ALTER TABLE public.tenant_erp_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_erp_settings FROM anon, authenticated;
