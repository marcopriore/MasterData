# PRO-MAT — contexto

Resumo para quem abre o repositório. Detalhe em `docs/`.

Última revisão: outubro de 2026.

## O que é

Cadastro mestre de materiais por cliente (tenant): solicitação com PDM, governança em etapas, base de dados e dicionários de campos e valores. Nome do sistema: **PRO-MAT**.

## Stack

Next.js 16 + React 19 + TypeScript + Tailwind 4 + Supabase (Auth, Postgres, RLS, Storage). Não há mais API FastAPI.

```powershell
cd C:\Dev\MasterData\web
npm run dev
```

## Onde ler

| Arquivo | Assunto |
|---------|---------|
| [docs/tecnologias.md](docs/tecnologias.md) | Stack, pastas, migrations, como subir |
| [docs/funcionalidades.md](docs/funcionalidades.md) | Telas, fluxo, APIs, dados |
| [docs/regras.md](docs/regras.md) | Permissões, workflow, descrição, tenant |
| [docs/backlog.md](docs/backlog.md) | Lacunas conhecidas |

## Mapa mental

- Menu: Início, Solicitações, Governança, Base de Dados, Gestão PDM, Configurações.
- Solicitação: Pesquisa → dados administrativos → atributos → documentos → revisão.
- Governança: assumir (`assign_request`), aprovar (`advance_workflow`), rejeitar (`reject_request`). No fim, nasce o material.
- Isolamento: RLS por `tenant_id`. Master troca o tenant em `app_metadata`.
- Permissões: JSON em `roles.permissions`. Tela nova precisa de flag, grupo em Perfis e item no menu.

## Demo

`npm run create-demo-users` na pasta `web`, depois `supabase/seed_demo.sql`. Admin: `admin@empresademo.com`. Senha no script `supabase/create-demo-users.js`.
