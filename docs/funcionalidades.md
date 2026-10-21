# Funcionalidades desenvolvidas

Menu lateral em `web/components/app-sidebar.tsx`. Itens somem conforme as flags `can_*`. Usuário master vê o menu completo e o item Tenants.

## Telas

| Rota | Função |
|------|--------|
| `/login` | Login Supabase. Middleware devolve quem já está autenticado para a home. |
| `/` | Dashboard: atalhos, contagens e atividades recentes. |
| `/activity` | Lista completa das atividades do usuário. |
| `/request` | Nova solicitação em 5 passos. |
| `/governance` | Kanban e lista. É aqui que assumir, aprovar e rejeitar chamam as RPCs. |
| `/governance/request/[id]` | Detalhe da solicitação. Os botões de atendimento só mudam estado local e não gravam no banco. |
| `/database` | Base de materiais: filtros, colunas, import/export, status ERP. |
| `/database/[id]` | Detalhe do material, descrições curta e detalhada. |
| `/admin-pdm` | Templates PDM, atributos, import/export. |
| `/support` | Chamados AxisDesk da empresa: abrir, acompanhar, responder, aprovar, reprovar ou cancelar. |
| `/settings/profile` | Perfil, senha própria e preferências de notificação. |
| `/settings/workflow` | Fluxos e etapas (ordem com drag-and-drop). |
| `/admin/users` | Usuários do tenant: criar, editar, ativar, import/export. |
| `/admin/roles` | Perfis e as 16 permissões. |
| `/admin/fields` | Dicionário de campos ERP (visão, tipo, máscara, obrigatoriedade). |
| `/admin/value-dictionary` | Valores de lista, abreviação, similares, unificação e propagação. |
| `/admin/logs` | Auditoria, com exportação. |
| `/admin/integrations` | Monitor das chamadas das APIs de material da empresa. Quem tem `can_view_logs` vê. |
| `/admin/integration-docs` | Documentação das integrações. Aba **APIs de entrada**: endereço, chave, rotas, campos, exemplos com curl, erros e download do OpenAPI. Aba **Saída para o ERP**: como o PRO-MAT chama, autenticação, JSON enviado por operação, resposta esperada e leitura da mensagem de erro. Quem tem `can_view_logs` vê. |
| `/admin/tenants` | Só master: clientes, limite de descrição, onboarding e troca de tenant. |
| `/admin/tenants/[id]` | Só master, botão **Configuração** na lista de tenants. Aba **Integrações com o ERP**: formulário no topo e grade das integrações (operação, tipo POST/PATCH/DELETE/GET, URL, tempo limite, autenticação), com Ativar/Desativar, Modificar e Excluir. Aba **Chaves de API**: gerar e revogar a chave de cada sistema externo. |

Rotas fora do menu: `/products` (CRUD simples da tabela `products`) e `/teste` (página de diagnóstico). Não fazem parte do fluxo do PRO-MAT.

## Nova solicitação

Passos em `web/app/request/page.tsx`:

1. **Pesquisa** — busca na base para evitar duplicata.
2. **Fase 1** — solicitante, urgência, centro de custo e quantidade.
3. **Fase 2** — template PDM e atributos (texto, número com unidade, lista).
4. **Fase 3** — anexos e justificativa.
5. **Fase 4** — revisão da descrição gerada e envio.

Anexos vão para o bucket `request-attachments`, no caminho `{tenant_id}/{request_id}/`.

## Governança

- Quadro por `status_key` do workflow ativo.
- Iniciar atendimento chama a RPC `assign_request` (um atendente por vez).
- Aprovar chama `advance_workflow`, limpa o atendente e segue para a próxima etapa.
- Rejeitar chama `reject_request` com motivo.
- Cada ação grava `request_history`.
- Na última etapa, a RPC cria o registro em `material_database` ligado à solicitação.

Fluxo padrão da Empresa Demo: Central de Cadastro → Compras → MRP → Fiscal → Contabilidade → Finalizado.

## PDM e descrições

Template guarda atributos em JSON (`pdm_templates.attributes`): nome, tipo, obrigatoriedade, valores permitidos, abreviação e se entra na descrição.

- Descrição curta: nome do PDM em maiúsculas + abreviação (ou valor) dos atributos marcados.
- Descrição detalhada: texto longo com PDM e atributos técnicos (`detailed_description`).
- O tenant tem `max_description_length` (padrão 40) para a descrição curta de ERP.

## Dicionário de valores

- `sync_value_dictionary` coleta listas dos PDMs do tenant.
- `get_similar_values` usa `pg_trgm` e lista pares com similaridade a partir de 0,6.
- `dismiss_similar_pair` ignora um par.
- `merge_dictionary_entries` unifica dois valores.
- `propagate_value_to_pdms` e `propagate_value_to_requests_and_materials` espalham a alteração.

## Base de dados e ERP

A base é o cadastro mestre local, com código interno (`id_sistema`), código ERP (`id_erp`), NCM, grupo, unidade, status e mensagem de erro de integração (`erp_error_message`). O dicionário de campos inclui o conjunto MM03 do SAP S/4HANA como metadado. A permissão `can_standardize` libera a padronização na tela.

**Integrar com ERP**, no detalhe ou em lote, chama `POST /api/database/materials/erp`. Com integração ativa no tenant, o servidor monta o JSON do ERP e chama a URL da operação: criação sem `id_erp`, alteração com `id_erp`. Sem integração ativa, a tela segue a simulação antiga (`pendente_erp` → `integrando` → cerca de 90% `integrado_erp` com `MAT-######`, o resto `erro_erp`). No detalhe, **Eliminar no ERP** aparece para material com `id_erp` e o deixa Obsoleto quando o ERP confirma. Ao concluir a última etapa, a solicitação (interna ou de origem externa) chama `POST /api/requests/[id]/erp` e a criação no ERP dispara sozinha. Criação ou alteração vinda de sistema externo direto na base continua pendente até uma pessoa integrar.

