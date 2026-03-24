-- Migration 014: Propagar alterações do value_dictionary para PDMs, requests e materials
-- propagate_value_to_pdms, propagate_value_to_requests_and_materials

-- ─── propagate_value_to_pdms: atualizar valor em pdm_templates.attributes ─────
CREATE OR REPLACE FUNCTION public.propagate_value_to_pdms(
  p_old_value TEXT,
  p_new_value TEXT,
  p_new_abbreviation TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_tenant_id INTEGER;
  v_count INT := 0;
  r RECORD;
  v_attr JSONB;
  v_opts JSONB;
  v_opt JSONB;
  v_new_opts JSONB;
  v_new_attrs JSONB;
  i INT;
  j INT;
  v_opt_val TEXT;
  v_old_lower TEXT;
BEGIN
  v_tenant_id := public.get_user_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem tenant' USING errcode = 'P0001';
  END IF;

  v_old_lower := lower(trim(coalesce(p_old_value, '')));
  IF v_old_lower = '' THEN
    RETURN jsonb_build_object('updated_pdms', 0);
  END IF;

  FOR r IN
    SELECT id, attributes
    FROM public.pdm_templates
    WHERE tenant_id = v_tenant_id
      AND attributes IS NOT NULL
      AND position(lower(trim(p_old_value)) in lower(attributes::text)) > 0
  LOOP
    v_new_attrs := '[]'::jsonb;

    FOR i IN 0..greatest(jsonb_array_length(r.attributes) - 1, 0) LOOP
      v_attr := r.attributes->i;

      IF lower(coalesce(v_attr->>'dataType', '')) IN ('lov', 'select') THEN
        v_opts := coalesce(v_attr->'allowedValues', v_attr->'options', '[]'::jsonb);
        v_new_opts := '[]'::jsonb;

        FOR j IN 0..greatest(jsonb_array_length(v_opts) - 1, 0) LOOP
          v_opt := v_opts->j;
          v_opt_val := lower(trim(coalesce(v_opt->>'value', '')));

          IF v_opt_val = v_old_lower THEN
            v_opt := jsonb_build_object(
              'value', coalesce(p_new_value, v_opt->>'value'),
              'abbreviation', coalesce(p_new_abbreviation, p_new_value, v_opt->>'value')
            );
          END IF;

          v_new_opts := v_new_opts || jsonb_build_array(v_opt);
        END LOOP;

        IF v_attr ? 'allowedValues' THEN
          v_attr := jsonb_set(v_attr, '{allowedValues}', v_new_opts);
        ELSIF v_attr ? 'options' THEN
          v_attr := jsonb_set(v_attr, '{options}', v_new_opts);
        ELSE
          v_attr := jsonb_set(v_attr, '{allowedValues}', v_new_opts);
        END IF;
      END IF;

      v_new_attrs := v_new_attrs || jsonb_build_array(v_attr);
    END LOOP;

    UPDATE public.pdm_templates
    SET attributes = v_new_attrs
    WHERE id = r.id AND tenant_id = v_tenant_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('updated_pdms', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── propagate_value_to_requests_and_materials: atualizar technical_attributes ─
CREATE OR REPLACE FUNCTION public.propagate_value_to_requests_and_materials(
  p_old_value TEXT,
  p_new_value TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_tenant_id INTEGER;
  v_req_count INT := 0;
  v_mat_count INT := 0;
  r RECORD;
  v_attrs JSONB;
  v_key TEXT;
  v_val JSONB;
  v_new_attrs JSONB;
  v_modified BOOLEAN;
BEGIN
  v_tenant_id := public.get_user_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem tenant' USING errcode = 'P0001';
  END IF;

  -- material_requests
  FOR r IN
    SELECT id, technical_attributes
    FROM public.material_requests
    WHERE tenant_id = v_tenant_id
      AND technical_attributes IS NOT NULL
      AND position(lower(trim(coalesce(p_old_value, ''))) in lower(technical_attributes::text)) > 0
  LOOP
    v_attrs := r.technical_attributes;
    v_new_attrs := '{}'::jsonb;
    v_modified := false;

    FOR v_key IN SELECT jsonb_object_keys(v_attrs)
    LOOP
      v_val := v_attrs->v_key;

      IF jsonb_typeof(v_val) = 'string' THEN
        IF lower(trim(v_val #>> '{}')) = lower(trim(p_old_value)) THEN
          v_val := to_jsonb(p_new_value::text);
          v_modified := true;
        END IF;
      ELSIF jsonb_typeof(v_val) = 'object' AND v_val ? 'value' THEN
        IF lower(trim(coalesce(v_val->>'value', ''))) = lower(trim(p_old_value)) THEN
          v_val := jsonb_set(v_val, '{value}', to_jsonb(p_new_value::text));
          v_modified := true;
        END IF;
      END IF;

      v_new_attrs := v_new_attrs || jsonb_build_object(v_key, v_val);
    END LOOP;

    IF v_modified THEN
      UPDATE public.material_requests
      SET technical_attributes = v_new_attrs
      WHERE id = r.id AND tenant_id = v_tenant_id;
      v_req_count := v_req_count + 1;
    END IF;
  END LOOP;

  -- material_database
  FOR r IN
    SELECT id, technical_attributes
    FROM public.material_database
    WHERE tenant_id = v_tenant_id
      AND technical_attributes IS NOT NULL
      AND position(lower(trim(coalesce(p_old_value, ''))) in lower(technical_attributes::text)) > 0
  LOOP
    v_attrs := r.technical_attributes;
    v_new_attrs := '{}'::jsonb;
    v_modified := false;

    FOR v_key IN SELECT jsonb_object_keys(v_attrs)
    LOOP
      v_val := v_attrs->v_key;

      IF jsonb_typeof(v_val) = 'string' THEN
        IF lower(trim(v_val #>> '{}')) = lower(trim(p_old_value)) THEN
          v_val := to_jsonb(p_new_value::text);
          v_modified := true;
        END IF;
      ELSIF jsonb_typeof(v_val) = 'object' AND v_val ? 'value' THEN
        IF lower(trim(coalesce(v_val->>'value', ''))) = lower(trim(p_old_value)) THEN
          v_val := jsonb_set(v_val, '{value}', to_jsonb(p_new_value::text));
          v_modified := true;
        END IF;
      END IF;

      v_new_attrs := v_new_attrs || jsonb_build_object(v_key, v_val);
    END LOOP;

    IF v_modified THEN
      UPDATE public.material_database
      SET technical_attributes = v_new_attrs, updated_at = now()
      WHERE id = r.id AND tenant_id = v_tenant_id;
      v_mat_count := v_mat_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('updated_requests', v_req_count, 'updated_materials', v_mat_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
