# Regras já desenvolvidas

## Multi-tenant

- Quase toda tabela de negócio tem `tenant_id`.
- **Tenant em uso:** `get_user_tenant_id()`. Para usuário comum vem do perfil; para o Master vem de `app_metadata.tenant_id` do token (troca de cliente). No navegador, `getCurrentUserTenantId()` segue a mesma regra, lendo o token (`getClaims`). No servidor, `getCallerAccess()` / `requirePermission()` em `lib/server-access.ts`.
- **RLS estrita (migration 031):** toda tabela de negócio só mostra e só aceita linhas do tenant em uso, inclusive para o Master. A visão de todos os tenants existe só na lista de tenants (`tenants`) e em `tenant_overview()` (totais da tela de tenants). Para ver outro cliente, o Master troca de tenant.
- **Exceções da regra:**
  - `users`: lê o tenant em uso e o próprio perfil. O perfil do Master fica no tenant de origem. Gravação só pelo servidor.
  - `roles`: gravação exige `can_manage_roles` (`user_has_permission`).
  - `request_history`: insere só em solicitação do tenant e em nome do próprio usuário. Não se altera nem se apaga.
  - `notifications`: cada um vê e marca as próprias.
  - `user_notification_prefs`: cada um as próprias.
- **Funções do banco:** quem não fez login não executa nenhuma função do schema `public` (031, inclusive as criadas depois). As ações por id de solicitação (`assign_request`, `advance_workflow`, `reject_request`, `move_request_stage`, `resubmit_request`) só acham solicitação do tenant em uso.
- **Policies:** `get_user_tenant_id()`, `is_master_user()` e `auth.uid()` ficam dentro de `(SELECT …)` (027), para o Postgres calcular uma vez por consulta, não uma vez por linha. Policy nova segue o mesmo formato e vai `TO authenticated`.
- **Permissão no banco (migration 032):** a escrita direta pela chave pública exige a mesma permissão da tela.

  | Tabela ou ação | Permissão exigida |
  |---|---|
  | PDM | `can_edit_pdm` |
  | Campos | `can_manage_fields` |
  | Workflow | `can_edit_workflows` |
  | Dicionário e funções do dicionário | `can_manage_value_dictionary` |
  | Abrir solicitação | `can_submit_request` |
  | Alterar solicitação | `can_attend` (ou `can_edit_workflows` para migrar de workflow) |
  | Alterar material | `can_standardize` ou `can_edit_pdm` |
  | Ler log | `can_view_logs` |
  | `assign_request` e `move_request_stage` | `can_attend` |
  | `advance_workflow` | `can_approve` |
  | `reject_request` | `can_reject` |

  Material não se cria nem se apaga pelo navegador.
- **Colunas travadas (gatilhos `guard_*`):** pela chave pública não se mudam:
  - **solicitação:** etapa, atendente, autor, tenant e PDM. Solicitação nova começa na primeira etapa ativa.
  - **material:** status de negócio, código e situação no ERP (só volta para `pendente_erp` ao editar), origem e tenant.
  
  Essas mudanças são das funções do banco e do servidor (`/api/database/materials/status` e `/erp`).
- **Log e histórico:** só recebem registros novos, em nome do próprio usuário. Ninguém altera nem apaga.
- **Usuário inativo (migration 033):** perde todo acesso. `get_user_tenant_id()` devolve NULL, a RLS não mostra nada e nenhuma permissão vale. Desativar na Gestão de Usuários (ou pela importação) também bloqueia a conta no Supabase Auth, e reativar desbloqueia. O login mostra "Usuário inativo".
- **Campos obrigatórios da etapa:** `advance_workflow` recusa aprovar sem eles (`stage_missing_fields`), com a mesma regra da tela: área da etapa padrão; `descricao_basica` é gerada.
- **Dicionário de campos do tenant novo:** o onboarding copia o dicionário completo, com opções, do tenant modelo (`copy_default_fields`). Opções de campo ficam no texto aceito pelo ERP, sem acento.
- **ERP simulado:** sem integração ativa, a simulação roda no servidor (`lib/erp/simulate.ts`), depois da permissão e da trava de duplicidade.
- **Rotas com service role** (ignoram a RLS) filtram `tenant_id` pelo tenant em uso e conferem que o id recebido pertence a ele antes de alterar.
- **Permissões do Master:** tem todas as permissões em qualquer tenant (`allPermissions`), porque o papel dele fica no tenant de origem.
- **Troca de tenant:** exclusiva de quem tem `is_master` no metadata de auth. Se o servidor recusar, nada muda. Depois da troca a página recarrega, o que também limpa os caches do navegador.
- Unidades de medida são globais.

