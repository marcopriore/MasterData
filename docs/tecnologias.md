# Tecnologias

PRO-MAT é o sistema de cadastro padronizado de materiais (PDM), governança por etapas e base de dados por cliente (tenant).

## Stack atual

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 16.4 (App Router) + React 19 + TypeScript |
| UI | Tailwind CSS 4, shadcn/ui (Radix), Lucide, Sonner, Recharts, dnd-kit |
| Tema | `next-themes` — modo claro/escuro próprio da aplicação |
| Dados e auth | Supabase (PostgreSQL, Auth, Storage, Realtime, RLS) |
| Cliente | `@supabase/supabase-js` e `@supabase/ssr` |
| Planilhas | `xlsx` 0.20.3 do CDN da SheetJS (importação e exportação; a do npm parou na 0.18.5, com falhas conhecidas) |
| Testes | Vitest em `web/lib/**/*.test.ts` (regressão de acesso) e Playwright em `tests/e2e` |

A maior parte das leituras e escritas vai direto do browser para o Supabase (`web/lib/supabase-api.ts`), com RLS filtrando por tenant. Rotas em `web/app/api` existem para operações que precisam da service role: usuários, onboarding, troca de tenant, import/export.

## O que deixou de valer

Houve uma versão com FastAPI, SQLAlchemy e PostgreSQL local (`api/`). Essa pasta não existe mais. Qualquer nota que cite `uvicorn`, JWT próprio ou `seed_data.py` está obsoleta.

## Estrutura

```
MasterData/
├── CONTEXT.md                 # resumo curto; aponta para docs/
├── docs/                      # este ecossistema
├── supabase/
│   ├── migrations/            # 001–024, schema + RPCs + RLS
│   ├── config.toml
│   ├── seed.sql / seed_demo.sql
│   └── create-demo-users.js   # tenant Empresa Demo via Admin API
├── web/                       # aplicação Next.js
│   ├── app/                   # páginas e route handlers
│   ├── components/
│   ├── contexts/              # usuário e notificações
│   ├── lib/supabase-api.ts    # acesso a dados
│   ├── security/              # gate de segurança (testes) e exceções da auditoria
│   ├── scripts/security-audit.mjs
│   └── proxy.ts               # sessão Supabase em toda página e API (antigo middleware.ts)
└── tests/e2e/                 # Playwright
```

## Como rodar

```powershell
cd C:\Dev\MasterData\web
npm install
npm run dev
```

Variáveis em `web/.env.local` (modelo comentado em `web/.env.example`; produção em [deploy-producao.md](./deploy-producao.md)):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (só no servidor: onboarding, admin de usuários, import, aviso por e-mail)
- `RESEND_API_KEY` e `RESEND_FROM_EMAIL` (só no servidor). Sem a chave, o sino continua e o e-mail é ignorado.
- `AXISDESK_API_KEY` (só no servidor). `AXISDESK_WEBHOOK_SECRET` valida o webhook. `AXISDESK_BASE_URL` é opcional; o padrão é `https://suporte.axisstrategy.com.br`.
- `NEXT_PUBLIC_APP_URL`: endereço público, sem barra final. Vai nos links de e-mail e das solicitações criadas por API. Em produção é obrigatório.
- `INTEGRATION_SECRET_KEY` (só no servidor): 32 bytes em base64. Cifra a chave, token, senha ou client secret do ERP de cada tenant. Produção precisa da mesma chave do ambiente onde o segredo foi salvo; se ela mudar, os segredos gravados precisam ser digitados de novo.

Tenant de demonstração:

```powershell
cd C:\Dev\MasterData\web
npm run create-demo-users
```

Depois, executar `supabase/seed_demo.sql` no SQL Editor. A senha compartilhada dos usuários demo está em `supabase/create-demo-users.js`.

Base de materiais em massa (usa os PDMs já ativos do tenant):

```powershell
cd C:\Dev\MasterData\web
node ../supabase/seed-materials-mass.js
node ../supabase/seed-materials-mass.js --dry-run
node ../supabase/seed-materials-mass.js --tenant=empresa-demo --per-pdm=40
node ../supabase/seed-materials-mass.js --replace
# ou: npm run seed-materials-mass -- --per-pdm=40
```

O script `supabase/seed-materials-mass.js` combina LOVs do PDM, varia numéricos/texto, monta descrição curta (limite de `tenants.max_description_length`, padrão 40) e detalhada, e grava em `material_database` com `source=seed_mass`. `--replace` apaga só essa origem antes de recriar. Preferir `node ...` direto: em alguns npm as flags `--per-pdm` são engolidas.

Produção:

```powershell
npm run secrets                     # gera INTEGRATION_SECRET_KEY e segredo do webhook
npm run prd:check                   # confere .env.production.local e o Supabase
npm run prd:check -- --live         # também o site publicado
```

## Testes

Regressão sem banco: união de grupos e extras, menu, quem pode gerir usuários, e quem recebe aviso de solicitação (sino e e-mail). Rodar depois de cada mudança nessa área:

```powershell
cd C:\Dev\MasterData\web
npm test          # regressão + gate de segurança
npm run check     # o mesmo + auditoria de dependências + tipos
```

`npm test` também roda o gate de segurança (`web/security`). O GitHub Actions roda testes, auditoria, tipos e `next build` a cada push em `main` e em pull request; o build usa valores fictícios para o Supabase porque não conecta no banco.

**E2E (Playwright, `tests/e2e`)** roda contra o app de verdade: build de produção em `http://localhost:3100`, que o próprio Playwright sobe, e o banco do `web/.env.local`.

