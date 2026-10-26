# Backlog e lacunas

Itens observados no código em outubro de 2026. Não é uma fila priorizada com o negócio — é o que o repositório ainda não fecha.

## Produto

- **Desligar o cadastro público no Supabase.** O `prd:check` acusa "Allow new users to sign up" ligado no projeto atual (que também é o de produção): qualquer pessoa com a chave pública cria conta no Auth. Desligar em Authentication → Sign In / Providers → Email.
- **`NEXT_PUBLIC_APP_URL` no ambiente.** Falta no `.env.local` (esperado em desenvolvimento) e é obrigatória em produção, para os links de e-mail e das solicitações criadas por API apontarem para o endereço certo.

- **Minhas Solicitações, próximos passos.** A primeira versão (`/requests`) lista só o que o usuário abriu, em leitura. Ainda a definir: aba com as solicitações que o usuário atendeu; o solicitante cancelar uma solicitação em andamento ou reabrir uma rejeitada com correção; anexos no detalhe; exportar a lista.
- **Relatórios, próximos.** Rejeições por área e motivo e integrações com o ERP no período ficaram fora da primeira versão.
- **AxisDesk em produção respondendo 500.** A chave do PRO-MAT é aceita, mas `/api/categorias` e `/api/chamados` do AxisDesk falham na primeira consulta ao próprio banco. Conferir o projeto Supabase do AxisDesk (pausado?) e os logs da Vercel dele.
- **Consultas que ainda carregam tudo.** O painel inicial (`getDashboardStats`) e a governança (`getRequests`) leem todas as solicitações do tenant ou do workflow; acima de 1000 linhas o PostgREST corta. Próximo passo: contagens por RPC e paginação na lista da governança.
- **E-mail de redefinição de senha.** O link sai pelo e-mail do Supabase Auth. O SMTP padrão do Supabase só entrega para membros da equipe do projeto e tem limite baixo; em produção é preciso o SMTP próprio (Resend) e o modelo de e-mail com `token_hash`, descritos em `deploy-producao.md`.
- **E-mail sem chave.** O disparo já respeita `email_request_*`. Falta configurar `RESEND_API_KEY` e `RESEND_FROM_EMAIL` no ambiente para a mensagem sair de fato.
- **Domínio público do PRO-MAT.** Roteiro em [deploy-producao.md](./deploy-producao.md) (Vercel + subdomínio no registro.br). Depois do go-live, a URL do webhook no AxisDesk fica `https://<app>/api/support/webhook`, com o mesmo `AXISDESK_WEBHOOK_SECRET`.
- **Banco único (decidido, 26/10/2026).** Produção e desenvolvimento usam o mesmo projeto Supabase. O banco de desenvolvimento fica para depois do primeiro cliente fechado, junto com o plano Pro. Sem Docker local. Até lá:
  - `npm run dev`, os scripts de seed e a sonda gravam em produção;
  - teste que grava dado usa tenant temporário e apaga no fim, como `security:probe`.
  
  O passo a passo da separação está no fim de `deploy-producao.md`.
- **Integração ERP contra um ERP real.** A chamada existe e foi testada contra um servidor falso. Falta validar com o endpoint do cliente: nomes do cabeçalho (`internalGroup` para grupo de mercadoria é suposição), formato da resposta e mensagens de erro. A simulação continua enquanto o tenant não tiver integração ativa.
- **Etapa de workflow personalizado.** Desde a 034, a área de cada etapa é o papel com o nome da etapa (`qualidade` → QUALIDADE). Workflow com etapa nova precisa de um papel com esse nome para alguém, além do ADMIN, atender.
- **Ajustes do Supabase Auth em produção.**
  - Cadastro público desligado.
  - Senha mínima 8 com minúscula, maiúscula, número e símbolo (feito em 26/10/2026), e leaked password protection.
  - Rodar `scripts/rotate-default-passwords.mjs`.
  - Desativar os usuários da Empresa Demo.
  
  O passo a passo está em `deploy-producao.md`.
- **Dicionário com valores parecidos após a 030.** Quando o valor sem acento já existia (`Aco` e `Aço`), a migration normaliza só um. O outro aparece como parecido na tela do dicionário para unificar manualmente.
- **Aviso no arraste.** Mover entre etapas intermediárias grava histórico (migration 026), mas não avisa a área da nova etapa, como a aprovação faz.
- **Documentação para quem não tem login.** A documentação fica dentro do PRO-MAT. Um integrador externo recebe o OpenAPI baixado da tela; publicar uma página aberta depende do domínio público.
- **Conector de notificação em tempo real.** A migration 006 habilita Realtime; o sino ainda consulta a API. Vale confirmar se o polling continua sendo o comportamento desejado.
- **Segurança, próximos degraus.**
  - MFA (TOTP) para ADMIN e Master.
  - Captcha no login e na redefinição de senha, se aparecer tentativa em massa.
  - Rodar a sonda (`npm run security:probe`) no CI contra um banco de desenvolvimento, quando ele existir.

## Resíduos

- `/products` — CRUD da tabela `products`, sem entrada no menu.
- `/teste` — página que só confirma que a rota responde.
- `web/components/request/phase-category.tsx` — componente sem uso.
- `request_values` — tabela da migration 002; o fluxo atual grava `technical_attributes` na solicitação.
- `web/README.md` — texto padrão do create-next-app, sem instrução do PRO-MAT.
- Papéis TRIAGEM e MASTER DATA da versão antiga não são os do seed atual. O fluxo demo usa CADASTRO, COMPRAS, MRP, FISCAL e CONTABILIDADE. A tela de perfis ainda colore TRIAGEM; esse nome pode aparecer só se alguém criar o papel à mão.

## Documentação e engenharia

- Manter `docs/` junto com mudança de regra. Se nascer permissão, etapa de workflow ou RPC, atualizar `regras.md` e `funcionalidades.md` no mesmo trabalho.
- **Resposta antiga sobrescrevendo a busca.** A Base de Dados mostrava a carga inicial por cima do resultado da busca quando ela chegava depois (corrigido: só a consulta mais recente vale). Conferir o mesmo padrão nas outras listas com filtro (governança, Minhas Solicitações, logs, dicionário).
- E2E ainda sem suíte de troca de tenant pelo Master, importação de planilha, anexos, notificações e integração ERP (simulada). Rodar o E2E no CI depende do banco de desenvolvimento.
- Senha dos usuários demo continua hardcoded no script de criação. Aceitável para demo; não usar esse valor fora do tenant de demonstração.

## Ideias já modeladas e ainda abertas

- Retirar ou esconder `/products` e `/teste` quando não forem mais úteis.
