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
  | Alterar material | `can_standardize`; quem só tem `can_edit_pdm` muda apenas descrição, descrição detalhada e PDM (a edição do PDM refaz as descrições; trava `guard_material_database`, migration 044) |
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
- **Campos obrigatórios da etapa:** `advance_workflow` recusa aprovar sem eles (`stage_missing_fields`), com a mesma regra da tela. Desde a 038 vale para qualquer etapa (área = nome da etapa em maiúsculas), não só as cinco padrão; `descricao_basica` é gerada. `stage_missing_fields` e `field_effective` recebem o tenant por parâmetro e por isso só o banco e o service role as executam.
- **Regras por material (migrations 038 e 039, `lib/field-rules.ts` ↔ `field_effective()`):**
  - **Regra padrão:** a etapa (`field_dictionary.responsible_role`) e a obrigatoriedade (`is_required`) de cada campo. Vale para todo material sem regra por condição.
  - **Regra por condição:** condição principal (campo de lista + valor, ex.: Tipo de Material = FERT) e, se quiser, mais condições (todas precisam bater). Campo a campo, a regra diz a etapa em que ele aparece e se é obrigatório, ou que não aparece. Grava só o que difere do padrão. Nome e valores sem acento e em maiúsculas.
  - Vence a regra mais específica (mais condições); empate, a mais exigente (obrigatório > opcional > não aparece). Duas regras com as mesmas condições não são aceitas na tela.
  - Campo usado como condição por alguma regra ativa não muda por regra e **só se altera na etapa padrão dele** (gatilho `guard_request_area`). Para corrigir depois, o Admin devolve a solicitação para essa etapa pelo kanban.
  - Na governança, o formulário da etapa recalcula na hora: entra o campo que a regra mandou para essa etapa, some o que não aparece, o asterisco segue a regra. A aprovação no banco cobra a mesma regra.
  - Configuração em Dicionário de Campos → aba Regras, com `can_manage_fields`; leitura liberada ao tenant. A aba Campos só cadastra o campo (nome, referência ERP, visão, tipo, opções, status); campo novo entra opcional na etapa Cadastro. Planilha de duas abas (Condições e Campos; célula "ETAPA · Obrigatório", "ETAPA · Opcional" ou "Não aparece"); a importação cria ou atualiza pelo nome e não grava nada se houver erro.
- **Regras por material na Base de Dados (migration 040, `lib/material-rules.ts` ↔ `material_missing_fields()`):**
  - No material da base, **obrigatório é todo campo que a regra exige em qualquer etapa** (a etapa não importa). Vale para criar e para alterar, **inclusive material antigo incompleto**: para salvar uma alteração, completa os obrigatórios.
  - Leitura do material: o valor do campo fica em `technical_attributes`; `tipo_material`, `unidade_medida_base`, `grupo_mercadorias` e `ncm` usam a coluna própria (`material_type`, `unit_of_measure`, `material_group`, `ncm`) quando o atributo está vazio. `descricao_basica` é gerada e não conta.
  - Edição manual: a tela esconde o campo que não aparece para o material, marca o obrigatório com asterisco e avisa o que falta antes de salvar. O gatilho `guard_material_field_rules` cobra no banco quando quem logou muda os atributos ou essas colunas; mudança só de status, ERP, PDM ou descrição regerada passa. O Tipo de Material, quando está no dicionário, é editado pelo campo do dicionário.
  - Importação por planilha: uma coluna por campo ativo do dicionário, com o identificador do campo no cabeçalho (o modelo e a exportação já trazem). Linha que não cumpre a regra vira erro com a lista dos campos; campo que não se aplica ao material é ignorado com aviso; na edição, vale o material como fica depois. Código inexistente vira erro; falha de gravação volta na resposta.
  - API de materiais: campos do dicionário em `atributos`, pela chave do campo. Falta obrigatório: 422 com "chave (nome)" em `detalhes`; campo que não se aplica volta em `avisos` e não é gravado.
  - ERP: campo que não aparece para o material não vai no JSON.
