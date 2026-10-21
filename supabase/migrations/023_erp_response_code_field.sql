-- Migration 023: Onde o código do material vem na resposta do ERP, por integração.
-- Caminho com pontos e índices: productId, data.productId, items.0.id.

ALTER TABLE public.tenant_erp_connections
  ADD COLUMN IF NOT EXISTS response_code_field VARCHAR(200) NOT NULL DEFAULT 'productId';

COMMENT ON COLUMN public.tenant_erp_connections.response_code_field IS
  'Caminho do código do material na resposta JSON do ERP (ex.: productId, data.productId, items.0.id)';
