# PRO-MAT — aplicação web

Next.js com Supabase. A documentação do produto fica em [`../docs`](../docs):

- [funcionalidades.md](../docs/funcionalidades.md): telas e o que cada uma faz;
- [regras.md](../docs/regras.md): regras de negócio, permissões e travas do banco;
- [tecnologias.md](../docs/tecnologias.md): arquitetura, migrations e testes;
- [deploy-producao.md](../docs/deploy-producao.md): ambiente, migrations e publicação.

## Rodar

1. Copie as variáveis para `.env.local` (lista em `deploy-producao.md`). O banco é o de produção: use tenant de teste.
2. `npm install`
3. `npm run dev` e abra [http://localhost:3000](http://localhost:3000).

## Verificar

| Comando | O que faz |
|---------|-----------|
| `npm run check` | Testes unitários, auditoria de segurança do código e tipos. Não usa o banco. |
| `npx next build` | Build de produção. |
| `npm run prd:check` | Confere ambiente e migrations aplicadas. |
| `npm run security:probe` | Ataques conhecidos contra o banco, com tenants temporários apagados no fim. Só antes de commit. |

O E2E fica em `../tests` (`npx playwright test --config=e2e/playwright.config.ts`), também só antes de commit.
