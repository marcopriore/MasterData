ALTER TABLE public.material_database
  ADD COLUMN IF NOT EXISTS detailed_description TEXT;

COMMENT ON COLUMN public.material_database.detailed_description IS
  'Descrição detalhada gerada automaticamente: PDM + atributos técnicos';
