# Backlog e lacunas

Itens observados no código em outubro de 2026. Não é uma fila priorizada com o negócio — é o que o repositório ainda não fecha.

## Produto

- **Reset de senha por administrador.** A rota de senha só aceita o próprio usuário, e exige a senha atual quando ela é enviada. Um admin não redefine a senha de outra conta pela aplicação. Hoje isso fica no painel do Supabase ou num script com service role.
- **E-mail sem chave.** O disparo já respeita `email_request_*`. Falta configurar `RESEND_API_KEY` e `RESEND_FROM_EMAIL` no ambiente para a mensagem sair de fato.
- **Domínio público do PRO-MAT.** O sistema ainda roda só em `localhost`. Sem um endereço publicado, o AxisDesk não consegue chamar o webhook. Quando houver domínio, a URL em Configurações → Integrações → PRO-MAT fica `https://<domínio>/api/support/webhook`, com o mesmo `AXISDESK_WEBHOOK_SECRET`.
- **Integração ERP.** Campos MM03, `id_erp`, `erp_status` e `erp_error_message` existem. O botão de integrar só simula o round-trip (`erpIntegrateMaterial`). Não há cliente SAP.
- **Detalhe da governança.** Em `/governance/request/[id]`, iniciar, aprovar e rejeitar não chamam `assign_request`, `advance_workflow` nem `reject_request`. O kanban em `/governance` é quem persiste. A página de detalhe precisa usar as mesmas RPCs ou deixar de oferecer essas ações.
- **`can_attend` no tenant novo.** O script da Empresa Demo e o onboarding não gravam essa flag. Quem não passou pela migration 008 não vê “Iniciar atendimento” como os papéis antigos.
- **Conector de notificação em tempo real.** A migration 006 habilita Realtime; o sino ainda consulta a API. Vale confirmar se o polling continua sendo o comportamento desejado.
- **Middleware e rotas `/admin`.** O matcher exclui `admin/` e `api/`. As páginas de administração não passam pelo redirect de login do middleware. A proteção efetiva está nas chamadas autenticadas e nas permissões. Vale alinhar o matcher com as telas reais.

## Resíduos

- `/products` — CRUD da tabela `products`, sem entrada no menu.
- `/teste` — página que só confirma que a rota responde.
- `web/components/request/phase-category.tsx` — componente sem uso.
- `request_values` — tabela da migration 002; o fluxo atual grava `technical_attributes` na solicitação.
- `web/README.md` — texto padrão do create-next-app, sem instrução do PRO-MAT.
- Papéis TRIAGEM e MASTER DATA da versão antiga não são os do seed atual. O fluxo demo usa CADASTRO, COMPRAS, MRP, FISCAL e CONTABILIDADE. A tela de perfis ainda colore TRIAGEM; esse nome pode aparecer só se alguém criar o papel à mão.

## Documentação e engenharia

- Manter `docs/` junto com mudança de regra. Se nascer permissão, etapa de workflow ou RPC, atualizar `regras.md` e `funcionalidades.md` no mesmo trabalho.
- Os testes e2e em `tests/e2e` ainda chamam `http://localhost:8000` (`/admin/auth/login`, `/api/requests`, `/api/pdm`), a API FastAPI que saiu do repositório. Enquanto o helper não falar com o Next.js e o Supabase, a suíte não protege o sistema atual. Há TODOs em `request.spec.ts` e `governance.spec.ts` que aceitam HTTP 200 onde a validação deveria falhar.
- Não há suíte de tenants, troca de tenant, importação de planilha nem notificações.
- Senha dos usuários demo continua hardcoded no script de criação. Aceitável para demo; não usar esse valor fora do tenant de demonstração.

## Ideias já modeladas e ainda abertas

- Envio ao ERP na padronização, gravando `id_erp` ou `erp_error_message`.
- Reset de senha administrativo com auditoria em `system_logs`, sem devolver a senha no log.
- Retirar ou esconder `/products` e `/teste` quando não forem mais úteis.