## Autenticação

- Supabase Auth. O perfil em `public.users` usa o mesmo UUID de `auth.users`.
- `web/proxy.ts` (o antigo middleware; o Next 16 mudou o nome) passa por toda página e rota de API, menos arquivos estáticos. A regra de cada caminho está em `web/lib/route-guard.ts`: página sem sessão vai para `/login`; `/api/*` sem sessão recebe 401; `/api/v1` (chave) e `/api/support/webhook` (segredo) se autenticam na própria rota. A permissão de cada tela continua sendo checada na tela e na rota.
- Depois do login, o retorno (`from`) só aceita página interna. Endereço de outro site volta para `/`.
- Senha: cada usuário altera a própria (`user.id` tem de bater com o id da rota), informando a atual.
- Redefinição por e-mail (`web/lib/password-reset.ts`), pelo Supabase Auth (`resetPasswordForEmail`). Pode ser pedida no login (**Esqueci minha senha**), no perfil (quem não lembra a atual) e pelo admin em Gestão de Usuários (ícone de chave). Em todos os casos o link vai para o e-mail do próprio usuário; o admin não vê nem define senha de ninguém. O pedido no perfil e o do admin ficam no log do sistema.
- A tela responde igual para e-mail cadastrado ou não, e o Auth limita a frequência dos pedidos. O link abre `/reset-password` (página pública, `PUBLIC_PAGES` em `route-guard.ts`), que aceita `token_hash` (modelo de e-mail recomendado, vale em qualquer navegador) ou `code` (link padrão, só no navegador que pediu). Depois de salvar, a sessão é encerrada e a pessoa entra de novo com a senha nova. Mínimo de 6 caracteres, igual ao perfil.

## Permissões

Ficam em `roles.permissions` (JSONB). A UI está em `web/app/admin/roles/page.tsx`. O menu usa `can()` em `web/contexts/user-context.tsx`.

| Flag | Efeito |
|------|--------|
| `can_submit_request` | Menu Solicitações e abertura de pedido |
| `can_approve` | Aprovar / avançar etapa; também libera Governança |
| `can_reject` | Rejeitar; também libera Governança |
| `can_attend` | Botão Iniciar atendimento |
| `can_view_pdm` / `can_edit_pdm` | Ver e editar templates |
| `can_bulk_import` | Importação em massa |
| `can_view_workflows` / `can_edit_workflows` | Ver e alterar fluxos |
| `can_view_database` | Base de dados |
| `can_manage_users` | Gestão de usuários |
| `can_manage_roles` | Perfis |
| `can_manage_fields` | Dicionário de campos |
| `can_manage_value_dictionary` | Dicionário de valores |
| `can_view_logs` | Auditoria |
| `can_standardize` | Padronização na base, integração/eliminação ERP e alteração de status em lote (Ativo / Bloqueado / Obsoleto) |
| `can_view_reports` | Tela de Relatórios. Ligada em ADMIN e MASTER (migration 029, também em papel novo) |

Papéis semeados no onboarding e na Empresa Demo: ADMIN e MASTER (quase tudo), SOLICITANTE (abre pedido, vê PDM, base e workflow), CADASTRO (atende, edita PDM, campos e importação), COMPRAS, MRP, FISCAL e CONTABILIDADE (aprovam, rejeitam, consultam).

