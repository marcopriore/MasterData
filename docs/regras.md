# Regras já desenvolvidas

## Multi-tenant

- Quase toda tabela de negócio tem `tenant_id`.
- RLS usa `get_user_tenant_id()`. Para usuário comum, o tenant vem do perfil. Para master, vem de `app_metadata.tenant_id` (troca de cliente).
- `is_master_user()` libera visão cruzada onde a policy permite. No dashboard, a aplicação ainda filtra pelo tenant efetivo, porque a policy do master devolve todas as linhas.
- Unidades de medida são globais.
- Troca de tenant é exclusiva de quem tem `is_master` no metadata de auth.

## Autenticação

- Supabase Auth. O perfil em `public.users` usa o mesmo UUID de `auth.users`.
- `web/proxy.ts` (o antigo middleware; o Next 16 mudou o nome) passa por toda página e rota de API, menos arquivos estáticos. A regra de cada caminho está em `web/lib/route-guard.ts`: página sem sessão vai para `/login`; `/api/*` sem sessão recebe 401; `/api/v1` (chave) e `/api/support/webhook` (segredo) se autenticam na própria rota. A permissão de cada tela continua sendo checada na tela e na rota.
- Depois do login, o retorno (`from`) só aceita página interna. Endereço de outro site volta para `/`.
- Senha: cada usuário altera a própria (`user.id` tem de bater com o id da rota). Não existe reset administrativo da senha de outra pessoa.

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
| `can_standardize` | Ações de padronização / ERP na base |

Papéis semeados no onboarding e na Empresa Demo: ADMIN e MASTER (quase tudo), SOLICITANTE (abre pedido, vê PDM, base e workflow), CADASTRO (atende, edita PDM, campos e importação), COMPRAS, MRP, FISCAL e CONTABILIDADE (aprovam, rejeitam, consultam).

Cada um desses nomes é um grupo de perfil. O usuário pode ter vários grupos. A permissão de tela é a união dos grupos mais extras individuais (`user_permission_grants`). Extra que o grupo já cobre não é gravado de novo e aparece travado na tela. `users.role_id` continua sendo um único papel de etapa, e precisa ser um dos grupos marcados: é ele que define os campos da governança para quem não está no grupo ADMIN. Quem está no grupo ADMIN, ou é master, vê os campos da fase atual da solicitação.

O master atua em qualquer etapa como o responsável dela, sem trocar de perfil: vê todas as colunas, tem **Iniciar atendimento** em qualquer solicitação livre e, depois de assumir, preenche os campos da etapa atual (o título mostra a área da etapa) e tem Salvar, Salvar e Aprovar e Rejeitar. O histórico registra o master como quem agiu. Solicitação já assumida por outra pessoa continua com ela.

Grupos de sistema (ADMIN, SOLICITANTE, CADASTRO, COMPRAS, MRP, FISCAL, CONTABILIDADE, MASTER) não são apagados e o nome não muda. Grupos criados pelo admin podem.

`can_attend` não está no JSON do seed nem do script da Empresa Demo. A migration 008 liga a flag em ADMIN, CADASTRO, COMPRAS, MRP, FISCAL e CONTABILIDADE, e desliga em MASTER e SOLICITANTE — só nos papéis que já existiam quando ela rodou. Para o usuário master a flag não importa: `can()` é sempre verdadeiro para ele. Tenant criado depois, pelo script, nasce sem essa chave até alguém reaplicar o update.

Regra de evolução: tela nova ganha flag `can_*`, entra no grupo de `web/lib/permissions.ts` e no filtro do `app-sidebar.tsx`. O menu usa só `can()`. Master continua vendo o menu inteiro.

## Workflow

- Etapas são linhas de `workflow_config` (`step_name`, `status_key`, `order`, `is_active`), ligadas a um `workflow_header`.
- Status `pending` ou vazio avança para a primeira etapa ativa.
- Aprovar vai para o próximo `status_key`. Sem próximo, o status vira concluído.
- Status final (`completed`, `approved`, `concluído`, `finalizado`, `rejected`) não avança de novo.
- Só o atendente atual (ou ninguém) pode assumir. Outro usuário recebe erro de conflito.
- Ao entrar em finalizado, nasce o material na base, com descrições preenchidas a partir do PDM.

## Descrição do material

- Entram na frase só atributos com `includeInDescription`.
- Lista usa a abreviação do valor permitido, se houver; senão o próprio valor.
- Número com unidade concatena valor e unidade.
- Tudo em maiúsculas, separado por espaço, começando pelo nome do PDM.
- O limite padrão é 40, em `tenants.max_description_length` e também em `users.max_description_length`. A descrição detalhada fica em coluna própria.
- Antes de criar, `checkDuplicateRequest` compara os atributos que entram na descrição com materiais do mesmo `pdm_code` e com solicitações abertas do mesmo PDM.

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
- **Chamada ao ERP:** o material vai para `integrando` antes da chamada; outra chamada ao mesmo material é recusada até voltar. Na criação, o código sai do campo da resposta configurado na integração (padrão `productId`); sem código, conta como erro. Sucesso deixa `integrado_erp` com `id_erp`; erro deixa `erro_erp` com a mensagem do ERP, e o botão tenta de novo. Alteração usa a integração de alteração e mantém o `id_erp`. Eliminação exige `id_erp` e integração de eliminação ativa, sem simulação; com sucesso, o material fica **Obsoleto** e a linha permanece. Integrar e eliminar pedem `can_standardize`; o disparo da última etapa pede `can_approve`. OAuth2 pede o token na URL configurada e reaproveita até expirar.
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

Exceção a qualquer regra entra no próprio teste (`web/security/gate.test.ts`) ou na allowlist, sempre com motivo.

## Tema

Claro e escuro são da aplicação, não do sistema operacional. Componentes de urgência e status precisam de variante explícita para os dois modos. O `CONTEXT.md` antigo guardava a paleta de badges; ao mexer em urgência, conferir os estilos inline que usam `useTheme()`.
