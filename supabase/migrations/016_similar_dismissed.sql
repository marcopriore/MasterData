-- Migration 016: value_dictionary_dismissed + get_similar_values exclui dispensados
-- Tabela para pares "similar" dispensados pelo usuário
-- dismiss_similar_pair para registrar dispensa

CREATE TABLE IF NOT EXISTS public.value_dictionary_dismissed (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  id_a INTEGER NOT NULL REFERENCES public.value_dictionary(id) ON DELETE CASCADE,
  id_b INTEGER NOT NULL REFERENCES public.value_dictionary(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_dismissed_pair UNIQUE (tenant_id, id_a, id_b)
);

CREATE INDEX IF NOT EXISTS idx_dismissed_tenant
  ON public.value_dictionary_dismissed(tenant_id);

ALTER TABLE public.value_dictionary_dismissed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON public.value_dictionary_dismissed
  FOR ALL
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- ─── get_similar_values: excluir pares dispensados ────────────────────────────
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
    AND NOT EXISTS (
      SELECT 1 FROM public.value_dictionary_dismissed d
      WHERE d.tenant_id = public.get_user_tenant_id()
        AND ((d.id_a = a.id AND d.id_b = b.id)
          OR (d.id_a = b.id AND d.id_b = a.id))
    )
  ORDER BY similarity_score DESC;
$$;

-- ─── dismiss_similar_pair: dispensar par similar ──────────────────────────────
CREATE OR REPLACE FUNCTION public.dismiss_similar_pair(p_id_a INTEGER, p_id_b INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id INTEGER;
  v_id_a INTEGER;
  v_id_b INTEGER;
BEGIN
  v_tenant_id := public.get_user_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem tenant' USING errcode = 'P0001';
  END IF;

  IF p_id_a > p_id_b THEN
    v_id_a := p_id_b;
    v_id_b := p_id_a;
  ELSE
    v_id_a := p_id_a;
    v_id_b := p_id_b;
  END IF;

  INSERT INTO public.value_dictionary_dismissed (tenant_id, id_a, id_b)
  VALUES (v_tenant_id, v_id_a, v_id_b)
  ON CONFLICT (tenant_id, id_a, id_b) DO NOTHING;

  RETURN jsonb_build_object('dismissed', true, 'id_a', v_id_a, 'id_b', v_id_b);
END;
$$;