Cada um desses nomes é um grupo de perfil. O usuário pode ter vários grupos. A permissão de tela é a união dos grupos mais extras individuais (`user_permission_grants`). Extra que o grupo já cobre não é gravado de novo e aparece travado na tela. `users.role_id` continua sendo um único papel de etapa, e precisa ser um dos grupos marcados: é ele que define os campos da governança para quem não está no grupo ADMIN. Quem está no grupo ADMIN, ou é master, vê os campos da fase atual da solicitação. Usuário novo abre sem nenhum grupo marcado: o admin escolhe, para ninguém ganhar o primeiro grupo da lista (às vezes ADMIN) sem querer.

O master atua em qualquer etapa como o responsável dela, sem trocar de perfil: vê todas as colunas, tem **Iniciar atendimento** em qualquer solicitação livre e, depois de assumir, preenche os campos da etapa atual (o título mostra a área da etapa) e tem Salvar, Salvar e Aprovar e Rejeitar. O histórico registra o master como quem agiu. Solicitação já assumida por outra pessoa continua com ela.

Grupos de sistema (ADMIN, SOLICITANTE, CADASTRO, COMPRAS, MRP, FISCAL, CONTABILIDADE, MASTER) não são apagados e o nome não muda. Grupos criados pelo admin podem.

`can_attend` vale para ADMIN, CADASTRO, COMPRAS, MRP, FISCAL e CONTABILIDADE; MASTER e SOLICITANTE ficam sem. A migration 025 põe a chave em todo papel inserido sem ela (gatilho `trg_roles_default_can_attend`, que cobre o onboarding e o script da Empresa Demo) e corrigiu os papéis criados depois da 008. Papel que já chega com a chave, como os da tela de grupos, mantém o valor escolhido. Para o usuário master a flag não importa: `can()` é sempre verdadeiro para ele.

Regra de evolução: tela nova ganha flag `can_*`, entra no grupo de `web/lib/permissions.ts` e no filtro do `app-sidebar.tsx`. O menu usa só `can()`. Master continua vendo o menu inteiro.

## Workflow

- Etapas são linhas de `workflow_config` (`step_name`, `status_key`, `order`, `is_active`), ligadas a um `workflow_header`.
- Status `pending` ou vazio avança para a primeira etapa ativa.
- Aprovar vai para o próximo `status_key`. Sem próximo, o status vira concluído.
- Status final (`completed`, `approved`, `concluído`, `finalizado`, `rejected`) não avança de novo.
- Só o atendente atual (ou ninguém) pode assumir. Outro usuário recebe erro de conflito.
- **Cada área só na própria etapa (migration 034):** atender, salvar os campos, aprovar e rejeitar só quem tem como papel de etapa (`users.role_id`) a área da etapa atual. A área tem o nome da etapa em maiúsculas: `cadastro` → CADASTRO, `compras` → COMPRAS. ADMIN (papel ou grupo) e Master atuam em qualquer etapa. Regra no banco (`can_act_on_stage`); na tela, cada área vê só a coluna dela no kanban.
- Arrastar o cartão entre etapas é só do ADMIN e do Master. A área aprova ou rejeita a própria etapa; arrastando, pularia as etapas das outras.
- Solicitação fechada não pode ser rejeitada, aprovada nem atendida. Fechada = finalizada, rejeitada ou cancelada. A regra é única: `lib/request-status.ts` na tela, `is_closed_status()` no banco.
- **Rejeição (migration 036):** exige um motivo padrão (`lib/rejection-reasons.ts`: duplicado, falta informação, PDM errado, especificação incorreta, não é material de cadastro, outro) e a justificativa em texto. O histórico guarda motivo e etapa; o relatório Rejeições agrupa por etapa e por motivo.
- **Cancelamento (migration 036, status `cancelado`):**
  - **Solicitante:** cancela a própria enquanto ela está na primeira etapa e ninguém iniciou o atendimento.
  - **Depois disso:** só o ADMIN ou o Master, pela governança.
  
  Cancelada sai do fluxo e não reabre. Se o Admin cancela, o solicitante é avisado.