- **Tipos de solicitação (migrations 043 e 045):** Cadastro (material novo), Alteração (material já cadastrado) e Ampliação (material já cadastrado para outro centro). Cada tipo tem o seu workflow, **um ativo por tipo e tenant**, configurado em Configurações → Workflows (seletor de tipo; ativar um desativa só o outro do mesmo tipo). Todo tenant ganhou o "Fluxo de Alteração" e o "Fluxo de Ampliação" (cópias das etapas do workflow de cadastro), e o onboarding já cria. A Governança tem uma aba por tipo.
- **Centros (migration 045):**
  - Lista de centros por empresa em Administração → Centros (`/admin/centers`), com código (até 4 caracteres, travado no banco pela migration 046) e nome; grava quem tem `can_manage_fields` (Dicionário de Dados). Centro em uso não é excluído, só desativado.
  - Campo **Por centro** no Dicionário de Campos (`field_dictionary.per_center`): o valor pode mudar de centro para centro. Vem marcado para MRP, Compras e Contabilidade, inclusive nos campos copiados para tenant novo ou criados sem dizer.
  - Centros do material em `material_centers`. O **centro inicial** (`is_origin`) usa os campos do próprio material; o centro acrescentado por Ampliação guarda os seus valores. Ninguém grava centro do material direto pela API: só a aprovação e a função do centro inicial.
  - **Cadastro:** com centro ativo na empresa, a solicitação de material novo escolhe o centro inicial (obrigatório, recusado pelo banco sem ele); na aprovação final o material nasce com esse centro. Sem centro cadastrado, nada muda. A API de solicitações (service role) não pede centro.
  - **Material antigo sem centro:** no detalhe do material, quem tem `can_standardize` informa o centro inicial (`set_material_origin_center`). Material com centro recebe outro só por Ampliação.
  - Centro novo no material deixa o material Pendente ERP e entra no histórico.
- **Ampliação (migration 045):**
  - Abre pelo botão **Ampliação** no detalhe do material encontrado na pesquisa da Nova Solicitação (`/requests/ampliacao/[id]`). O solicitante escolhe o centro (ativo e que o material ainda não tem) e propõe os valores dos campos por centro, que partem dos valores do material.
  - Os campos da Ampliação (`change_fields`) são os campos por centro ativos do dicionário, definidos pelo banco na abertura; `change_previous` guarda os valores do material.
  - Uma ampliação aberta por material e centro. Material Obsoleto não é ampliado. Mesmo PDM do material. O centro não muda depois de aberta.
  - Cada etapa revisa só os campos por centro que são dela; a descrição não muda e não há checagem de duplicidade.
  - Aprovação final: o centro entra em `material_centers` com os valores revisados; o material não muda os seus campos e volta para Pendente ERP (com integração ativa, sai como "alterar material", com os centros).
  - Rejeitada: **Corrigir e reenviar** abre a própria tela da Ampliação (`/requests/ampliacao/[material]?reenviar=ID`) no mesmo centro, com os valores pedidos e o motivo; o centro não muda (para outro, abre-se outra ampliação). `resubmit_expansion_request` (migration 047) recusa se o material já ganhou o centro, se o centro foi desativado ou se há outra ampliação aberta para ele.
- **Reenvio pelo caminho do tipo (migration 047):** `resubmit_request` só reenvia cadastro; Alteração e Ampliação têm cada uma a sua função, e o assistente de cadastro redireciona um `?reenviar=` de outro tipo para a tela certa. Reenvia quem abriu, o Admin ou o Master; volta para a primeira etapa do workflow da própria solicitação.
- **Link do aviso (sino e e-mail):** o que vai para o solicitante (atendimento iniciado, rejeitada, cancelada, concluída) abre o detalhe em Minhas Solicitações (`/requests?req=ID`); o das áreas abre a Governança. Quem não acessa a Governança cai sempre em Minhas Solicitações.
  - JSON do ERP: material com centro leva `sites`, um item por centro com `siteCode` e os campos por centro pelo Campo ERP (o centro inicial com os valores do material). O formato precisa ser confirmado com o ERP real.
