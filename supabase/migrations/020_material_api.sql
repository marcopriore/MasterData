-- Migration 020: APIs de material
-- Requer 019 (integration_logs).
-- 1. Blocos do JSON do ERP guardados no material
-- 2. Bloco do ERP em que cada campo do dicionário entra
-- 3. Chaves de API por empresa (sistemas externos)
-- 4. Origem da solicitação e do material
-- 5. api_insert_material: criação via API com código MDM-######

-- ─── 1. Blocos do material ───────────────────────────────────────────────────
ALTER TABLE public.material_database
  ADD COLUMN IF NOT EXISTS eans JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sales JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS site JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS characteristics JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS additional_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.material_database.eans IS '[{category, code}]';
COMMENT ON COLUMN public.material_database.dimensions IS '[{name, quantity, unit}]';
COMMENT ON COLUMN public.material_database.sales IS '[{chave ERP: valor}] — uma linha por organização e canal';
COMMENT ON COLUMN public.material_database.site IS '{chave ERP: valor} — centro e centro de lucro';
COMMENT ON COLUMN public.material_database.characteristics IS '[{name, value}] — o mesmo name pode repetir';
COMMENT ON COLUMN public.material_database.additional_fields IS '{chave ERP: valor} — campos do cabeçalho do ERP sem coluna própria';

-- ─── 2. Bloco do ERP no dicionário ───────────────────────────────────────────
ALTER TABLE public.field_dictionary
  ADD COLUMN IF NOT EXISTS erp_block VARCHAR(30);

ALTER TABLE public.field_dictionary
  DROP CONSTRAINT IF EXISTS field_dictionary_erp_block_check;
ALTER TABLE public.field_dictionary
  ADD CONSTRAINT field_dictionary_erp_block_check
  CHECK (erp_block IS NULL OR erp_block IN ('header', 'site', 'characteristics'));

COMMENT ON COLUMN public.field_dictionary.erp_block IS
  'Bloco do JSON do ERP: header, site ou characteristics. NULL = characteristics.';

-- ─── 3. Chaves de API ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_clients (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,
  key_prefix VARCHAR(16) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_clients_tenant ON public.api_clients (tenant_id);

-- Só o servidor (service role) lê e grava. O hash nunca vai para o browser.
ALTER TABLE public.api_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_clients FROM anon, authenticated;

-- ─── 4. Origem ───────────────────────────────────────────────────────────────
ALTER TABLE public.material_requests
  ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NOT NULL DEFAULT 'interno',
  ADD COLUMN IF NOT EXISTS api_client_id INTEGER REFERENCES public.api_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_reference VARCHAR(100);

ALTER TABLE public.material_requests
  DROP CONSTRAINT IF EXISTS material_requests_origin_check;
ALTER TABLE public.material_requests
  ADD CONSTRAINT material_requests_origin_check CHECK (origin IN ('interno', 'externo'));

ALTER TABLE public.material_database
  ADD COLUMN IF NOT EXISTS api_client_id INTEGER REFERENCES public.api_clients(id) ON DELETE SET NULL;

ALTER TABLE public.integration_logs
  ADD COLUMN IF NOT EXISTS api_client_id INTEGER REFERENCES public.api_clients(id) ON DELETE SET NULL;

-- ─── 5. Criação de material via API ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.api_insert_material(p_tenant_id INTEGER, p_row JSONB)
RETURNS public.material_database AS $$
DECLARE
  v_seq INTEGER;
  v_row public.material_database;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('material_database.id_sistema'));

  SELECT COALESCE(MAX(
    NULLIF(REGEXP_REPLACE(id_sistema, '[^0-9]', '', 'g'), '')::integer
  ), 0) + 1 INTO v_seq
  FROM public.material_database
  WHERE id_sistema ~ '^MDM-[0-9]+$';

  v_row := jsonb_populate_record(NULL::public.material_database, p_row);
  v_row.id := nextval(pg_get_serial_sequence('public.material_database', 'id'));
  v_row.tenant_id := p_tenant_id;
  v_row.id_sistema := 'MDM-' || LPAD(v_seq::text, 6, '0');
  v_row.id_erp := NULL;
  v_row.erp_status := 'pendente_erp';
  v_row.erp_integrated_at := NULL;
  v_row.erp_error_message := NULL;
  v_row.source := 'api';
  v_row.status := COALESCE(v_row.status, 'Ativo');
  v_row.eans := COALESCE(v_row.eans, '[]'::jsonb);
  v_row.dimensions := COALESCE(v_row.dimensions, '[]'::jsonb);
  v_row.sales := COALESCE(v_row.sales, '[]'::jsonb);
  v_row.site := COALESCE(v_row.site, '{}'::jsonb);
  v_row.characteristics := COALESCE(v_row.characteristics, '[]'::jsonb);
  v_row.additional_fields := COALESCE(v_row.additional_fields, '{}'::jsonb);
  v_row.created_at := now();
  v_row.updated_at := NULL;

  INSERT INTO public.material_database SELECT (v_row).*;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.api_insert_material(INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_insert_material(INTEGER, JSONB) TO service_role;