- **Prazo por etapa (migration 036):** `workflow_config.sla_days`, configurável em Configurações → Workflow; sem prazo valem 5 dias. `material_requests.stage_entered_at` guarda quando a solicitação entrou na etapa atual, mantido por gatilho. Na governança, **atrasada** é a que está parada na etapa além do prazo dela.
- **Arraste pelo Admin:** a área da etapa de destino recebe aviso ("movida para…"), na mesma preferência de "aprovada".
- Rejeitada pode ser **corrigida e reenviada** (`resubmit_request`, migration 028) por quem abriu, por quem está no grupo ADMIN do tenant ou pelo Master. A mesma solicitação (mesmo REQ) recebe PDM, atributos, descrição, urgência e justificativa corrigidos e volta para a primeira etapa ativa do workflow, sem atendente. O histórico grava `resubmitted` com a descrição e os atributos anteriores; a área da primeira etapa é avisada como numa solicitação nova. Antes de reenviar, a checagem de duplicidade roda de novo.
- O arraste no kanban não finaliza, não rejeita e não reabre solicitação finalizada ou rejeitada. Essas mudanças só pelas RPCs (`advance_workflow`, `reject_request`), que gravam histórico, avisam e criam o material.
- Entre etapas intermediárias, o arraste (ADMIN e Master) passa por `move_request_stage` (migration 026): valida que a etapa é do workflow, libera o atendente e grava `stage_change` no histórico com etapa de origem, destino e atendente anterior. Não gera aviso.
- Ao entrar em finalizado, nasce o material na base, com descrições preenchidas a partir do PDM.

## Descrição do material

- Entram na frase só atributos com `includeInDescription`.
- Lista usa a abreviação do valor permitido, se houver; senão o próprio valor.
- Número com unidade concatena valor e unidade.
- Tudo em maiúsculas, separado por espaço, começando pelo nome do PDM.
- O limite padrão é 40, em `tenants.max_description_length` e também em `users.max_description_length`. A descrição detalhada fica em coluna própria.
- Antes de criar, `checkDuplicateRequest` compara os atributos que entram na descrição com materiais do mesmo `pdm_code` e com solicitações abertas do mesmo PDM.
- Atributo sem valor fica fora da descrição gravada. O marcador `[ABREV]` só aparece na prévia do resumo.

## Texto aceito pelo ERP

- Todo texto que vai para o material sai sem acento, sem `ç` e sem caractere especial. A regra está em `lib/erp-text.ts` (`toErpText`) e espelhada no banco (`erp_text`, migration 030).
- Troca: letra acentuada vira a letra simples, `ç` vira `c`, `º`/`ª` viram O/A, `°` some, `½` vira `1/2`, aspas e travessões tipográficos viram `"`, `'` e `-`. O resto fora da lista (letras, números, espaço, quebra de linha e `. , - / ( ) % + * # " ' : ; = & _ @`) é removido.
- Normaliza na digitação: nome do PDM, atributos e valores permitidos, campos da solicitação, governança e edição do material. Também ao salvar (API do cliente) e nas rotas de servidor: importação de materiais e PDMs, API v1.
- Trava final: `buildErpPayload` normaliza tudo antes de enviar ao ERP, então nada com acento chega lá mesmo que algum caminho escape.

## Código e nome do PDM

- Código interno: até 10 caracteres, letras maiúsculas, números, `-` e `_` (`ck_pdm_internal_code_format`). Padrão: 4 letras do nome (sem DE, DA, PARA etc.) + 3 dígitos, ex.: `PARA001` (`lib/pdm-code.ts`). Código vazio recebe a sugestão ao salvar, clonar ou importar.
- Código e nome não se repetem no tenant (nome sem diferença de maiúsculas e espaços, `uq_pdm_templates_tenant_name`).
- Trocar código ou nome do PDM atualiza `pdm_code` e `pdm_name` dos materiais ligados.
- A migration 030 recodificou os PDMs fora do padrão (materiais acompanham) e renomeou o nome repetido mais recente para "Nome 2".

## Duplicidade e trava do ERP