- **Alteração (migration 043):**
  - Abre pelo botão **Alteração** no detalhe do material encontrado na pesquisa da Nova Solicitação (`/requests/alteracao/[id]`). O solicitante marca os campos que mudam (atributos do PDM e campos do dicionário que aparecem para o material) e informa os valores novos e o motivo.
  - Não muda: Tipo de Material (o ERP não permite), descrição básica gerada. Material Obsoleto não é alterado. Uma alteração aberta por material de cada vez. Mesmo PDM do material.
  - A solicitação nasce com os valores atuais do material e os novos por cima; `change_previous` guarda os de antes, gravado pelo banco (o navegador não define).
  - Cada etapa revisa e aprova só os campos escolhidos que são dela (a cobrança de obrigatório na aprovação também). Os atributos do PDM não são editados na governança: a área aprova ou rejeita o que foi pedido.
  - Mexeu em atributo do PDM: a descrição é refeita e passa de novo pela checagem de duplicidade (o próprio material não conta).
  - Aprovação final: o banco aplica só os campos escolhidos no **mesmo material** (não cria outro), que volta para Pendente ERP; com integração ativa, sai como "alterar material". O histórico do material registra a solicitação.
  - Rejeitada: **Corrigir e reenviar** abre a própria tela da Alteração (`/requests/alteracao/[material]?reenviar=ID`), com os campos e valores pedidos e o motivo da rejeição; dá para trocar os campos e os valores, nunca o PDM nem o Tipo de Material. `resubmit_change_request` (migration 047) refaz as travas da abertura e relê o "antes" do material.
- **Histórico do material (migration 042):** `material_history`, gravado por gatilho em `material_database` em qualquer caminho (tela, importação, API, aprovação, ERP real ou simulado): criação (origem e solicitação), mudança de status, mudança da situação no ERP (com código ou mensagem de erro) e alteração de campos (quais). Quem fez é o usuário logado; no servidor fica "Sistema". Lê quem tem `can_view_database` no tenant; ninguém grava pela API. A tela junta a solicitação de origem (solicitante, atendentes de cada etapa e os eventos dela). A 042 preencheu o passado: criação de todo material e os eventos de ERP e de status em lote que já estavam no log.
- **Tipo de Material não muda em material da base (migration 041):** o ERP não permite trocar o tipo de um material existente. Uma vez definido (atributo `tipo_material` ou coluna `material_type`), o gatilho `guard_material_type_lock` recusa a troca em qualquer gravação: tela, importação, API e scripts. Material antigo sem tipo pode receber o primeiro. Na tela o campo fica só leitura; a importação marca a linha com erro; a API responde 422.
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
| `can_view_database` | Ver a Base de Dados e exportar a lista, sem nenhuma ação |
| `can_standardize` | **Editar materiais** na base (cadastro e atributos) |
| `can_change_material_status` | Alterar status em lote (Ativo / Bloqueado / Obsoleto) — migration 044 |
| `can_sync_erp` | Sincronizar, integrar e eliminar no ERP — migration 044 |
| `can_view_reports` | Tela de Relatórios. Ligada em ADMIN e MASTER (migration 029, também em papel novo) |

Papéis semeados no onboarding e na Empresa Demo: ADMIN e MASTER (quase tudo), SOLICITANTE (abre pedido, vê PDM, base e workflow), CADASTRO (atende, edita PDM, campos e importação), COMPRAS, MRP, FISCAL e CONTABILIDADE (aprovam, rejeitam, consultam).

Cada um desses nomes é um grupo de perfil. O usuário pode ter vários grupos. A permissão de tela é a união dos grupos mais extras individuais (`user_permission_grants`). Extra que o grupo já cobre não é gravado de novo e aparece travado na tela. `users.role_id` continua sendo um único papel de etapa, e precisa ser um dos grupos marcados: é ele que define os campos da governança para quem não está no grupo ADMIN. Quem está no grupo ADMIN, ou é master, vê os campos da fase atual da solicitação. Usuário novo abre sem nenhum grupo marcado: o admin escolhe, para ninguém ganhar o primeiro grupo da lista (às vezes ADMIN) sem querer.

