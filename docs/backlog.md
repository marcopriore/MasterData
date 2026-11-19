# Backlog e lacunas

Itens observados no código em outubro de 2026. Não é uma fila priorizada com o negócio — é o que o repositório ainda não fecha.

## Produto

- **`NEXT_PUBLIC_APP_URL` no ambiente.** Falta no `.env.local` (esperado em desenvolvimento) e é obrigatória em produção, para os links de e-mail e das solicitações criadas por API apontarem para o endereço certo.

- **Novos desenvolvimentos pedidos em 10/11/2026:**
  1. ~~Histórico no detalhe do material~~ (feito, migration 042).
  2. ~~Alteração e Ampliação a partir da pesquisa da nova solicitação~~ (fase A, Alteração, na 043; fase B, centros e Ampliação, na 045). **Falta confirmar com o ERP real** o formato de `sites` no JSON (um item por centro com `siteCode` e os campos por centro). Possível passo seguinte: Alteração de campo por centro num centro acrescentado (hoje a Alteração muda os campos do material, que valem para o centro inicial) e centro na API de solicitações. Texto original: No dialog de detalhes do item encontrado em Nova Solicitação, dois botões: **Alteração** (solicitação para alterar um material existente) e **Ampliação** (solicitação para ampliar o material para outro centro). Cada um abre um novo tipo de solicitação, com fluxo próprio. Lembrar: o Tipo de Material não muda numa alteração (migration 041).
  3. ~~Governança em lista: barras de progresso por etapa~~ (feito: uma barra por etapa do workflow, `lib/stage-progress.ts`).
- ~~Materiais antigos incompletos~~ (feito: Relatórios → Materiais incompletos, migration 051).
- **Governança com muitas abertas.** Desde a 037 as fechadas vêm só dos últimos 90 dias (ajustável na tela). A tela já pagina (30 cartões por coluna com "Mostrar mais", 50 linhas por página na lista), mas ainda carrega todas as abertas para os indicadores. Com dezenas de milhares em andamento, o próximo passo é buscar por página no banco e calcular os indicadores lá.
- **AxisDesk em produção respondendo 500.** A chave do PRO-MAT é aceita, mas `/api/categorias` e `/api/chamados` do AxisDesk falham na primeira consulta ao próprio banco. Conferir o projeto Supabase do AxisDesk (pausado?) e os logs da Vercel dele.
- **E-mail de redefinição de senha.** O link sai pelo e-mail do Supabase Auth. O SMTP padrão do Supabase só entrega para membros da equipe do projeto e tem limite baixo; em produção é preciso o SMTP próprio (Resend) e o modelo de e-mail com `token_hash`, descritos em `deploy-producao.md`.
- **E-mail sem chave.** O disparo já respeita `email_request_*`. Falta configurar `RESEND_API_KEY` e `RESEND_FROM_EMAIL` no ambiente para a mensagem sair de fato.
- **Domínio público do PRO-MAT.** Roteiro em [deploy-producao.md](./deploy-producao.md) (Vercel + subdomínio no registro.br). Depois do go-live, a URL do webhook no AxisDesk fica `https://<app>/api/support/webhook`, com o mesmo `AXISDESK_WEBHOOK_SECRET`.
- **Banco único (decidido, 26/10/2026).** Produção e desenvolvimento usam o mesmo projeto Supabase. O banco de desenvolvimento fica para depois do primeiro cliente fechado, junto com o plano Pro. Sem Docker local. Até lá:
  - `npm run dev`, os scripts de seed e a sonda gravam em produção;
  - teste que grava dado usa tenant temporário e apaga no fim, como `security:probe`.
  
  O passo a passo da separação está no fim de `deploy-producao.md`.
