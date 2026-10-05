# Tecnologias

PRO-MAT é o sistema de cadastro padronizado de materiais (PDM), governança por etapas e base de dados por cliente (tenant).

## Stack atual

| Camada | Tecnologia |
|--------|------------|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript |
| UI | Tailwind CSS 4, shadcn/ui (Radix), Lucide, Sonner, Recharts, dnd-kit |
| Tema | `next-themes` — modo claro/escuro próprio da aplicação |
| Dados e auth | Supabase (PostgreSQL, Auth, Storage, Realtime, RLS) |
| Cliente | `@supabase/supabase-js` e `@supabase/ssr` |
| Planilhas | `xlsx` (importação e exportação) |
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
│   ├── migrations/            # 001–018, schema + RPCs + RLS
│   ├── config.toml
│   ├── seed.sql / seed_demo.sql
│   └── create-demo-users.js   # tenant Empresa Demo via Admin API
├── web/                       # aplicação Next.js
│   ├── app/                   # páginas e route handlers
│   ├── components/
│   ├── contexts/              # usuário e notificações
│   ├── lib/supabase-api.ts    # acesso a dados
│   └── middleware.ts          # sessão Supabase
└── tests/e2e/                 # Playwright
```

## Como rodar

```powershell
cd C:\Dev\MasterData\web
npm install
npm run dev
```

Variáveis em `web/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (só no servidor: onboarding, admin de usuários, import, aviso por e-mail)
- `RESEND_API_KEY` e `RESEND_FROM_EMAIL` (só no servidor). Sem a chave, o sino continua e o e-mail é ignorado.

Tenant de demonstração:

```powershell
cd C:\Dev\MasterData\web
npm run create-demo-users
```

Depois, executar `supabase/seed_demo.sql` no SQL Editor. A senha compartilhada dos usuários demo está em `supabase/create-demo-users.js`.

## Testes

Regressão sem banco: união de grupos e extras, menu, quem pode gerir usuários, e quem recebe aviso de solicitação (sino e e-mail). Rodar depois de cada mudança nessa área:

```powershell
cd C:\Dev\MasterData\web
npm test
```

Os arquivos em `tests/e2e/suites` cobrem autenticação, solicitações, governança, PDM, base de dados, usuários, perfis e dicionário de valores. O helper ainda usa `TEST_API_URL` ou `http://localhost:8000`, resto da API FastAPI. Eles não exercitam o app Next.js atual até essa URL mudar.

```powershell
cd C:\Dev\MasterData\tests
npm run test:e2e
```

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
