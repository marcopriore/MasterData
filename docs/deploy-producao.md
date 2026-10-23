# Colocar o PRO-MAT em produção

Roteiro para publicar o sistema com domínio próprio. Serve de modelo para as próximas implantações: troque os valores da tabela abaixo e siga as etapas na ordem. Cada etapa termina com um jeito de conferir.

## Valores desta implantação

| Nome no roteiro | Valor | Onde aparece |
|---|---|---|
| `DOMINIO` | `seudominio.com.br` (troque pelo seu) | registro.br, Resend |
| `APP` | `app.seudominio.com.br` | Vercel, Supabase, `NEXT_PUBLIC_APP_URL`, AxisDesk |
| Repositório | `marcopriore/MasterData`, branch `main` | GitHub, Vercel |
| Supabase | projeto atual (o mesmo do `.env.local`) | Vercel, scripts |
| Hospedagem | Vercel Hobby, pasta `web` | Vercel |

Decisões tomadas e o que elas implicam:

- **Vercel Hobby.** É gratuito, mas os termos da Vercel proíbem uso comercial nesse plano. Quando houver cliente pagando, mude o projeto para Pro em Settings → Billing. Nada deste roteiro precisa ser refeito.
- **O Supabase atual vira produção.** Não há banco de desenvolvimento separado. `npm run dev` na sua máquina, `create-demo-users` e `seed-materials-mass` passam a gravar nos dados de produção. Criar um projeto Supabase só para desenvolvimento é o próximo passo recomendado (ver o fim deste documento).
- **Subdomínio `app.`** O domínio raiz e o e-mail do domínio continuam livres para site e caixa postal.

## Etapa 0 — Contas e acessos