**A cada rodada:**
1. `global-setup` cria um tenant temporário pelo mesmo caminho do onboarding (`create_tenant_onboarding` + `copy_default_fields`), um usuário por papel (Admin, Solicitante, Cadastro, Compras, MRP, Fiscal, Contabilidade) e um PDM base.
2. O projeto `setup` faz um login de verdade por papel e salva a sessão.
3. `global-teardown` apaga tudo.

**O que as suítes cobrem:**
- **Login:** sessão, senha errada, usuário inativo e sair.
- **PDM:** texto sem acento, código sugerido, nome repetido.
- **Nova solicitação:** pelo assistente.
- **Governança:** fluxo completo pelas 5 etapas, cada uma com o usuário da área, até o material nascer na base; e rejeição com justificativa.
- **Base de dados:** busca, inclusive com caractere de filtro.
- **Dicionário, grupos e usuários:** dicionário, grupos e usuários, incluindo senha fraca recusada e conta inativada sem acesso.

```powershell
cd C:\Dev\MasterData\tests
npm install
npx playwright install chromium   # só na primeira vez
npm run test:e2e                  # E2E_KEEP_DATA=1 mantém o tenant para inspeção
```

Enquanto o banco for único, a rodada grava em produção, sempre num tenant próprio e apagado no fim. Por isso o E2E e a sonda rodam **só antes de cada commit**, numa rodada única. Durante o trabalho, use `npm run check` e `next build`, que não usam o banco. Para repetir só uma suíte que falhou: `npx playwright test --config=e2e/playwright.config.ts --project=governance`.

## Migrations relevantes

| Arquivo | Efeito |
|---------|--------|
| 001 | tenants, roles, users, unidades de medida |
| 002 | workflow, PDM, solicitações, histórico, anexos, base de materiais |
| 003 | dicionários, notificações, logs, products |
| 004 | RLS e `get_user_tenant_id` / `is_master_user` |
| 005 | RPCs: assign, advance, reject, sync/merge do dicionário, stats, onboarding |
| 006 | bucket `request-attachments` e Realtime |
| 007 | tenant efetivo do usuário master ao trocar de cliente |
| 008 | permissão `can_attend` |
| 009 | colunas SAP renomeadas para ERP; onboarding alinhado |
| 010 | campos MM03 do S/4HANA no dicionário |
| 011 | histórico gravado nas RPCs de governança |
| 012 | preços como moeda; material criado ao finalizar |
| 013 | `erp_error_message` |
| 014 | propagar valor do dicionário para PDMs, solicitações e materiais |
| 015 | `pg_trgm` e pares similares |
| 016 | dispensar par similar |
| 017 | `detailed_description` na base de materiais |
| 018 | grupos de perfil por usuário e permissões extras |
| 019 | log das chamadas de integração (`integration_logs`) |
| 020 | APIs de material: blocos do ERP no material, `erp_block` no dicionário, `api_clients`, origem da solicitação, `api_insert_material` |
| 021 | configuração da saída para o ERP por tenant (`tenant_erp_settings`), substituída pela 022 |
| 022 | várias integrações com o ERP por tenant (`tenant_erp_connections`); migra a 021 e remove a tabela antiga |
| 023 | campo do código do material na resposta do ERP (`response_code_field`) |
| 024 | índices para o limite de chamadas das APIs de material |
| 025 | `can_attend` em todo papel novo (gatilho em `roles`) e nos papéis criados depois da 008 |
| 026 | `move_request_stage`: arraste entre etapas intermediárias com histórico |
| 027 | Desempenho: RLS com `(SELECT …)` (função calculada uma vez por consulta, não por linha), índices de lista/filtro/busca, `pdm_material_counts` e `material_duplicate_candidates` |
| 028 | `resubmit_request`: rejeitada corrigida volta para a primeira etapa (quem abriu, Admin ou Master) |
| 029 | Relatórios: `report_request_flow`, `report_productivity`, `report_material_base` e permissão `can_view_reports` (ADMIN e MASTER, também em papel novo) |
| 030 | Texto do ERP: funções `erp_text`, `erp_jsonb`, `erp_description` e normalização dos PDMs, materiais, solicitações e dicionário. PDM: recodificação no padrão `PARA001`, nome repetido vira "Nome 2", trava de código (até 10) e nome único por tenant |
| 031 | Isolamento por tenant: RLS estrita também para o Master, funções fechadas para anônimo, `assign`/`advance`/`reject`/`move`/`resubmit` conferem o tenant, `users` sem gravação pelo navegador, `roles` só com `can_manage_roles`, histórico imutável, notificação e preferência do próprio usuário, `tenant_overview()` e `user_has_permission()`. Ajusta `create_tenant_onboarding` para aceitar a chamada do servidor |
| 032 | Permissão no banco: `require_permission()` nas funções de aprovar/rejeitar/atender/mover e do dicionário; policies de escrita por permissão (PDM, campos, workflow, dicionário, solicitações, materiais, logs, anexos); gatilhos `guard_material_requests` e `guard_material_database` travam etapa, atendente, autor, status e ERP; log imutável; anexo até 25 MB na pasta da solicitação do tenant; `search_path` fixo em toda função SECURITY DEFINER |
| 033 | Usuário inativo sem acesso (`get_user_tenant_id` devolve NULL; inativos bloqueados no Auth); `advance_workflow` confere os campos obrigatórios da etapa (`stage_missing_fields`); opções dos campos sem acento; `copy_default_fields()` dá ao tenant novo o dicionário completo com opções |
| 034 | Cada área só na própria etapa: `can_act_on_stage` em atender, aprovar, rejeitar e salvar campos (`guard_request_area`); arrastar entre etapas só ADMIN/Master (`user_is_tenant_admin`); não rejeita solicitação finalizada; `erp_view` do dicionário de campos em código |
