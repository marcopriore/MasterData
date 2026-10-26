-- Migration 030: texto no padrão do ERP e código do PDM
-- 1. erp_text / erp_jsonb: mesma regra de web/lib/erp-text.ts (sem acento, sem "ç", só ASCII de uma lista fechada).
-- 2. Limpa o que já estava gravado: materiais, solicitações, PDMs e dicionário de valores.
--    Antes, as descrições perdem os "[ABREV]" de atributo vazio (sem colchete, viraria texto de valor).
-- 3. PDM: código no padrão 4 letras + 3 dígitos (PARA001) para quem está fora dele, com os materiais
--    acompanhando o código novo; nome repetido no tenant ganha " 2", " 3" no mais recente.
-- 4. Travas: código com até 10 caracteres (A-Z 0-9 - _) e nome único por tenant.
-- Pode rodar de novo: só mexe no que ainda está fora do padrão.

-- ─── 1. Funções ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.erp_text(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE
    regexp_replace(
      translate(
        replace(replace(replace(replace(replace(replace(replace(replace(replace(p,
          chr(13) || chr(10), chr(10)), chr(13), chr(10)),
          '½', '1/2'), '¼', '1/4'), '¾', '3/4'), '…', '...'), 'Æ', 'AE'), 'æ', 'ae'), 'ß', 'SS'),
        -- o "°" no fim não tem par em "to": translate remove
        'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿªº²³¹×÷µØø“”″‘’′–—−' || chr(160) || chr(9) || '°',
        'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyyAO231X/UOo"""''''''---  '
      ),
      '[^A-Za-z0-9 ' || chr(10) || '.,/()%+*#"'':;=&_@-]', '', 'g'
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.erp_jsonb(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  r JSONB;
  k TEXT;
  v JSONB;
  e JSONB;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  CASE jsonb_typeof(p)
    WHEN 'string' THEN
      RETURN to_jsonb(public.erp_text(p #>> '{}'));
    WHEN 'object' THEN
      r := '{}'::jsonb;
      FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
        r := r || jsonb_build_object(k, public.erp_jsonb(v));
      END LOOP;
      RETURN r;
    WHEN 'array' THEN
      r := '[]'::jsonb;
      FOR e IN SELECT * FROM jsonb_array_elements(p) LOOP
        r := r || jsonb_build_array(public.erp_jsonb(e));
      END LOOP;
      RETURN r;
    ELSE
      RETURN p;
  END CASE;
END;
$$;

-- Descrição curta: tira os "[ABREV]" de atributo vazio, normaliza e junta espaços.
CREATE OR REPLACE FUNCTION public.erp_description(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE
    btrim(regexp_replace(public.erp_text(regexp_replace(p, '\s*\[[^]]*\]', '', 'g')), ' {2,}', ' ', 'g'))
  END
$$;

-- ─── 2. PDM: nome e atributos (só o que vira texto do material; o id do atributo não muda) ─
UPDATE public.pdm_templates
SET name = btrim(public.erp_text(name))
WHERE name IS DISTINCT FROM btrim(public.erp_text(name));

UPDATE public.pdm_templates p
SET attributes = (
  SELECT coalesce(jsonb_agg(
    CASE WHEN jsonb_typeof(a) = 'object' THEN
      a || jsonb_strip_nulls(jsonb_build_object(
        'name', CASE WHEN jsonb_typeof(a -> 'name') = 'string' THEN to_jsonb(public.erp_text(a ->> 'name')) END,
        'abbreviation', CASE WHEN jsonb_typeof(a -> 'abbreviation') = 'string' THEN to_jsonb(public.erp_text(a ->> 'abbreviation')) END,
        'allowedValues', CASE WHEN jsonb_typeof(a -> 'allowedValues') = 'array' THEN public.erp_jsonb(a -> 'allowedValues') END
      ))
    ELSE a END
    ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements(p.attributes) WITH ORDINALITY AS t(a, ord)
)
WHERE jsonb_typeof(p.attributes) = 'array';

-- Nome repetido no tenant: o mais recente ganha " 2", " 3"...
WITH repetidos AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id, lower(btrim(name)) ORDER BY id) AS rn
  FROM public.pdm_templates
)
UPDATE public.pdm_templates p
SET name = p.name || ' ' || r.rn
FROM repetidos r
WHERE r.id = p.id AND r.rn > 1;

-- ─── 3. PDM: código no padrão 4 letras + 3 dígitos ───────────────────────────
DROP TABLE IF EXISTS pg_temp.pdm_recode;
CREATE TEMP TABLE pdm_recode (id INTEGER PRIMARY KEY, tenant_id INTEGER, old_code TEXT, new_code TEXT);

WITH alvo AS (
  SELECT
    p.id,
    p.tenant_id,
    p.internal_code AS old_code,
    rpad(left(coalesce((
      SELECT string_agg(w, '' ORDER BY ord)
      FROM regexp_split_to_table(upper(public.erp_text(p.name)), '[^A-Z]+') WITH ORDINALITY AS s(w, ord)
      WHERE w <> '' AND w NOT IN ('DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'COM', 'PARA', 'POR', 'A', 'O', 'AS', 'OS')
    ), ''), 4), 4, 'X') AS base
  FROM public.pdm_templates p
  WHERE p.internal_code IS NULL OR p.internal_code !~ '^[A-Z]{4}[0-9]{3}$'
),
usados AS (
  SELECT tenant_id, left(internal_code, 4) AS base, max(substr(internal_code, 5)::INTEGER) AS ultimo
  FROM public.pdm_templates
  WHERE internal_code ~ '^[A-Z]{4}[0-9]{3}$'
  GROUP BY tenant_id, left(internal_code, 4)
)
INSERT INTO pdm_recode (id, tenant_id, old_code, new_code)
SELECT
  a.id,
  a.tenant_id,
  a.old_code,
  a.base || lpad((coalesce(u.ultimo, 0) + row_number() OVER (PARTITION BY a.tenant_id, a.base ORDER BY a.id))::TEXT, 3, '0')
FROM alvo a
LEFT JOIN usados u ON u.tenant_id = a.tenant_id AND u.base = a.base;

UPDATE public.material_database m
SET pdm_code = r.new_code
FROM pdm_recode r
WHERE m.tenant_id = r.tenant_id AND m.pdm_code = r.old_code;

UPDATE public.pdm_templates p
SET internal_code = r.new_code
FROM pdm_recode r
WHERE p.id = r.id;

DROP TABLE pdm_recode;

-- Nome do PDM gravado no material acompanha o PDM
UPDATE public.material_database m
SET pdm_name = p.name
FROM public.pdm_templates p
WHERE m.tenant_id = p.tenant_id AND m.pdm_code = p.internal_code AND m.pdm_name IS DISTINCT FROM p.name;

-- ─── 4. Materiais e solicitações ─────────────────────────────────────────────
UPDATE public.material_database
SET description = public.erp_description(description),
    detailed_description = public.erp_text(detailed_description),
    pdm_name = public.erp_text(pdm_name),
    material_group = public.erp_text(material_group),
    material_type = public.erp_text(material_type),
    unit_of_measure = public.erp_text(unit_of_measure),
    origin = public.erp_text(origin),
    purchase_group = public.erp_text(purchase_group),
    mrp_type = public.erp_text(mrp_type),
    valuation_class = public.erp_text(valuation_class),
    valuation_group = public.erp_text(valuation_group),
    profit_center = public.erp_text(profit_center),
    preferred_supplier = public.erp_text(preferred_supplier),
    mrp_controller = public.erp_text(mrp_controller),
    forecast_profile = public.erp_text(forecast_profile),
    cst_pis_cofins = public.erp_text(cst_pis_cofins),
    stock_account = public.erp_text(stock_account),
    price_control = public.erp_text(price_control),
    technical_attributes = public.erp_jsonb(technical_attributes),
    eans = public.erp_jsonb(eans),
    dimensions = public.erp_jsonb(dimensions),
    sales = public.erp_jsonb(sales),
    site = public.erp_jsonb(site),
    characteristics = public.erp_jsonb(characteristics),
    additional_fields = public.erp_jsonb(additional_fields)
WHERE description IS DISTINCT FROM public.erp_description(description)
   OR detailed_description IS DISTINCT FROM public.erp_text(detailed_description)
   OR pdm_name IS DISTINCT FROM public.erp_text(pdm_name)
   OR technical_attributes IS DISTINCT FROM public.erp_jsonb(technical_attributes)
   OR characteristics IS DISTINCT FROM public.erp_jsonb(characteristics)
   OR additional_fields IS DISTINCT FROM public.erp_jsonb(additional_fields)
   OR material_group IS DISTINCT FROM public.erp_text(material_group)
   OR material_type IS DISTINCT FROM public.erp_text(material_type);

UPDATE public.material_requests
SET generated_description = public.erp_description(generated_description),
    technical_attributes = public.erp_jsonb(technical_attributes)
WHERE generated_description IS DISTINCT FROM public.erp_description(generated_description)
   OR technical_attributes IS DISTINCT FROM public.erp_jsonb(technical_attributes);

-- ─── 5. Dicionário de valores ────────────────────────────────────────────────
-- Valor único por tenant: só normaliza um de cada grupo que ficaria igual (de preferência o que já está no padrão).
-- Os que sobrarem com acento aparecem como parecidos na tela do dicionário para unificar.
WITH alvo AS (
  SELECT
    id,
    public.erp_text(value) AS novo,
    row_number() OVER (PARTITION BY tenant_id, public.erp_text(value) ORDER BY (value = public.erp_text(value)) DESC, id) AS rn
  FROM public.value_dictionary
)
UPDATE public.value_dictionary v
SET value = a.novo
FROM alvo a
WHERE a.id = v.id AND a.rn = 1 AND v.value IS DISTINCT FROM a.novo;

UPDATE public.value_dictionary
SET abbreviation = public.erp_text(abbreviation)
WHERE abbreviation IS DISTINCT FROM public.erp_text(abbreviation);

-- ─── 6. Travas ───────────────────────────────────────────────────────────────
ALTER TABLE public.pdm_templates DROP CONSTRAINT IF EXISTS ck_pdm_internal_code_format;
ALTER TABLE public.pdm_templates
  ADD CONSTRAINT ck_pdm_internal_code_format
  CHECK (char_length(internal_code) BETWEEN 1 AND 10 AND internal_code ~ '^[A-Z0-9_-]+$');

CREATE UNIQUE INDEX IF NOT EXISTS uq_pdm_templates_tenant_name ON public.pdm_templates (tenant_id, lower(btrim(name)));