A regra fica em `web/lib/material-duplicates.ts` e vale igual para o selo **DUP** da base, para a checagem da solicitação e para a trava do servidor (`web/lib/erp/duplicate-guard.ts`). A marcação não é gravada: é calculada na hora, dentro do tenant.

- **Base:** dois materiais são duplicados quando têm a mesma descrição detalhada (sem diferenciar maiúsculas) ou, sem detalhada, a mesma descrição curta no mesmo PDM.
- **Solicitação:** os mesmos atributos que entram na descrição, no mesmo PDM, que outro material ou outra solicitação aberta.
- Material **Obsoleto** não conta para nenhum dos dois lados. Bloqueado conta.
- Material marcado como duplicado **não é criado nem alterado no ERP**, por nenhum caminho: botão no detalhe, lote na base, conclusão da última etapa e simulação sem integração ativa. A chamada volta como ignorada com os códigos duplicados e grava `erp_blocked_duplicate` no log do sistema.
- **Eliminar no ERP continua liberado** para duplicado: eliminar um dos itens é uma das formas de resolver.
- A marcação some sozinha quando a descrição ou os atributos mudam, ou quando o outro item fica Obsoleto. A partir daí o material sincroniza normalmente.
- Na governança, a solicitação finalizada cujo material ficou travado (ou em erro, pendente ou sem material) continua em Finalizado, mas o cartão fica vermelho até o material chegar ao ERP. A trava é a mesma do servidor, consultada por `GET /api/requests/erp-status`.

## Dicionário de valores

- Só atributos `lov` ou `select` alimentam o dicionário.
- Sincronizar cria valores novos e completa abreviação quando o PDM tem e o dicionário não.
- Similaridade é fuzzy (`pg_trgm`). Par dispensado não volta na lista.
- Unificar e propagar devem manter PDM, solicitações abertas e materiais coerentes com o valor escolhido.

## Campos e máscaras

`web/lib/masks.ts`: NCM, CFOP, CNPJ, CPF, telefone, CEP, moeda e decimal. Máscara vale para texto e número. Select e data não recebem máscara. Preço (`ultimo_preco`, `preco_padrao`, `preco_medio_movel`) é tipo `currency`.

## Anexos

PNG, JPG, WEBP, GIF e PDF. O storage só deixa ler e gravar na pasta do tenant da sessão.

## Auditoria e histórico

- `request_history` registra ações da solicitação.
- `system_logs` registra eventos administrativos (usuário alterado, etc.).
- Não gravar segredo (senha, service role) em `event_data`.

## Notificações

- Criar, iniciar atendimento, aprovar e rejeitar geram aviso. Aprovar até a etapa final conta como concluída.
- Criação e aprovação avisam quem tem o papel de etapa, ou um grupo, com o mesmo nome do status (`CADASTRO` e `cadastro`). Atendimento, rejeição e conclusão avisam o solicitante. Quem executou a ação não recebe o próprio aviso.
- Sem linha em `user_notification_prefs`, sino e e-mail ficam ligados. Cada canal pode ser desligado no perfil.
- O e-mail sai pela rota `POST /api/notifications/request`, só se o histórico da ação for do usuário logado e tiver menos de cinco minutos. A mesma pessoa não recebe o mesmo evento de novo em dez minutos.
- `RESEND_API_KEY` não vai para o browser.

## Suporte

- A tela `/support` lista e abre chamados da empresa que está na sessão. O Master usa o tenant para o qual trocou.
- O browser chama só `/api/support/*`. `AXISDESK_API_KEY` fica no servidor, no header `x-api-key`.
- O webhook `POST /api/support/webhook` exige `x-axisdesk-secret` igual a `AXISDESK_WEBHOOK_SECRET`. Status ou comentário gera aviso no sino do solicitante, e o clique abre o chamado.
- Título até 200 caracteres, descrição e mensagem até 2000, no máximo 5 anexos de 4 MB.

## Integrações

