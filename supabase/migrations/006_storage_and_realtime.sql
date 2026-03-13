-- Migration 006: Storage bucket e Realtime
-- Bucket para anexos de solicitações + policies por tenant
-- Habilitar Realtime para notificações

-- ─── Bucket para anexos (estrutura: {tenant_id}/{request_id}/{filename}) ──────
INSERT INTO storage.buckets (id, name, public)
VALUES ('request-attachments', 'request-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- ─── Policy: SELECT (leitura) — usuário vê apenas arquivos do seu tenant ─────
CREATE POLICY "tenant_attachments_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'request-attachments'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

-- ─── Policy: INSERT — upload apenas na pasta do seu tenant ───────────────────
CREATE POLICY "tenant_attachments_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'request-attachments'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

-- ─── Policy: UPDATE (atualizar) ───────────────────────────────────────────────
CREATE POLICY "tenant_attachments_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'request-attachments'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

-- ─── Policy: DELETE ───────────────────────────────────────────────────────────
CREATE POLICY "tenant_attachments_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'request-attachments'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id()::text
  );

-- Master users podem acessar qualquer tenant (usando policy adicional ou service_role)
-- Para simplificar, master bypass pode ser tratado na API com service_role key.

-- ─── Realtime: habilitar para notificações ───────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
