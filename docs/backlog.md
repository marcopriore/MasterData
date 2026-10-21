# Backlog e lacunas

Itens observados no código em outubro de 2026. Não é uma fila priorizada com o negócio — é o que o repositório ainda não fecha.

## Produto

- **Reset de senha por administrador.** A rota de senha só aceita o próprio usuário, e exige a senha atual quando ela é enviada. Um admin não redefine a senha de outra conta pela aplicação. Hoje isso fica no painel do Supabase ou num script com service role.
- **E-mail sem chave.** O disparo já respeita `email_request_*`. Falta configurar `RESEND_API_KEY` e `RESEND_FROM_EMAIL` no ambiente para a mensagem sair de fato.
- **Domínio público do PRO-MAT.** O sistema ainda roda só em `localhost`. Sem um endereço publicado, o AxisDesk não consegue chamar o webhook. Quando houver domínio, a URL em Configurações → Integrações → PRO-MAT fica `https://<domínio>/api/support/webhook`, com o mesmo `AXISDESK_WEBHOOK_SECRET`.
- **Integração ERP contra um ERP real.** A chamada existe e foi testada contra um servidor falso. Falta validar com o endpoint do cliente: nomes do cabeçalho (`internalGroup` para grupo de mercadoria é suposição), formato da resposta e mensagens de erro. A simulação continua enquanto o tenant não tiver integração ativa.
- **Arrastar para Finalizado no kanban.** `moveRequestToStatus` não cria o material nem dispara o ERP. Só a aprovação pela RPC faz isso.
- **Lote só com Pendente ERP.** A seleção em lote na base ignora material em `erro_erp`; a nova tentativa é pelo detalhe.
- **Documentação para quem não tem login.** A documentação fica dentro do PRO-MAT. Um integrador externo recebe o OpenAPI baixado da tela; publicar uma página aberta depende do domínio público.
- **Limite de chamadas por chave.** As APIs de material não têm rate limit. Entra no gate de segurança.
- **Detalhe da governança.** Em `/governance/request/[id]`, iniciar, aprovar e rejeitar não chamam `assign_request`, `advance_workflow` nem `reject_request`. O kanban em `/governance` é quem persiste. A página de detalhe precisa usar as mesmas RPCs ou deixar de oferecer essas ações.
- **`can_attend` no tenant novo.** O script da Empresa Demo e o onboarding não gravam essa flag. Quem não passou pela migration 008 não vê “Iniciar atendimento” como os papéis antigos.
- **Conector de notificação em tempo real.** A migration 006 habilita Realtime; o sino ainda consulta a API. Vale confirmar se o polling continua sendo o comportamento desejado.
- **Build de produção bloqueado por tipos.** `next build` compila, mas para em 44 erros de TypeScript antigos: componentes de `components/ui` sem uso que importam pacotes não instalados (`cmdk`, `vaul`, `react-hook-form`, radix extras), `chart.tsx`, `notifications-context.tsx` e `tailwind.config.ts`. Precisa resolver antes de publicar; o CI ainda não roda o build por isso.
- **Segurança, próximos degraus.** Content-Security-Policy (precisa de nonce por causa dos scripts do Next), limite de tentativas de login, limite por IP nas chamadas sem chave, e trocar `xlsx` pela versão do CDN da SheetJS ou por `exceljs` (exceção da auditoria vence em 31/01/2027).

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