O master atua em qualquer etapa como o responsável dela, sem trocar de perfil: vê todas as colunas, tem **Iniciar atendimento** em qualquer solicitação livre e, depois de assumir, preenche os campos da etapa atual (o título mostra a área da etapa) e tem Salvar, Salvar e Aprovar e Rejeitar. O histórico registra o master como quem agiu. Solicitação já assumida por outra pessoa continua com ela.

Grupos de sistema (ADMIN, SOLICITANTE, CADASTRO, COMPRAS, MRP, FISCAL, CONTABILIDADE, MASTER) não são apagados e o nome não muda. Grupos criados pelo admin podem.

`can_attend` vale para ADMIN, CADASTRO, COMPRAS, MRP, FISCAL e CONTABILIDADE; MASTER e SOLICITANTE ficam sem. A migration 025 põe a chave em todo papel inserido sem ela (gatilho `trg_roles_default_can_attend`, que cobre o onboarding e o script da Empresa Demo) e corrigiu os papéis criados depois da 008. Papel que já chega com a chave, como os da tela de grupos, mantém o valor escolhido. Para o usuário master a flag não importa: `can()` é sempre verdadeiro para ele.

**Acesso pelo endereço (link colado, favorito):** o `AppShell` só monta a tela se `canOpenPath` (`web/lib/nav-access.ts`) deixar; senão mostra "Acesso negado". A regra é a mesma do menu: o que o menu esconde, o endereço não abre. Tela sem regra em `canOpenPath` fica fechada para todos menos o Master. Dentro da tela, **ver não dá ação**: criar, editar, importar e excluir pedem a permissão de editar (Workflows `can_edit_workflows`, PDM `can_edit_pdm`, Base `can_standardize` / `can_change_material_status` / `can_sync_erp` / `can_bulk_import`); sem ela, a tela fica só leitura. O banco (RLS e gatilhos) e as rotas do servidor recusam de novo.

Regra de evolução: tela nova ganha flag `can_*`, entra no grupo de `web/lib/permissions.ts`, no filtro do `app-sidebar.tsx` **e em `canOpenPath`**, e os botões de ação conferem a permissão de editar. O menu usa só `can()`. Master continua vendo o menu inteiro.

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
- **Fechadas na governança (migration 037):** o quadro traz as abertas e só as fechadas nos últimos 90 dias (30 dias, 12 meses ou todas, no seletor). Fechada segue `is_closed_status`, guardada em `material_requests.is_closed`; o fechamento é `stage_entered_at`. Indicadores contam o que o quadro mostra.
- **Relatório de integração ERP (migration 037):** lê o log do sistema, que só quem tem `can_view_logs` lê direto. Por isso as funções `report_erp_integrations` e `report_erp_errors` rodam como dono, exigem `can_view_reports` e filtram pelo tenant em uso. A sonda confere as duas coisas.
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
- **Chamada ao ERP:** o material vai para `integrando` antes da chamada; outra chamada ao mesmo material é recusada até voltar. Na criação, o código sai do campo da resposta configurado na integração (padrão `productId`); sem código, conta como erro. Sucesso deixa `integrado_erp` com `id_erp`; erro deixa `erro_erp` com a mensagem do ERP, e o botão tenta de novo. Alteração usa a integração de alteração e mantém o `id_erp`. Eliminação exige `id_erp` e integração de eliminação ativa; com sucesso, o material fica **Obsoleto** e `integrado_erp` (sincronizado). **Sincronizar** na base roteia pelo status de negócio: Ativo → criar/alterar; Obsoleto com `id_erp` → eliminar; Bloqueado → não envia. Marcar Obsoleto em lote (com `id_erp`) deixa `pendente_erp` para a sincronização eliminar. Integrar/sincronizar/eliminar pedem `can_sync_erp` (migration 044); o disparo da última etapa pede `can_approve`. OAuth2 pede o token na URL configurada e reaproveita até expirar.
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
