-- Migration 041: Tipo de Material não muda em material já cadastrado
-- O ERP não permite trocar o tipo de um material existente. Vale para qualquer gravação (tela,
-- importação, API, scripts): uma vez definido, o tipo fica. Material antigo sem tipo pode receber o
-- primeiro valor. O tipo é lido como nas regras (material_rule_attributes, migration 040): atributo
-- tipo_material ou, vazio, a coluna material_type; comparado sem acento e sem diferença de maiúscula.
-- Pode rodar de novo.

CREATE OR REPLACE FUNCTION public.guard_material_type_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_old TEXT := public.field_rule_value(public.material_rule_attributes(OLD) ->> 'tipo_material');
  v_new TEXT := public.field_rule_value(public.material_rule_attributes(NEW) ->> 'tipo_material');
BEGIN
  IF v_old IS NOT NULL AND v_new IS DISTINCT FROM v_old THEN
    RAISE EXCEPTION 'O Tipo de Material de um material já cadastrado não pode ser alterado (o ERP não permite)'
      USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_material_type_lock() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_material_type_lock ON public.material_database;
CREATE TRIGGER trg_guard_material_type_lock
  BEFORE UPDATE ON public.material_database
  FOR EACH ROW EXECUTE FUNCTION public.guard_material_type_lock();
