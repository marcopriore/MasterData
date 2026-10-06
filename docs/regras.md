# Regras já desenvolvidas

## Multi-tenant

- Quase toda tabela de negócio tem `tenant_id`.
- RLS usa `get_user_tenant_id()`. Para usuário comum, o tenant vem do perfil. Para master, vem de `app_metadata.tenant_id` (troca de cliente).
- `is_master_user()` libera visão cruzada onde a policy permite. No dashboard, a aplicação ainda filtra pelo tenant efetivo, porque a policy do master devolve todas as linhas.
- Unidades de medida são globais.
- Troca de tenant é exclusiva de quem tem `is_master` no metadata de auth.

## Autenticação

- Supabase Auth. O perfil em `public.users` usa o mesmo UUID de `auth.users`.
- `web/middleware.ts` exige sessão fora de `/login`. O matcher não cobre `/api` nem caminhos `/admin` — as telas `/admin/*` dependem do layout e das checagens de permissão no cliente e nas rotas de API.
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

Grupos de sistema (ADMIN, SOLICITANTE, CADASTRO, COMPRAS, MRP, FISCAL, CONTABILIDADE, MASTER) não são apagados e o nome não muda. Grupos criados pelo admin podem.

`can_attend` não está no JSON do seed nem do script da Empresa Demo. A migration 008 liga a flag em ADMIN, CADASTRO, COMPRAS, MRP, FISCAL e CONTABILIDADE, e desliga em MASTER e SOLICITANTE — só nos papéis que já existiam quando ela rodou. Tenant criado depois, pelo script, nasce sem essa chave até alguém reaplicar o update.

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

## Tema

Claro e escuro são da aplicação, não do sistema operacional. Componentes de urgência e status precisam de variante explícita para os dois modos. O `CONTEXT.md` antigo guardava a paleta de badges; ao mexer em urgência, conferir os estilos inline que usam `useTheme()`.