- [ ] GitHub com acesso ao repositório.
- [ ] [Vercel](https://vercel.com), entrando com a conta do GitHub.
- [ ] [Supabase](https://supabase.com/dashboard), com acesso ao projeto.
- [ ] [registro.br](https://registro.br), titular ou contato técnico do domínio.
- [ ] [Resend](https://resend.com) (opcional, para e-mail).
- [ ] AxisDesk com acesso à configuração de integrações (opcional, para suporte).

## Etapa 1 — Código no GitHub

O que vai para produção é a branch `main`. Antes de ligar a Vercel, ela precisa estar com o código atual e o CI verde.

```powershell
cd C:\Dev\MasterData
git status
cd web
npm run check          # testes, gate de segurança, auditoria e tipos
cd ..
git add -A
git commit -m "chore: preparação para produção"
git push origin main
```

Conferir: em GitHub → Actions, o workflow **CI** do último push está verde. Os arquivos `.env.local` e `.env.production.local` **não** aparecem no commit; só `web/.env.example`.

## Etapa 2 — Variáveis de produção

Os valores ficam num arquivo local que nunca vai para o Git e depois são colados na Vercel.

```powershell
cd C:\Dev\MasterData\web
Copy-Item .env.example .env.production.local
notepad .env.production.local
```

Preencha:

| Variável | De onde vem |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API. Como o banco é o mesmo, são os valores do `.env.local`. |
| `NEXT_PUBLIC_APP_URL` | `https://APP`, sem barra no final. |
| `INTEGRATION_SECRET_KEY` | **Copie do `.env.local`.** Os segredos das integrações ERP já salvos foram cifrados com ela; outra chave os inutiliza. Só gere uma nova (`npm run secrets`) num banco sem integrações salvas. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Etapa 7. Pode deixar vazio no primeiro deploy. |
| `AXISDESK_API_KEY`, `AXISDESK_WEBHOOK_SECRET` | Chave do AxisDesk; o segredo do webhook sai de `npm run secrets`. |

Conferir:

```powershell
npm run prd:check
```

O script lê `.env.production.local`, valida formato das variáveis, confere se as chaves do Supabase não estão trocadas e consulta o banco (migrations, bucket privado, usuário master, cadastro público). Só lê; não altera nada. Siga para a etapa 3 mesmo se aparecer a falha de cadastro público — ela é resolvida lá.

## Etapa 3 — Supabase

No painel do projeto:

1. **Região.** Project Settings → General. Anote a região (ex.: South America (São Paulo) = `sa-east-1`). Ela define a região da Vercel na etapa 4.
2. **Migrations.** Todas de `001` a `024` precisam estar aplicadas. O `prd:check` confere as principais. A `024` só cria índices; se não tiver certeza, rode o conteúdo de `supabase/migrations/024_api_rate_limit_index.sql` no SQL Editor (usa `IF NOT EXISTS`).
3. **Endereços de autenticação.** Authentication → URL Configuration:
   - Site URL: `https://APP`
   - Redirect URLs: `https://APP/**` e, enquanto o banco for compartilhado com o desenvolvimento, `http://localhost:3000/**`
4. **Cadastro público desligado.** Authentication → Sign In / Providers → Email → desmarque **Allow new users to sign up**. No PRO-MAT, usuário só nasce pela Gestão de Usuários ou pelo onboarding de tenant (ambos usam a service role). Com o cadastro ligado, qualquer pessoa com a chave pública cria conta no Auth.
5. **Advisors.** Advisors → Security Advisor → rode e resolva os itens de nível *error*.
6. **Plano.** No Free, o projeto pausa depois de 7 dias sem uso e não há backup automático. Para produção real, o Pro resolve as duas coisas. Enquanto estiver no Free, faça um dump periódico (Database → Backups não existe no Free):

   ```powershell
   npx supabase db dump --db-url "postgresql://postgres:SENHA@db.REF.supabase.co:5432/postgres" -f backup.sql
   ```

7. **Tenant de demonstração.** O `prd:check` avisa se a Empresa Demo existe. A senha dos usuários demo está no repositório; antes de abrir o sistema para clientes, desative esses usuários em Gestão de Usuários ou apague o tenant. Para tirar só os materiais da seed em massa:

   ```sql
   delete from public.material_database where source = 'seed_mass';
   ```

Conferir: `npm run prd:check` sem falhas na seção **2. Supabase**.

## Etapa 4 — Projeto na Vercel

1. Vercel → **Add New → Project** → importe `marcopriore/MasterData`.
2. **Root Directory:** `web`. O framework aparece como Next.js; mantenha build e install padrão.
3. **Environment Variables:** abra `.env.production.local`, copie todo o conteúdo e cole no primeiro campo de chave (a Vercel separa as linhas sozinha). Deixe marcado só o ambiente **Production**.
4. **Deploy.** Ao terminar, a Vercel mostra um endereço `*.vercel.app`. Entre nele e faça login com o master.
5. Depois do primeiro deploy, em Settings:
   - **Functions → Function Region:** a mesma região do Supabase (`sa-east-1` → São Paulo, `gru1`). Cada chamada ao banco atravessa essa distância.
   - **General → Node.js Version:** `22.x` (a mesma do CI).
   - **Git → Ignored Build Step:** escolha **Only build production**. Como só existe um banco, um deploy de preview de outra branch apontaria para produção (ou quebraria por falta de variável). Assim, só a `main` gera deploy.

Conferir: o login funciona no endereço `*.vercel.app` e a lista de PDMs abre.

## Etapa 5 — Domínio na Vercel

1. Projeto → Settings → **Domains** → **Add** → digite `APP`.
2. A Vercel mostra o registro DNS a criar, do tipo **CNAME**, nome `app`, com um valor como `cname.vercel-dns.com` ou um endereço próprio do projeto. Copie o valor exatamente como aparece.
3. Deixe essa tela aberta; ela fica em *Invalid Configuration* até o DNS propagar.

## Etapa 6 — DNS no registro.br

1. Entre no [registro.br](https://registro.br) → **Painel** → clique no domínio.
2. Veja o quadro **DNS**:
   - Se aparece *Utilizando os servidores DNS do Registro.br*, os registros são editados ali: **Configurar zona DNS** (ou **Editar zona**). Se o botão pedir para ativar o modo avançado, ative; a primeira ativação pode levar alguns minutos.
   - Se aparecem servidores de outra empresa (Hostgator, Locaweb, Cloudflare, Wix…), o registro.br não controla a zona. Crie o registro no painel dessa empresa, com os mesmos dados.
3. **Nova entrada:**
   - Tipo: `CNAME`
   - Nome: `app`
   - Dados: o valor copiado da Vercel
4. Salve. Não altere os registros `A`, `MX` ou `TXT` que já existem; eles mantêm o site e o e-mail atuais do domínio.

Conferir (a propagação costuma levar de minutos a duas horas):

```powershell
Resolve-DnsName app.seudominio.com.br -Type CNAME -Server 8.8.8.8
```

Quando o nome resolver, a tela de Domains da Vercel fica verde e o certificado HTTPS é emitido sozinho, em alguns minutos. Se o domínio tiver registro `CAA`, ele precisa permitir `letsencrypt.org`.

Por fim, Vercel → Deployments → último deploy → **Redeploy**. `NEXT_PUBLIC_APP_URL` entra no build; o redeploy garante que o build use o endereço final.

## Etapa 7 — E-mail com o domínio (Resend)

Opcional. Sem isso, o sino funciona e o e-mail não sai.

1. Resend → **Domains → Add Domain** → `DOMINIO`, região São Paulo se disponível.
2. O Resend lista os registros a criar. Crie cada um no registro.br (etapa 6, mesma tela), usando no campo Nome só a parte antes do domínio:
   - `TXT` em `resend._domainkey` (DKIM)
   - `MX` em `send`, prioridade 10 (retorno)
   - `TXT` em `send` com `v=spf1 include:amazonses.com ~all` (SPF)
   - Se o domínio ainda não tem DMARC: `TXT` em `_dmarc` com `v=DMARC1; p=none;`
3. Clique em **Verify** no Resend e espere todos ficarem *Verified*.
4. Resend → **API Keys → Create** com permissão *Sending access* restrita ao domínio.
5. Na Vercel, ajuste `RESEND_API_KEY` e `RESEND_FROM_EMAIL=noreply@DOMINIO` (só o endereço; o nome PRO-MAT o sistema coloca) e faça **Redeploy**. Atualize também o `.env.production.local`.

Conferir: abra uma solicitação de teste; quem tem o aviso de e-mail ligado no perfil recebe a mensagem, com link para `https://APP`.

## Etapa 8 — Suporte AxisDesk

1. No AxisDesk, em Configurações → Integrações → PRO-MAT:
   - URL do webhook: `https://APP/api/support/webhook`
   - Segredo: o mesmo valor de `AXISDESK_WEBHOOK_SECRET`
2. Envie o evento de teste. A resposta esperada é `{"ok":true,"recebido":"teste"}`.

Conferir: na tela Suporte do PRO-MAT, a lista de chamados carrega.

## Etapa 9 — Integrações com o ERP

Em produção, a URL de cada integração precisa ser `https`. As integrações já cadastradas continuam abrindo os segredos se a `INTEGRATION_SECRET_KEY` da Vercel for a mesma do `.env.local`. Teste com **Sincronizar com ERP** em um material de teste antes de usar em lote.

## Etapa 10 — Conferência final

```powershell
cd C:\Dev\MasterData\web
npm run prd:check -- --live
```

A seção **3. Site no ar** confere DNS, redirecionamento de http para https, cabeçalhos de segurança, redirecionamento para o login sem sessão e 401 nas APIs sem sessão, sem chave e sem segredo. A chamada sem chave aparece como recusada (401) no Monitor de integrações; é esperado.

Teste manual, com o master e com um usuário comum:

- [ ] Login e logout
- [ ] Master troca de tenant e volta
- [ ] Gestão PDM: lista, abrir um PDM, salvar
- [ ] Nova solicitação, iniciar atendimento, aprovar até finalizar
- [ ] O material aparece na Base de Dados; Alterar Status e Sincronizar com ERP
- [ ] Exportar Excel e importação em massa (dry-run)
- [ ] Sino de notificações e, se configurado, e-mail
- [ ] Usuário sem permissão não vê nem abre telas restritas

## Rotina depois do go-live

**Deploy.** Trabalhe numa branch, abra pull request, espere o CI verde e faça merge na `main`. A Vercel publica a `main` sozinha.

**Migration nova.** Aplique no Supabase (SQL Editor) **antes** do merge que usa a coluna ou tabela nova. Escreva migrations que somam (coluna nova, tabela nova) para o código antigo continuar funcionando entre a migration e o deploy. Registre o número na tabela de `docs/tecnologias.md`.

**Variável nova.** Inclua em `web/.env.example`, na Vercel e no `.env.production.local`. Se for `NEXT_PUBLIC_*`, faça redeploy. Se for obrigatória, acrescente a conferência em `web/scripts/prd-check.mjs`.

**Voltar uma versão.** Vercel → Deployments → deploy anterior → **Instant Rollback**. Isso volta o código, não o banco; por isso as migrations precisam ser compatíveis com a versão anterior.

**Depois de qualquer mudança de infraestrutura:** `npm run prd:check -- --live`.

## Próximo degrau recomendado: banco de desenvolvimento

1. Crie um projeto Supabase novo (ex.: `pro-mat-dev`) na mesma região.
2. Aplique as migrations em ordem, de `001` a `024`, no SQL Editor; depois `supabase/seed.sql`.
3. Aponte o `web/.env.local` para ele e rode `npm run create-demo-users` e `supabase/seed_demo.sql` lá.
4. Na Vercel, cadastre as variáveis desse banco com escopo **Preview** e volte o Ignored Build Step para o automático; cada pull request ganha um endereço de teste próprio.
5. Em produção, remova `http://localhost:3000/**` dos Redirect URLs.

O Supabase CLI (`npx supabase link` + `npx supabase db push`) também aplica as migrations, mas **só num projeto novo**. No projeto atual, que recebeu as migrations pelo SQL Editor, o CLI não tem o histórico e tentaria aplicar tudo de novo.

## Modelo para um projeto do zero

Para outro sistema no mesmo formato (Next.js + Supabase + Vercel + registro.br), a ordem é a mesma: código no GitHub com CI → `.env.example` e script de conferência → banco (região, migrations, Auth, cadastro público desligado) → Vercel (pasta, variáveis, região, branch de produção) → domínio na Vercel → CNAME no registro.br → e-mail → integrações → conferência final. Copie este arquivo, `web/.env.example` e `web/scripts/prd-check.mjs` e ajuste nomes de variáveis, tabelas e rotas conferidas.
