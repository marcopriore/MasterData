-- Migration 044: permissões da Base de Dados separadas e trava de quem só edita PDM
-- 1. Permissões novas: can_change_material_status (bloquear, obsoletar, reativar) e can_sync_erp
--    (sincronizar, integrar, eliminar no ERP). can_standardize passa a ser "Editar materiais".
--    Papéis existentes e papel novo sem a chave herdam o valor de can_standardize (nada muda para
--    quem já agia na base).
-- 2. Quem edita PDM sem "Editar materiais" só muda, no material, o que o PDM rege: descrição,
--    descrição detalhada, código e nome do PDM (a edição do PDM refaz as descrições).
-- Pode rodar de novo.

-- ─── 1. Chaves novas ─────────────────────────────────────────────────────────
UPDATE public.roles
SET permissions = coalesce(permissions, '{}'::jsonb)
  || jsonb_build_object('can_change_material_status', coalesce((permissions ->> 'can_standardize')::boolean, false))
WHERE NOT (coalesce(permissions, '{}'::jsonb) ? 'can_change_material_status');

UPDATE public.roles
SET permissions = coalesce(permissions, '{}'::jsonb)
  || jsonb_build_object('can_sync_erp', coalesce((permissions ->> 'can_standardize')::boolean, false))
WHERE NOT (coalesce(permissions, '{}'::jsonb) ? 'can_sync_erp');

CREATE OR REPLACE FUNCTION public.roles_default_can_attend()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.permissions := coalesce(NEW.permissions, '{}'::jsonb);
  IF NOT (NEW.permissions ? 'can_attend') THEN
    NEW.permissions := NEW.permissions || jsonb_build_object(
      'can_attend',
      upper(trim(NEW.name)) IN ('ADMIN', 'CADASTRO', 'COMPRAS', 'MRP', 'FISCAL', 'CONTABILIDADE')
    );
  END IF;
  IF NOT (NEW.permissions ? 'can_view_reports') THEN
    NEW.permissions := NEW.permissions || jsonb_build_object(
      'can_view_reports',
      upper(trim(NEW.name)) IN ('ADMIN', 'MASTER')
    );
  END IF;
  IF NOT (NEW.permissions ? 'can_change_material_status') THEN
    NEW.permissions := NEW.permissions || jsonb_build_object(
      'can_change_material_status', coalesce((NEW.permissions ->> 'can_standardize')::boolean, false)
    );
  END IF;
  IF NOT (NEW.permissions ? 'can_sync_erp') THEN
    NEW.permissions := NEW.permissions || jsonb_build_object(
      'can_sync_erp', coalesce((NEW.permissions ->> 'can_standardize')::boolean, false)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 2. Trava do material pelo navegador ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_material_database()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.id_sistema IS DISTINCT FROM OLD.id_sistema
     OR NEW.id_erp IS DISTINCT FROM OLD.id_erp
     OR NEW.erp_integrated_at IS DISTINCT FROM OLD.erp_integrated_at
     OR NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.api_client_id IS DISTINCT FROM OLD.api_client_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Campo do material só muda pelo servidor (status, ERP, origem)' USING errcode = '42501';
  END IF;

  -- Sem "Editar materiais", só o que a edição do PDM refaz.
  IF NOT public.user_has_permission('can_standardize') THEN
    IF NEW.technical_attributes IS DISTINCT FROM OLD.technical_attributes
       OR NEW.material_type IS DISTINCT FROM OLD.material_type
       OR NEW.unit_of_measure IS DISTINCT FROM OLD.unit_of_measure
       OR NEW.material_group IS DISTINCT FROM OLD.material_group
       OR NEW.ncm IS DISTINCT FROM OLD.ncm
       OR NEW.erp_status IS DISTINCT FROM OLD.erp_status
       OR NEW.additional_fields IS DISTINCT FROM OLD.additional_fields
       OR NEW.site IS DISTINCT FROM OLD.site
       OR NEW.characteristics IS DISTINCT FROM OLD.characteristics
       OR NEW.eans IS DISTINCT FROM OLD.eans
       OR NEW.dimensions IS DISTINCT FROM OLD.dimensions
       OR NEW.sales IS DISTINCT FROM OLD.sales
       OR NEW.standardized_at IS DISTINCT FROM OLD.standardized_at
       OR NEW.standardized_by IS DISTINCT FROM OLD.standardized_by THEN
      RAISE EXCEPTION 'Sem permissão para editar o material' USING errcode = '42501';
    END IF;
  END IF;

  -- Editar o material o devolve para pendente_erp (reenvio); qualquer outra situação no ERP é do servidor.
  IF NEW.erp_status IS DISTINCT FROM OLD.erp_status THEN
    IF NEW.erp_status <> 'pendente_erp' OR OLD.erp_status = 'integrando' THEN
      RAISE EXCEPTION 'Situação no ERP só muda pelo servidor' USING errcode = '42501';
    END IF;
  END IF;
  IF NEW.erp_error_message IS DISTINCT FROM OLD.erp_error_message AND NEW.erp_error_message IS NOT NULL THEN
    RAISE EXCEPTION 'Situação no ERP só muda pelo servidor' USING errcode = '42501';
  END IF;

  RETURN NEW;
END;
$$;
