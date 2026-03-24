-- Migration 015: sync_value_dictionary expandido + get_similar_values (pg_trgm)
-- 1. Habilitar pg_trgm para similaridade fuzzy
-- 2. sync_value_dictionary: também atualiza abbreviation quando PDM tem e dicionário não
-- 3. get_similar_values: pares de valores similares (possíveis typos)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── sync_value_dictionary: criar novas + atualizar abbreviation quando faltando ─
CREATE OR REPLACE FUNCTION public.sync_value_dictionary()
RETURNS JSONB AS $$
DECLARE
  v_tenant_id INTEGER;
  v_created INT := 0;
  v_updated INT := 0;
  v_val TEXT;
  v_attr JSONB;
  v_opt JSONB;
  v_exists BOOLEAN;
  v_pdm_abbr TEXT;
BEGIN
  v_tenant_id := public.get_user_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem tenant' USING errcode = 'P0001';
  END IF;

  FOR v_attr IN
    SELECT jsonb_array_elements(COALESCE(p.attributes, '[]'::jsonb))
    FROM public.pdm_templates p
    WHERE p.tenant_id = v_tenant_id
  LOOP
    IF lower(v_attr->>'dataType') NOT IN ('lov', 'select') THEN
      CONTINUE;
    END IF;

    FOR v_opt IN SELECT jsonb_array_elements(COALESCE(v_attr->'allowedValues', v_attr->'options', '[]'::jsonb))
    LOOP
      v_val := trim(both from coalesce(v_opt->>'value', v_opt #>> '{}', ''));
      IF v_val = '' THEN CONTINUE; END IF;

      v_pdm_abbr := trim(coalesce(v_opt->>'abbreviation', ''));

      SELECT EXISTS (
        SELECT 1 FROM public.value_dictionary
        WHERE tenant_id = v_tenant_id AND lower(trim(value)) = lower(v_val)
      ) INTO v_exists;

      IF NOT v_exists THEN
        INSERT INTO public.value_dictionary (tenant_id, value, abbreviation)
        VALUES (v_tenant_id, v_val, coalesce(nullif(v_pdm_abbr, ''), v_val));
        v_created := v_created + 1;
      ELSIF v_pdm_abbr <> '' THEN
        UPDATE public.value_dictionary
        SET abbreviation = v_pdm_abbr, updated_at = now()
        WHERE tenant_id = v_tenant_id
          AND lower(trim(value)) = lower(v_val)
          AND (abbreviation IS NULL OR trim(abbreviation) = '');
        IF FOUND THEN
          v_updated := v_updated + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'updated', v_updated);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── get_similar_values: pares de valores similares (possíveis erros de digitação) ─
CREATE OR REPLACE FUNCTION public.get_similar_values()
RETURNS TABLE (
  id_a INTEGER,
  value_a TEXT,
  id_b INTEGER,
  value_b TEXT,
  similarity_score FLOAT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    a.id::INTEGER AS id_a,
    a.value::TEXT AS value_a,
    b.id::INTEGER AS id_b,
    b.value::TEXT AS value_b,
    similarity(a.value, b.value)::FLOAT AS similarity_score
  FROM public.value_dictionary a
  JOIN public.value_dictionary b
    ON a.tenant_id = b.tenant_id
    AND a.tenant_id = public.get_user_tenant_id()
    AND a.id < b.id
  WHERE lower(trim(a.value)) <> lower(trim(b.value))
    AND similarity(a.value, b.value) >= 0.6
  ORDER BY similarity_score DESC;
$$;
