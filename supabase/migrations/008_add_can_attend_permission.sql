-- Migration 008: Adicionar permissão can_attend para controle de "Iniciar Atendimento"
-- ADMIN e roles operacionais (CADASTRO, COMPRAS, MRP, FISCAL, CONTABILIDADE) podem atender
-- MASTER e SOLICITANTE não atendem (master só visualiza, solicitante cria solicitações)

UPDATE public.roles
SET permissions = permissions || '{"can_attend": true}'::jsonb
WHERE name IN ('ADMIN', 'CADASTRO', 'COMPRAS', 'MRP', 'FISCAL', 'CONTABILIDADE');

UPDATE public.roles
SET permissions = permissions || '{"can_attend": false}'::jsonb
WHERE name IN ('MASTER', 'SOLICITANTE');