- **Integração ERP contra um ERP real.** A chamada existe e foi testada contra um servidor falso. Falta validar com o endpoint do cliente: nomes do cabeçalho (`internalGroup` para grupo de mercadoria é suposição), formato da resposta e mensagens de erro. A simulação continua enquanto o tenant não tiver integração ativa.
- **Etapa de workflow personalizado.** Desde a 034, a área de cada etapa é o papel com o nome da etapa (`qualidade` → QUALIDADE). Workflow com etapa nova precisa de um papel com esse nome para alguém, além do ADMIN, atender.
- **Usuários da Empresa Demo.** Desativar antes de abrir para clientes (as senhas estão no repositório). O SQL está em `deploy-producao.md`. Cadastro público, regra de senha e troca da senha padrão foram feitos em 26/10/2026.
- **Dicionário com valores parecidos após a 030.** Quando o valor sem acento já existia (`Aco` e `Aço`), a migration normaliza só um. O outro aparece como parecido na tela do dicionário para unificar manualmente.
- **Documentação para quem não tem login.** A documentação fica dentro do PRO-MAT. Um integrador externo recebe o OpenAPI baixado da tela; publicar uma página aberta depende do domínio público.
- **Conector de notificação em tempo real.** A migration 006 habilita Realtime; o sino ainda consulta a API. Vale confirmar se o polling continua sendo o comportamento desejado.
- **Segurança, próximos degraus.**
  - MFA (TOTP) para ADMIN e Master.
  - Captcha no login e na redefinição de senha, se aparecer tentativa em massa.
  - Rodar a sonda (`npm run security:probe`) no CI contra um banco de desenvolvimento, quando ele existir.

- **Valores padrão por condição (a fazer, pedido em 18/11/2026).** Tela de parametrização para pré-preencher campos conforme uma condição, para reduzir o preenchimento manual nas etapas do workflow. Exemplos pedidos: o Grupo de Mercadorias vir preenchido pelo PDM escolhido; o Grupo de Compradores, a Classe de Avaliação e outros campos vindos de uma condição. Pontos a definir na modelagem:
  - a condição (PDM, tipo de material, centro, outro campo ou combinação de campos) e o valor preenchido;
  - se o valor é sugestão (o usuário pode trocar) ou fixo (só muda pela regra);
  - em que momento aplica: ao abrir a solicitação, na etapa que cobra o campo ou na integração com o ERP;
  - o que acontece com material antigo já preenchido (nunca sobrescrever um valor existente, só preencher vazio, salvo decisão diferente);
  - rastreio: o histórico registra quando o valor veio de regra e qual regra.
  Relação com a regra por material (migrations 038 a 040) e com a regra de etapa (migration 049): o campo pré-preenchido continua sendo cobrado pela etapa dele como qualquer outro.

  Decisões de modelagem (18/11/2026):
  - quando: na etapa que cobra o campo, quando a condição já estiver preenchida;
  - sugestão ou fixo: misto, definido em cada regra e campo;
  - material antigo: não mexer nos valores já preenchidos, e listar os casos no relatório de materiais incompletos;
  - quem configura: Master e Admin do tenant (permissão `can_manage_fields`);
  - condição: uma por regra (campo de lista ou PDM) com valor único;
  - reenvio: se o PDM ou a condição mudar, a regra troca o valor que ela mesma preencheu e que a pessoa não editou; valor digitado por alguém é mantido;
  - escopo: Cadastro, Alteração e Ampliação. Na Alteração, a regra só preenche campo escolhido na alteração que esteja vazio; na Ampliação, só o campo por centro vazio;
  - conflito: duas regras ativas para o mesmo campo, vale a de menor número de prioridade, e a tela avisa a sobreposição;
  - fixo: a tela trava o campo e o banco recusa a troca.
  Modelagem proposta: tabela `field_default_rules` (condição, campo alvo, valor, fixo, prioridade, ativa), coluna `default_fields` em `material_requests` (só o banco grava), evento `defaults` no histórico da solicitação, função `apply_field_defaults` chamada na criação e a cada entrada de etapa.

## Resíduos

- ~~`/products`, `/teste`, `phase-category.tsx`, tabelas `products` e `request_values`, README padrão e cor do papel TRIAGEM~~ (retirados em 13/11/2026; as tabelas pela migration 050, que só apaga se estiverem vazias e, com dado, tira o acesso pela API e avisa).

## Documentação e engenharia

- Manter `docs/` junto com mudança de regra. Se nascer permissão, etapa de workflow ou RPC, atualizar `regras.md` e `funcionalidades.md` no mesmo trabalho.
- **Lista com filtro:** só a consulta mais recente atualiza a tela (Base de Dados, governança, logs, dicionário de valores, campos). Lista nova com busca no servidor segue o mesmo padrão (`useRef` com número da consulta).
- E2E ainda sem suíte de troca de tenant pelo Master, importação de planilha, anexos, notificações e integração ERP (simulada). Rodar o E2E no CI depende do banco de desenvolvimento.
- Senha dos usuários demo continua hardcoded no script de criação. Aceitável para demo; não usar esse valor fora do tenant de demonstração.

## Ideias já modeladas e ainda abertas
