-- Migration 010: Inserir campos padrão SAP S/4HANA (MM03) no dicionário de campos

-- Tenant 1 (Master): inserir apenas se não existirem
INSERT INTO public.field_dictionary (
  tenant_id, field_name, field_label, erp_field, erp_view, field_type,
  responsible_role, is_required, is_active, display_order
)
SELECT 1, v.field_name, v.field_label, v.erp_field, v.erp_view, v.field_type,
  v.responsible_role, v.is_required, true, v.display_order
FROM (VALUES
  -- DADOS BÁSICOS (Visão: Dados Básicos 1 / Basic Data 1)
  ('descricao_basica'::text, 'Descrição Básica'::text, 'MAKTX'::text, 'Dados Básicos'::text, 'text'::text, 'CADASTRO'::text, true, 1),
  ('grupo_mercadorias', 'Grupo de Mercadorias', 'MATKL', 'Dados Básicos', 'select', 'CADASTRO', true, 2),
  ('unidade_medida_base', 'Unidade de Medida Base', 'MEINS', 'Dados Básicos', 'select', 'CADASTRO', true, 3),
  ('tipo_material', 'Tipo de Material', 'MTART', 'Dados Básicos', 'select', 'CADASTRO', true, 4),
  ('setor_industria', 'Setor da Indústria', 'MBRSH', 'Dados Básicos', 'select', 'CADASTRO', false, 5),
  ('peso_bruto', 'Peso Bruto', 'BRGEW', 'Dados Básicos', 'number', 'CADASTRO', false, 6),
  ('peso_liquido', 'Peso Líquido', 'NTGEW', 'Dados Básicos', 'number', 'CADASTRO', false, 7),
  ('unidade_peso', 'Unidade de Peso', 'GEWEI', 'Dados Básicos', 'select', 'CADASTRO', false, 8),
  ('tamanho_dimensao', 'Tamanho/Dimensão', 'GROES', 'Dados Básicos', 'text', 'CADASTRO', false, 9),
  ('norma_tecnica', 'Norma Técnica', 'NORMT', 'Dados Básicos', 'text', 'CADASTRO', false, 10),
  ('numero_desenho', 'Número do Desenho', 'ZEINR', 'Dados Básicos', 'text', 'CADASTRO', false, 11),

  -- COMPRAS (Visão: Compras / Purchasing)
  ('grupo_compras', 'Grupo de Compras', 'EKGRP', 'Compras', 'select', 'COMPRAS', true, 20),
  ('tipo_controle_preco', 'Tipo de Controle de Preço', 'VPRSV', 'Compras', 'select', 'COMPRAS', false, 21),
  ('prazo_entrega_previsto', 'Prazo de Entrega Previsto (dias)', 'PLIFZ', 'Compras', 'number', 'COMPRAS', false, 22),
  ('tolerancia_excesso', 'Tolerância de Excesso (%)', 'UEBTK', 'Compras', 'number', 'COMPRAS', false, 23),
  ('tolerancia_falta', 'Tolerância de Falta (%)', 'UNTTO', 'Compras', 'number', 'COMPRAS', false, 24),
  ('ultimo_preco', 'Último Preço', 'EFFPR', 'Compras', 'number', 'COMPRAS', false, 25),

  -- MRP (Visão: MRP 1, MRP 2)
  ('tipo_mrp', 'Tipo MRP', 'DISMM', 'MRP', 'select', 'MRP', true, 30),
  ('ponto_reposicao', 'Ponto de Reposição', 'MINBE', 'MRP', 'number', 'MRP', false, 31),
  ('estoque_seguranca', 'Estoque de Segurança', 'EISBE', 'MRP', 'number', 'MRP', false, 32),
  ('lote_minimo', 'Lote Mínimo', 'BSTMI', 'MRP', 'number', 'MRP', false, 33),
  ('lote_maximo', 'Lote Máximo', 'BSTMA', 'MRP', 'number', 'MRP', false, 34),
  ('tempo_reposicao', 'Tempo de Reposição (dias)', 'DZEIT', 'MRP', 'number', 'MRP', false, 35),
  ('tipo_suprimento', 'Tipo de Suprimento', 'BESKZ', 'MRP', 'select', 'MRP', false, 36),
  ('grupo_planejamento', 'Grupo de Planejamento', 'STRGR', 'MRP', 'select', 'MRP', false, 37),

  -- FISCAL (Visão: Dados Gerais de Planta / General Plant Data + Contabilidade)
  ('ncm', 'NCM (Nomenclatura Comum Mercosul)', 'J_1BNCM', 'Fiscal', 'text', 'FISCAL', true, 40),
  ('origem_material', 'Origem do Material', 'J_1BMATORIGIN', 'Fiscal', 'select', 'FISCAL', true, 41),
  ('icms', 'ICMS (%)', 'J_1BTAXRATE', 'Fiscal', 'number', 'FISCAL', false, 42),
  ('ipi', 'IPI (%)', 'J_1BIPI', 'Fiscal', 'number', 'FISCAL', false, 43),
  ('cfop_entrada', 'CFOP Entrada', 'J_1BCFOP', 'Fiscal', 'text', 'FISCAL', false, 44),
  ('cfop_saida', 'CFOP Saída', 'J_1BCFOPS', 'Fiscal', 'text', 'FISCAL', false, 45),
  ('codigo_servico', 'Código de Serviço', 'J_1BSRVCODE', 'Fiscal', 'text', 'FISCAL', false, 46),

  -- CONTABILIDADE (Visão: Contabilidade 1 / Accounting 1)
  ('classe_avaliacao', 'Classe de Avaliação', 'BKLAS', 'Contabilidade', 'select', 'CONTABILIDADE', true, 50),
  ('controle_preco', 'Controle de Preço', 'VPRSV', 'Contabilidade', 'select', 'CONTABILIDADE', true, 51),
  ('preco_padrao', 'Preço Padrão', 'STPRS', 'Contabilidade', 'number', 'CONTABILIDADE', false, 52),
  ('preco_medio_movel', 'Preço Médio Móvel', 'VERPR', 'Contabilidade', 'number', 'CONTABILIDADE', false, 53),
  ('centro_lucro', 'Centro de Lucro', 'PRCTR', 'Contabilidade', 'text', 'CONTABILIDADE', false, 54),
  ('conta_estoque', 'Conta de Estoque', 'KONTS', 'Contabilidade', 'text', 'CONTABILIDADE', false, 55),

  -- VENDAS (Visão: Vendas / Sales)
  ('grupo_materiais_vendas', 'Grupo de Materiais (Vendas)', 'MVGR1', 'Vendas', 'select', 'CADASTRO', false, 60),
  ('hierarquia_produto', 'Hierarquia de Produto', 'PRODH', 'Vendas', 'text', 'CADASTRO', false, 61),
  ('unidade_venda', 'Unidade de Venda', 'VRKME', 'Vendas', 'select', 'CADASTRO', false, 62)
) AS v(field_name, field_label, erp_field, erp_view, field_type, responsible_role, is_required, display_order)
WHERE EXISTS (SELECT 1 FROM public.tenants WHERE id = 1)
AND NOT EXISTS (
  SELECT 1 FROM public.field_dictionary fd WHERE fd.tenant_id = 1 AND fd.field_name = v.field_name
);

-- Copiar para tenant 2 (Empresa Demo) se existir
INSERT INTO public.field_dictionary (tenant_id, field_name, field_label, erp_field, erp_view, field_type, responsible_role, is_required, is_active, display_order)
SELECT 2, fd.field_name, fd.field_label, fd.erp_field, fd.erp_view, fd.field_type, fd.responsible_role, fd.is_required, fd.is_active, fd.display_order
FROM public.field_dictionary fd
WHERE fd.tenant_id = 1
AND EXISTS (SELECT 1 FROM public.tenants WHERE id = 2)
AND fd.field_name NOT IN (SELECT field_name FROM public.field_dictionary WHERE tenant_id = 2);