Com integração ativa para a operação, o PRO-MAT chama o ERP de verdade. Sem integração ativa, o botão **Integrar com ERP** continua na simulação (código `MAT-######` falso) e a última etapa não dispara nada. O monitor registra as chamadas de material, sem corpo da requisição. O AxisDesk não entra nessa tela.

- **PRO-MAT para o ERP:** criação, alteração e eliminação. O ERP só devolve a resposta da chamada. Na criação, a resposta traz o código do material (`id_erp`).
- **Solicitação, interna ou de origem externa:** ao concluir a última etapa, o material nasce na base e a criação no ERP dispara sozinha. A origem muda só quem abriu a solicitação. Se o ERP falhar, a solicitação permanece finalizada, o material fica pendente ou em erro, e a nova tentativa é o botão da base. Não nasce outro `MDM-######` nem outra criação no ERP para a mesma solicitação.
- **Sistema externo na base:** criação e alteração gravam o material e deixam **Pendente ERP**. A consulta só lê. Uma pessoa integra, um a um ou em lote. Sem `id_erp`, a chamada é criação; com `id_erp`, é alteração. Eliminação não entra por essa porta.
- **Chave de API:** uma por sistema externo e por tenant, gerada pelo Master em Tenants → Configuração → Chaves de API. A base guarda só o hash; o texto aparece uma vez. Chave revogada para na hora. Material em `integrando` não aceita alteração (409).
- **Integrações com o ERP:** várias por tenant, só o Master edita, em Tenants → Configuração. Cada uma tem operação (criação, alteração ou eliminação de material), tipo (POST, PATCH, DELETE ou GET), URL, tempo limite e autenticação. Só uma fica ativa por operação; a nova nasce desativada se já houver outra ativa. A URL aceita `{id_erp}` e `{id_sistema}` e precisa ser `https` em produção. O segredo é cifrado no servidor com `INTEGRATION_SECRET_KEY` e nunca volta para o browser; em branco mantém o atual. Incluir, modificar, ativar, desativar e excluir gravam registro no log do sistema, sem o segredo.
- **Chamada ao ERP:** o material vai para `integrando` antes da chamada; outra chamada ao mesmo material é recusada até voltar. Na criação, o código sai do campo da resposta configurado na integração (padrão `productId`); sem código, conta como erro. Sucesso deixa `integrado_erp` com `id_erp`; erro deixa `erro_erp` com a mensagem do ERP, e o botão tenta de novo. Alteração usa a integração de alteração e mantém o `id_erp`. Eliminação exige `id_erp` e integração de eliminação ativa; com sucesso, o material fica **Obsoleto** e `integrado_erp` (sincronizado). **Sincronizar** na base roteia pelo status de negócio: Ativo → criar/alterar; Obsoleto com `id_erp` → eliminar; Bloqueado → não envia. Marcar Obsoleto em lote (com `id_erp`) deixa `pendente_erp` para a sincronização eliminar. Integrar/sincronizar/eliminar pedem `can_standardize`; o disparo da última etapa pede `can_approve`. OAuth2 pede o token na URL configurada e reaproveita até expirar.
- **Documentação:** a tela `/admin/integration-docs` e o OpenAPI saem de `web/lib/integration-docs/catalog.ts`. Os exemplos de entrada passam pela validação das rotas e o JSON do ERP de exemplo é montado por `buildErpPayload`, ambos checados em teste. Mudou campo, rota ou erro: atualizar o catálogo no mesmo trabalho. O OpenAPI é gerado na tela, sem rota pública.
- **JSON do ERP:** o PRO-MAT monta o formato do ERP a partir do material (`web/lib/erp/payload.ts`). `contentID` é o `id_sistema` e `productId` é o `id_erp`. Do material saem `type`, `unitMeasure`, `ncmCode`, `internalGroup` (grupo de mercadoria) e `descriptions`. `eans`, `dimensions`, `sales` e `characteristics` são listas porque o mesmo nome pode repetir. Campo do cabeçalho sem coluna própria fica em `additional_fields`. Campo do dicionário vai para o bloco de `erp_block` com o nome de `erp_field`; sem bloco, vai para `characteristics`.

