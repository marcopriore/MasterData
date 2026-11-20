-- 054: trava de duplicidade de solicitação feita no banco.
--
-- Antes, a aplicação baixava todos os materiais e solicitações do PDM para comparar em memória
-- (lib/erp/duplicate-guard.ts). Com PDMs grandes, isso era o gargalo da situação no ERP.
-- Agora a comparação roda aqui, com a mesma regra de lib/material-duplicates.ts:
--   - valor: texto minúsculo sem espaços das pontas; { value, unit } vira valor + unidade;
--   - só os atributos com includeInDescription = true, do PDM do material;
--   - o alvo precisa ter pelo menos um valor; os dois lados precisam ter exatamente os mesmos pares;
--   - materiais Obsoleto não contam; solicitações finalizadas, rejeitadas ou canceladas não contam;
--     a alteração aberta do próprio material não é duplicidade dele.
-- Quem chama é o servidor (service role). Usuário comum não executa a função.

-- ─── Valor de um atributo, normalizado ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dup_attr_norm_text(v jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN v IS NULL OR jsonb_typeof(v) = 'null' THEN NULL
    WHEN jsonb_typeof(v) = 'object' AND v ? 'value'
      THEN lower(btrim(coalesce(v ->> 'value', '') || coalesce(v ->> 'unit', '')))
    WHEN jsonb_typeof(v) IN ('string', 'number', 'boolean')
      THEN lower(btrim(v #>> '{}'))
    ELSE NULL  -- lista ou objeto sem 'value': a aplicação compara pelo texto do JS; aqui não casa
  END
$$;

-- ─── Atributos da descrição, normalizados (mesmo formato de pickDescriptionAttrs) ──
CREATE OR REPLACE FUNCTION public.dup_attrs_norm(p_attrs jsonb, p_keys text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(jsonb_object_agg(s.k, s.n) FILTER (WHERE s.n IS NOT NULL AND s.n <> ''), '{}'::jsonb)
  FROM (
    SELECT k, public.dup_attr_norm_text(p_attrs -> k) AS n
    FROM unnest(p_keys) AS t(k)
    WHERE jsonb_typeof(p_attrs) = 'object' AND p_attrs ? k
  ) s
$$;

-- ─── Códigos que duplicam um material pela trava de solicitação ─────────────
-- Retorna {} quando não há o que comparar. Os códigos seguem a regra da aplicação:
-- materiais primeiro ("MAT-1"), depois solicitações ("solicitação SOL-2").
CREATE OR REPLACE FUNCTION public.request_duplicate_codes(p_tenant_id integer, p_material_id integer)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_mat record;
  v_pdm_id integer;
  v_keys text[];
  v_target jsonb;
  v_codes text[];
BEGIN
  SELECT m.id, m.request_id, m.pdm_code, m.technical_attributes
    INTO v_mat
  FROM public.material_database m
  WHERE m.id = p_material_id AND m.tenant_id = p_tenant_id;
  IF NOT FOUND OR v_mat.request_id IS NULL OR coalesce(v_mat.pdm_code, '') = '' THEN
    RETURN '{}'::text[];
  END IF;

  SELECT p.id INTO v_pdm_id
  FROM public.pdm_templates p
  WHERE p.tenant_id = p_tenant_id AND p.internal_code = v_mat.pdm_code
  ORDER BY p.id DESC
  LIMIT 1;
  IF v_pdm_id IS NULL THEN
    RETURN '{}'::text[];
  END IF;

  -- Atributos que entram na descrição: id texto e includeInDescription = true.
  SELECT coalesce(array_agg(e.elem ->> 'id' ORDER BY e.elem ->> 'id'), '{}'::text[]) INTO v_keys
  FROM public.pdm_templates p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.attributes) = 'array' THEN p.attributes ELSE '[]'::jsonb END
  ) AS e(elem)
  WHERE p.id = v_pdm_id
    AND jsonb_typeof(e.elem) = 'object'
    AND jsonb_typeof(e.elem -> 'id') = 'string'
    AND (e.elem -> 'includeInDescription') = 'true'::jsonb;
  IF cardinality(v_keys) = 0 THEN
    RETURN '{}'::text[];
  END IF;

  v_target := public.dup_attrs_norm(v_mat.technical_attributes, v_keys);
  IF v_target = '{}'::jsonb THEN
    RETURN '{}'::text[];
  END IF;

  SELECT coalesce(array_agg(hit.code ORDER BY hit.src, hit.rid), '{}'::text[]) INTO v_codes
  FROM (
    -- Outros materiais do mesmo PDM (sem o próprio, sem obsoletos).
    SELECT 1 AS src, x.id AS rid, coalesce(x.id_sistema, '#' || x.id::text) AS code
    FROM public.material_database x
    WHERE x.tenant_id = p_tenant_id
      AND x.pdm_code = v_mat.pdm_code
      AND x.id <> v_mat.id
      AND btrim(coalesce(x.status, '')) <> 'Obsoleto'
      AND public.dup_attrs_norm(x.technical_attributes, v_keys) = v_target
    UNION ALL
    -- Solicitações abertas do mesmo PDM (sem a própria, sem a alteração do próprio material).
    SELECT 2, r.id, 'solicitação ' || coalesce(r.id_sistema, '#' || r.id::text)
    FROM public.material_requests r
    WHERE r.tenant_id = p_tenant_id
      AND r.pdm_id = v_pdm_id
      AND r.id <> v_mat.request_id
      AND (r.target_material_id IS NULL OR r.target_material_id <> v_mat.id)
      AND lower(coalesce(r.status, '')) NOT IN (
        'finalizado', 'completed', 'concluido', 'concluído', 'approved',
        'rejected', 'rejeitado', 'cancelado', 'cancelled')
      AND public.dup_attrs_norm(r.technical_attributes, v_keys) = v_target
  ) AS hit;

  RETURN v_codes;
END;
$$;

-- Só o servidor chama (service role). Usuário autenticado e anônimo não executam.
REVOKE ALL ON FUNCTION public.request_duplicate_codes(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_duplicate_codes(integer, integer) TO service_role;