Duplicata de material (`getDuplicateMaterials`) compara descrição detalhada, ou descrição curta mais `pdm_code`. Não usa similaridade fuzzy. A busca por valores parecidos fica no dicionário de valores.

## Administração

- Onboarding (`create_tenant_onboarding` + rota `/api/admin/onboarding`) cria tenant, papéis, workflow e o primeiro admin.
- Master troca o tenant efetivo em `app_metadata.tenant_id` e volta depois.
- Importação em massa de usuários, PDM e materiais, com template e dry-run de usuários.
- Log em `system_logs`.

## Notificações

Tabela `notifications`, sino no topo e preferências por evento (criada, atendimento iniciado, etapa aprovada, rejeitada, concluída), cada uma com sino e e-mail separados. Depois de criar, iniciar atendimento, aprovar ou rejeitar, o servidor grava o sino de quem deixou o evento ligado e envia e-mail pelo Resend se a flag de e-mail estiver ligada. A chave fica só no servidor. Sem `RESEND_API_KEY`, o sino segue e o e-mail não sai. Arrastar o cartão no kanban muda o status direto e não dispara esse aviso.

## APIs de servidor

| Rota | Uso |
|------|-----|
| `POST /api/admin/onboarding` | Novo tenant + admin |
| `GET/POST /api/admin/users` | Listar e criar usuários |
| `PUT /api/admin/users/[id]` | Nome, perfil, ativo |
| `PUT /api/admin/users/[id]/password` | O próprio usuário troca a senha |
| `PUT /api/admin/users/[id]/preferences` | Preferências |
| import/export de usuários, PDM, materiais e logs | Planilhas |
| `POST /api/admin/switch-tenant` e `.../back` | Master entra e sai de um tenant |
| `PATCH /api/admin/tenants/[id]` | Dados do tenant |
| `GET /api/admin/tenants/[id]` | Nome e slug do tenant (master) |
| `GET/POST /api/admin/tenants/[id]/erp-connections` | Listar e incluir integrações com o ERP. O segredo entra, mas nunca volta |
| `PUT/PATCH/DELETE .../erp-connections/[connectionId]` | Modificar, ativar ou desativar, excluir |
| `POST /api/database/materials/erp` | Integrar ou eliminar no ERP até 100 materiais (`can_standardize`) |
| `POST /api/requests/[id]/erp` | Criação no ERP do material de uma solicitação finalizada (`can_approve`) |
| `GET/POST /api/admin/tenants/[id]/api-clients` e `DELETE .../[clientId]` | Listar, gerar e revogar chaves de API do tenant |
| `POST /api/notifications/request` | Sino e e-mail depois de uma ação recente na solicitação |
| `GET/POST /api/support/tickets` | Listar e abrir chamados no AxisDesk |
| `GET /api/support/tickets/[id]` e `POST .../acoes` | Detalhe e resposta do usuário |
| `GET /api/support/categorias` | Categorias do formulário |
| `POST /api/support/webhook` | AxisDesk avisa mudança de status ou comentário |
| `GET /api/admin/integrations` | Lista as chamadas das APIs de material da empresa da sessão |
### APIs de material (`/api/v1`)

Chamadas por sistemas externos com o header `x-api-key`. A empresa sai da chave, não do corpo. Cada chamada grava uma linha no monitor.

| Rota | Ação |
|------|------|
| `POST /api/v1/materials` | Cria o material direto na base, com `MDM-######` e **Pendente ERP** |
| `GET /api/v1/materials` | Consulta com filtro: `q`, `status`, `erp_status`, `pdm_codigo`, `alterado_desde`, `pagina`, `limite` (até 100) |
| `GET /api/v1/materials/[codigo]` | Consulta por `id_sistema` ou `id_erp` |
| `PATCH /api/v1/materials/[codigo]` | Altera o que vier no corpo e devolve o material para **Pendente ERP** |
| `POST /api/v1/requests` | Abre solicitação de origem externa no workflow ativo |
| `GET /api/v1/requests/[id]` | Etapa da solicitação e, depois da última etapa, o material criado |

O JSON de material usa chaves em português: `descricao`, `descricao_detalhada`, `status`, `pdm_codigo`, `unidade_medida`, `ncm`, `grupo_mercadoria`, `tipo_material`, `atributos`, e os blocos do ERP `eans`, `dimensoes`, `vendas`, `site`, `caracteristicas`, `campos_adicionais`. `id_sistema`, `id_erp` e `erp_status` são do PRO-MAT e não são aceitos na entrada. Validação em `web/lib/material-api/payload.ts`.

## Modelo de dados (principal)

`tenants`, `roles`, `users`, `measurement_units`, `workflow_header`, `workflow_config`, `pdm_templates`, `material_requests`, `request_values`, `request_history`, `request_attachments`, `material_database`, `value_dictionary`, `value_dictionary_dismissed`, `field_dictionary`, `notifications`, `user_notification_prefs`, `system_logs`, `products`, `integration_logs`, `api_clients`, `tenant_erp_connections`.

## Usuários da Empresa Demo

Criados por `supabase/create-demo-users.js`:

| E-mail | Perfil |
|--------|--------|
| admin@empresademo.com | ADMIN |
| joao.cadastro@empresademo.com | CADASTRO |
| maria.compras@empresademo.com | COMPRAS |
| pedro.mrp@empresademo.com | MRP |
| ana.fiscal@empresademo.com | FISCAL |
| carlos.contab@empresademo.com | CONTABILIDADE |
| lucia.solicitante@empresademo.com | SOLICITANTE |
