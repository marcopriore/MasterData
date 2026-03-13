-- Migration 002: Tabelas de negócio
-- PDM templates, material_requests, workflow, request_values, request_history, request_attachments, material_database

-- ─── Workflow Header ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workflow_header (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_header_tenant_id ON public.workflow_header(tenant_id);

-- ─── Workflow Config (etapas por workflow) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workflow_config (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id INTEGER NOT NULL REFERENCES public.workflow_header(id) ON DELETE CASCADE,
  step_name VARCHAR(100) NOT NULL,
  status_key VARCHAR(50) NOT NULL,
  "order" INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_config_workflow_id ON public.workflow_config(workflow_id);

-- ─── PDM Templates ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pdm_templates (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  internal_code VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  attributes JSONB,
  CONSTRAINT uq_pdm_templates_tenant_internal_code UNIQUE (tenant_id, internal_code)
);

COMMENT ON COLUMN public.pdm_templates.attributes IS 'Array de atributos PDM (id, name, dataType, allowedValues, etc.)';

CREATE INDEX IF NOT EXISTS idx_pdm_templates_tenant_id ON public.pdm_templates(tenant_id);

-- ─── Material Requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_requests (
  id SERIAL PRIMARY KEY,
  id_sistema VARCHAR(20) UNIQUE,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pdm_id INTEGER NOT NULL REFERENCES public.pdm_templates(id) ON DELETE RESTRICT,
  workflow_id INTEGER NOT NULL REFERENCES public.workflow_header(id) ON DELETE RESTRICT,
  status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  erp_material_code VARCHAR(50),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  requester VARCHAR(200) NOT NULL,
  cost_center VARCHAR(100),
  urgency VARCHAR(20) NOT NULL DEFAULT 'low',
  justification TEXT,
  generated_description TEXT,
  technical_attributes JSONB,
  attachments JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  assigned_to_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_material_requests_tenant_id ON public.material_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_status ON public.material_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_material_requests_id_sistema ON public.material_requests(id_sistema);
CREATE INDEX IF NOT EXISTS idx_material_requests_user_id ON public.material_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_assigned_to ON public.material_requests(assigned_to_id);

-- ─── Request Values (valores por fase) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.request_values (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES public.material_requests(id) ON DELETE CASCADE,
  attribute_id VARCHAR(100) NOT NULL,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_values_request_id ON public.request_values(request_id);

-- ─── Request History ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.request_history (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id INTEGER NOT NULL REFERENCES public.material_requests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  message VARCHAR(500) NOT NULL,
  event_data JSONB,
  stage VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_history_request_id ON public.request_history(request_id);

-- ─── Request Attachments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.request_attachments (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES public.material_requests(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100),
  file_size INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_attachments_request_id ON public.request_attachments(request_id);

-- ─── Material Database (cadastro ERP) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_database (
  id SERIAL PRIMARY KEY,
  id_sistema VARCHAR(20) UNIQUE,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id_erp VARCHAR(50),
  description VARCHAR(200) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Ativo',
  pdm_code VARCHAR(50),
  pdm_name VARCHAR(100),
  technical_attributes JSONB,
  material_group VARCHAR(100),
  unit_of_measure VARCHAR(20),
  ncm VARCHAR(20),
  material_type VARCHAR(100),
  gross_weight DOUBLE PRECISION,
  net_weight DOUBLE PRECISION,
  cfop VARCHAR(20),
  origin VARCHAR(100),
  purchase_group VARCHAR(100),
  lead_time INTEGER,
  mrp_type VARCHAR(100),
  min_stock DOUBLE PRECISION,
  max_stock DOUBLE PRECISION,
  valuation_class VARCHAR(100),
  valuation_group VARCHAR(100),
  standard_price DOUBLE PRECISION,
  profit_center VARCHAR(100),
  sales_org VARCHAR(100),
  distribution_channel VARCHAR(100),
  sales_unit VARCHAR(20),
  order_unit VARCHAR(20),
  delivery_tolerance INTEGER,
  preferred_supplier VARCHAR(100),
  mrp_controller VARCHAR(100),
  lot_size DOUBLE PRECISION,
  forecast_profile VARCHAR(100),
  cst_ipi VARCHAR(20),
  cst_pis_cofins VARCHAR(100),
  stock_account VARCHAR(100),
  price_control VARCHAR(100),
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  erp_status VARCHAR(20),
  erp_integrated_at TIMESTAMPTZ,
  standardized_at TIMESTAMPTZ,
  standardized_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ,
  CONSTRAINT uq_material_db_tenant_id_erp UNIQUE (tenant_id, id_erp)
);

CREATE INDEX IF NOT EXISTS idx_material_database_tenant_id ON public.material_database(tenant_id);
CREATE INDEX IF NOT EXISTS idx_material_database_id_erp ON public.material_database(id_erp);
CREATE INDEX IF NOT EXISTS idx_material_database_id_sistema ON public.material_database(id_sistema);
