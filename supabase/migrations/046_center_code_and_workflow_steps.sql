-- Migration 046:
-- 1. Código do centro com até 4 caracteres (padrão do ERP). Vale para qualquer gravação (tela,
--    script, service role). Se já houver centro com código maior, a migration para e lista os
--    códigos para corrigir antes.
-- 2. Etapa de workflow com solicitação em andamento não é excluída, desativada nem muda de chave
--    (a solicitação ficaria numa etapa que não existe). Configurações → Workflows agora exclui do
--    banco a etapa tirada da lista.
-- Pode rodar de novo.

DO $$
DECLARE
  v_long TEXT;
BEGIN
  SELECT string_agg(tenant_id || ':' || code, ', ') INTO v_long
  FROM public.centers
  WHERE char_length(code) > 4;
  IF v_long IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 046: centros com código maior que 4 caracteres (tenant:código): %', v_long;
  END IF;
END;
$$;

ALTER TABLE public.centers DROP CONSTRAINT IF EXISTS ck_centers_code_length;
ALTER TABLE public.centers ADD CONSTRAINT ck_centers_code_length CHECK (char_length(code) <= 4);

CREATE OR REPLACE FUNCTION public.normalize_center()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.code := upper(btrim(public.erp_text(NEW.code)));
  NEW.name := upper(btrim(public.erp_text(NEW.name)));
  IF NEW.code = '' OR NEW.name = '' THEN
    RAISE EXCEPTION 'Informe o código e o nome do centro' USING errcode = '23502';
  END IF;
  IF char_length(NEW.code) > 4 THEN
    RAISE EXCEPTION 'O código do centro tem até 4 caracteres' USING errcode = '22001';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Centro não muda de empresa' USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 2. Etapa com solicitação em andamento ───────────────────────────────────
-- Só para quem está logado: o servidor (limpeza de tenant, scripts) não passa por aqui.
CREATE OR REPLACE FUNCTION public.guard_workflow_step()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_open INTEGER;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE'
     AND NOT (OLD.is_active AND NOT NEW.is_active)
     AND lower(NEW.status_key) = lower(OLD.status_key)
     AND NEW.workflow_id = OLD.workflow_id THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO v_open
  FROM public.material_requests r
  WHERE r.workflow_id = OLD.workflow_id
    AND lower(r.status) = lower(OLD.status_key)
    AND NOT r.is_closed;
  IF v_open > 0 THEN
    RAISE EXCEPTION 'A etapa % tem % solicitação(ões) em andamento; mova-as de etapa antes de excluir, desativar ou mudar a chave', OLD.step_name, v_open
      USING errcode = '23503';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_workflow_step() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_workflow_step ON public.workflow_config;
CREATE TRIGGER trg_guard_workflow_step
  BEFORE UPDATE OR DELETE ON public.workflow_config
  FOR EACH ROW EXECUTE FUNCTION public.guard_workflow_step();