## Segurança contínua

O gate não promete segurança total. Ele impede que regras já conquistadas se percam sem ninguém ver. Roda com `npm test`, com `npm run check` e no GitHub Actions a cada push e pull request (`.github/workflows/ci.yml`).

- **Rotas:** toda rota em `app/api` precisa da guarda do seu tipo (sessão, `handleApiCall` para `/api/v1`, `verifyWebhookSecret` para webhook). Rota nova sem guarda quebra o teste.
- **Browser:** arquivo `'use client'` não importa módulo com chave de serviço ou segredo e só lê variáveis `NEXT_PUBLIC_`. `SUPABASE_SERVICE_ROLE_KEY` só aparece em `lib/supabase/admin.ts`.
- **Banco:** toda tabela criada em migration tem RLS ligado. `api_clients` e `tenant_erp_connections` não abrem para `anon` nem `authenticated`.
- **Repositório:** nenhum `.env` versionado e nenhuma chave real (PRO-MAT, JWT ou secret do Supabase, Resend) em arquivo versionado.
- **Dependências:** `scripts/security-audit.mjs` falha com vulnerabilidade high ou critical em dependência de produção fora de `security/audit-allowlist.json`. Cada exceção tem motivo e data de revisão; vencida, volta a falhar.
- **APIs de material:** até 120 chamadas por minuto por chave (429 com `Retry-After`). Sem chave válida, teto geral de 60 por minuto; acima disso nem grava no monitor.
- **Headers:** `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` em toda resposta; HSTS em produção. Sem `X-Powered-By`.
- **CSP:** `proxy.ts` gera um nonce por requisição e manda `Content-Security-Policy` (`lib/csp.ts`):
  - script só do próprio site com o nonce (`strict-dynamic`);
  - conexão só com o próprio site e o Supabase;
  - `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.
  
  O script de tema recebe o nonce no `layout.tsx`. Script inline novo precisa do nonce.
- **CSRF:** alteração (POST, PUT, PATCH, DELETE) em `/api` com sessão, vinda de outro site, recebe 403 (`isCrossSiteWrite`, com `Sec-Fetch-Site` ou `Origin`).
- **Busca:** texto digitado passa por `safeSearchTerm` antes de entrar num filtro `.or()` do PostgREST.
- **Senha:** mínimo de 8 caracteres, com letra minúscula, maiúscula, número e símbolo (`lib/password-policy.ts`, igual ao Supabase Auth), no perfil, na redefinição, na criação de usuário e no onboarding. Trocar a própria senha exige a atual. Conta criada por importação ou onboarding sem senha nasce com senha aleatória e o usuário cria a dele pelo e-mail. A mesma regra precisa estar no Supabase Auth, que é quem trava de fato.
- **Sonda:** `npm run security:probe` cria dois tenants temporários e tenta, pela chave pública:
  - acesso sem login;
  - leitura e alteração entre tenants;
  - autopromoção;
  - pular etapa;
  - forjar ERP;
  - apagar log.
  
  Confere no banco que nada mudou, confere que o uso legítimo continua funcionando e apaga tudo.
- **Quando rodar cada teste:** a sonda e o E2E gravam no banco, que hoje é o de produção, e gastam o orçamento de disco do plano.
  - **Durante o trabalho:** só os testes que não usam o banco: `npm run check` (unitários, tipos e auditoria) e `next build`.
  - **Antes de cada commit:** uma rodada só de `npm run security:probe` (em `web`) e `npm run test:e2e` (em `tests`), com as correções do período juntas.
  - Migration de policy ou função entra no commit só depois dessa rodada.

Exceção a qualquer regra entra no próprio teste (`web/security/gate.test.ts`) ou na allowlist, sempre com motivo.

## Tema

Claro e escuro são da aplicação, não do sistema operacional. Componentes de urgência e status precisam de variante explícita para os dois modos. O `CONTEXT.md` antigo guardava a paleta de badges; ao mexer em urgência, conferir os estilos inline que usam `useTheme()`.
