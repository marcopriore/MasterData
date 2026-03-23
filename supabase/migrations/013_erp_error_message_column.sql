-- Migration 013: Coluna erp_error_message para mensagens de erro da integração ERP

ALTER TABLE public.material_database ADD COLUMN IF NOT EXISTS erp_error_message TEXT;
