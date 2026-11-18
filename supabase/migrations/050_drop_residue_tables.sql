-- Migration 050: tabelas sem uso
-- products (catálogo de exemplo, sem tenant_id) e request_values (valores da solicitação da versão
-- antiga; o fluxo grava technical_attributes) não são usadas pelo PRO-MAT.
-- Vazia: é apagada. Com dado: fica, mas ninguém lê nem grava pela API (só o servidor), e a migration
-- avisa quantas linhas tem para decidir depois.
-- Pode rodar de novo.

DO $$
DECLARE
  t TEXT;
  v_count BIGINT;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'request_values'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO v_count;
    IF v_count = 0 THEN
      EXECUTE format('DROP TABLE public.%I', t);
      RAISE NOTICE 'Migration 050: tabela % apagada (vazia)', t;
    ELSE
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
      RAISE NOTICE 'Migration 050: tabela % mantida com % linha(s), sem acesso pela API', t, v_count;
    END IF;
  END LOOP;
END;
$$;
