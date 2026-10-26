# Backlog e lacunas

Itens observados no código em outubro de 2026. Não é uma fila priorizada com o negócio — é o que o repositório ainda não fecha.

## Produto

- **Minhas Solicitações, próximos passos.** A primeira versão (`/requests`) lista só o que o usuário abriu, em leitura. Ainda a definir: aba com as solicitações que o usuário atendeu; o solicitante cancelar uma solicitação em andamento ou reabrir uma rejeitada com correção; anexos no detalhe; exportar a lista.
- **E-mail de redefinição de senha.** O link sai pelo e-mail do Supabase Auth. O SMTP padrão do Supabase só entrega para membros da equipe do projeto e tem limite baixo; em produção é preciso o SMTP próprio (Resend) e o modelo de e-mail com `token_hash`, descritos em `deploy-producao.md`.
- **E-mail sem chave.** O disparo já respeita `email_request_*`. Falta configurar `RESEND_API_KEY` e `RESEND_FROM_EMAIL` no ambiente para a mensagem sair de fato.
- **Domínio público do PRO-MAT.** Roteiro em [deploy-producao.md](./deploy-producao.md) (Vercel + subdomínio no registro.br). Depois do go-live, a URL do webhook no AxisDesk fica `https://<app>/api/support/webhook`, com o mesmo `AXISDESK_WEBHOOK_SECRET`.
- **Banco único.** Produção e desenvolvimento usam o mesmo projeto Supabase. `npm run dev` e os scripts de seed gravam em produção até existir um projeto de desenvolvimento (passo descrito no fim de `deploy-producao.md`).
- **Integração ERP contra um ERP real.** A chamada existe e foi testada contra um servidor falso. Falta validar com o endpoint do cliente: nomes do cabeçalho (`internalGroup` para grupo de mercadoria é suposição), formato da resposta e mensagens de erro. A simulação continua enquanto o tenant não tiver integração ativa.
- **Aviso no arraste.** Mover entre etapas intermediárias grava histórico (migration 026), mas não avisa a área da nova etapa, como a aprovação faz.
- **Documentação para quem não tem login.** A documentação fica dentro do PRO-MAT. Um integrador externo recebe o OpenAPI baixado da tela; publicar uma página aberta depende do domínio público.
- **Conector de notificação em tempo real.** A migration 006 habilita Realtime; o sino ainda consulta a API. Vale confirmar se o polling continua sendo o comportamento desejado.
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

- Retirar ou esconder `/products` e `/teste` quando não forem mais úteis.
