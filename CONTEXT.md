# MDM Platform — Contexto do Projeto
> Última atualização: 04/03/2026 — v2.14

---

## Stack Tecnológica

- **Backend**: FastAPI + SQLAlchemy 2.0 + PostgreSQL (psycopg3)
- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS + shadcn/ui
- **Auth**: JWT (Bearer token)
- **Banco**: PostgreSQL local (`masterdata`)
- **Dev**: `cd api && uvicorn main:app --reload` / `cd web && npm run dev`

---

## Estrutura de Pastas

```
C:\Dev\MasterData\
├── api/
│   ├── main.py              # Rotas principais + instrumentação de eventos
│   ├── orm_models.py        # Todos os modelos SQLAlchemy
│   ├── models.py            # Pydantic models (RolePermissions, etc.)
│   ├── audit.py             # log_request_event, log_system_event
│   ├── notifications.py     # notify_request_event, send_email, templates HTML
│   ├── seed_data.py         # Dados iniciais (roles, users, PDM, workflow, materiais)
│   ├── recreate_db.py       # Drop + create todas as tabelas
│   └── routes/
│       └── admin.py         # Rotas admin (users, roles, fields, logs)
└── web/
    ├── app/
    │   ├── governance/page.tsx        # Kanban + visão lista de solicitações
    │   ├── request/page.tsx           # Nova solicitação (passo 0 + fases 1-4)
    │   ├── database/page.tsx          # Base de Dados de Materiais
    │   ├── database/[id]/page.tsx     # Detalhe do material
    │   ├── admin-pdm/page.tsx         # Gestão PDM
    │   ├── admin/roles/page.tsx       # Perfis de Acesso
    │   ├── admin/logs/page.tsx        # Log do Sistema
    │   ├── settings/profile/page.tsx  # Meu Perfil + preferências de notificação
    │   └── login/page.tsx
    ├── components/
    │   ├── app-sidebar.tsx            # Menu lateral dinâmico por permissões
    │   ├── topbar.tsx                 # Barra superior com sino de notificações
    │   ├── notifications-bell.tsx     # Sino com dropdown e badge
    │   ├── request/
    │   │   ├── phase-search.tsx       # Passo 0 — Link de Pesquisa
    │   │   ├── phase-admin.tsx        # Fase 1 — Informações Administrativas
    │   │   ├── phase-specs.tsx        # Fase 2 — Atributos Técnicos
    │   │   ├── phase-docs.tsx         # Fase 3 — Documentação de Apoio
    │   │   └── phase-review.tsx       # Fase 4 — Revisão Final
    │   └── governance/
    │       ├── request-card.tsx       # Card kanban + linha lista
    │       ├── kanban-board.tsx       # Board kanban
    │       └── list-view.tsx          # Visão lista
    ├── contexts/
    │   ├── user-context.tsx           # Auth + permissões (can())
    │   └── notifications-context.tsx  # Polling notificações (30s)
    └── lib/
        ├── api.ts                     # apiGetWithAuth, apiPostWithAuth, etc.
        └── masks.ts                   # Máscaras: NCM, CFOP, CNPJ, CPF, tel, CEP, moeda, decimal
```

---

## Modelos de Banco (orm_models.py)

| Tabela | Descrição |
|--------|-----------|
| `roles` | Perfis de acesso com 12 permissões em JSONB |
| `users` | Usuários com role_id e email |
| `pdm_templates` | Templates PDM com atributos técnicos |
| `pdm_attributes` | Atributos de cada PDM |
| `workflows` | Fluxos de aprovação |
| `workflow_stages` | Etapas do workflow (Triagem, Fiscal, Master, MRP, Finalizado) |
| `material_requests` | Solicitações de cadastro |
| `request_history` | Histórico de eventos por solicitação |
| `system_logs` | Log de auditoria global |
| `material_database` | Base de dados de materiais (mock ERP) |
| `notifications` | Notificações in-app por usuário |
| `user_notification_prefs` | Preferências de notificação por usuário |
| `field_dictionary` | Dicionário SAP MM01 (31 campos) |

---

## Permissões (12 flags no JSONB `permissions`)

### Solicitações
- `can_approve` — Aprovar solicitações
- `can_reject` — Rejeitar solicitações
- `can_submit_request` — Criar solicitações

### Gestão PDM
- `can_view_pdm` — Visualizar PDM
- `can_edit_pdm` — Editar PDM

### Workflow
- `can_view_workflows` — Visualizar Workflows
- `can_edit_workflows` — Editar Workflows

### Administração
- `can_manage_users` — Gestão de Usuários
- `can_view_logs` — Gestão de Logs
- `can_manage_fields` — Dicionário de Dados
- `can_view_database` — Base de Dados
- `can_manage_roles` — Perfil de Acesso

### Permissões por Perfil (padrão)
| Perfil | Permissões |
|--------|-----------|
| ADMIN | Todas (12/12) |
| MASTER | Todas exceto can_manage_roles (11/12) |
| TRIAGEM | can_approve, can_reject, can_view_pdm, can_view_database |
| FISCAL | can_approve, can_reject, can_view_database |
| MRP | can_approve, can_reject, can_view_database |
| SOLICITANTE | can_submit_request, can_view_pdm, can_view_database |

---

## Regra importante sobre permissões
> **Sempre que uma nova tela ou funcionalidade for criada, adicionar a permissão correspondente:**
> 1. `can_*` flag no backend (models.py + seed_data.py + main.py _DEFAULT_ROLES)
> 2. Grupo no frontend (admin/roles/page.tsx PERMISSION_GROUPS)
> 3. Controle no menu lateral (app-sidebar.tsx)

---

## Usuários de Teste (seed)

| Email | Senha | Perfil |
|-------|-------|--------|
| admin@masterdata.com | Admin@1234 | ADMIN |
| solicitante@masterdata.com | Solicitante@1234 | SOLICITANTE |
| triagem@masterdata.com | Triagem@1234 | TRIAGEM |
| fiscal@masterdata.com | Fiscal@1234 | FISCAL |
| master@masterdata.com | Master@1234 | MASTER |
| mrp@masterdata.com | Mrp@1234 | MRP |

---

## Principais Endpoints API

### Auth
- `POST /api/auth/login`
- `GET /api/auth/me`

### Solicitações
- `GET /api/requests`
- `POST /api/requests`
- `PATCH /api/requests/{id}/assign`
- `PATCH /api/requests/{id}/status`
- `PATCH /api/requests/{id}/reject`
- `PATCH /api/requests/{id}/attributes`
- `GET /api/requests/{id}/history`

### Base de Dados
- `GET /api/database/materials` (q, status, pdm_code, date_from, date_to, page, limit)
- `GET /api/database/materials/search?q=` (top 10, para Link de Pesquisa)
- `GET /api/database/materials/{id}`

### Notificações
- `GET /api/notifications` (unread_only, limit)
- `PATCH /api/notifications/{id}/read`
- `PATCH /api/notifications/read-all`
- `GET /api/notifications/prefs`
- `PATCH /api/notifications/prefs`

### PDM
- `GET /api/pdm` (retorna materials_count por PDM)
- `POST /api/pdm`
- `PUT /api/pdm/{id}`

### Admin
- `GET /admin/users`
- `POST /admin/users`
- `GET /admin/roles`
- `POST /admin/roles`
- `PUT /admin/roles/{id}`
- `GET /admin/logs` (category, user_id, from, to, page)
- `GET /api/fields` / `POST` / `PUT` / `DELETE`

---

## Fluxo da Nova Solicitação

```
Passo 0: Link de Pesquisa
  → busca na base de dados (GET /api/database/materials/search)
  → se encontrou: volta ao dashboard
  → se não encontrou: avança para Fase 1

Fase 1: Informações Administrativas
  → Solicitante (read-only, vem do user logado)
  → Urgência (Baixa / Média / Alta) — Média com fundo amarelado

Fase 2: Atributos Técnicos
  → Seleção de Template PDM
  → Preenchimento dos atributos dinâmicos
  → Preview da descrição gerada

Fase 3: Documentação de Apoio
  → Upload de arquivos (PNG, JPG, WEBP, GIF, PDF · máx 10MB)

Fase 4: Revisão Final
  → Exibe: Descrição gerada, Solicitante, Urgência, Atributos, Documentos
```

---

## Fluxo de Governança (Atendimento)

```
Kanban por etapas: TRIAGEM → FISCAL → MASTER → MRP → FINALIZADO
  → Cada card: REQ-XXXX, descrição, solicitante, atendente, data, urgência
  → Visão lista alternativa com barras de progresso T/F/M/MRP

Ao abrir um card:
  → Aba Detalhes: descrição gerada, solicitante, urgência, status, dados preenchidos
  → Aba Histórico: timeline com eventos e diff DE→PARA

Ações disponíveis (por permissão):
  → Iniciar Atendimento (assign)
  → Salvar campos do dicionário SAP
  → Salvar e Aprovar (avança etapa)
  → Rejeitar (com justificativa)
```

---

## Notificações

### Eventos que disparam notificação
- `request_created` — Solicitação criada
- `request_assigned` — Atendimento iniciado
- `request_approved` — Aprovado (avançou de etapa)
- `request_rejected` — Rejeitado (com justificativa)
- `request_completed` — Solicitação concluída

### Canais
- **In-app**: sino no topo (polling 30s), badge vermelho com contagem
- **E-mail**: SMTP configurável via variáveis de ambiente

### Variáveis de ambiente (SMTP)
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu@email.com
SMTP_PASSWORD=sua_senha_app
SMTP_FROM=noreply@masterdata.com
SMTP_ENABLED=true  # false = simula no console
```

---

## Regras de Cores (CRÍTICO)

> O sistema tem **modo claro e escuro PRÓPRIOS**, independente do navegador/SO.
> Sempre usar variantes `dark:` explícitas ou inline styles com `useTheme()`.
> **Nunca** depender do tema do navegador — já causou rollback.

### Badges de Urgência (inline styles via useTheme)
```typescript
Alta:  light: { bg: #fee2e2, color: #b91c1c, border: #fca5a5 }
       dark:  { bg: rgba(153,27,27,0.3), color: #f87171, border: #991b1b }

Média: light: { bg: #fef3c7, color: #b45309, border: #fcd34d }
       dark:  { bg: rgba(120,53,15,0.3), color: #fbbf24, border: #78350f }

Baixa: light: { bg: #f3f4f6, color: #4b5563, border: #d1d5db }
       dark:  { bg: rgba(55,65,81,0.5), color: #9ca3af, border: #374151 }
```

### Badges de Status
```
Ativo:     bg-green-100 text-green-800 border border-green-300
Bloqueado: bg-red-100 text-red-800 border border-red-300
Obsoleto:  bg-gray-200 text-gray-700 border border-gray-400
```

---

## Máscaras de Campo (web/lib/masks.ts)

| Campo | Máscara | Função |
|-------|---------|--------|
| NCM | 0000.00.00 | maskNCM |
| CFOP | 0000 | maskCFOP |
| CNPJ | 00.000.000/0000-00 | maskCNPJ |
| CPF | 000.000.000-00 | maskCPF |
| Telefone | (00) 00000-0000 | maskPhone |
| CEP | 00000-000 | maskCEP |
| Moeda | R$ 0.000,00 | maskCurrency |
| Decimal | número com vírgula | maskDecimal |

> Máscaras só são aplicadas em campos `type=text/number`.
> Campos `select` e `date` nunca recebem máscara.

---

## Histórico de Versões Git

| Tag | Descrição |
|-----|-----------|
| v2.5 | Histórico de solicitações e log do sistema |
| v2.6 | Log do sistema com detalhes expandidos DE→PARA |
| v2.7 | Permissões granulares por perfil (10 flags) |
| v2.8 | Ajustes na tela de Nova Solicitação Fase 1 e 2 |
| v2.9 | Base de Dados de Materiais + Link de Pesquisa |
| v2.10 | Contador de materiais vinculados ao PDM |
| v2.11 | Sistema de notificações in-app + e-mail |
| v2.12 | Máscaras e validações de campos |
| v2.13 | Melhorias na tela de Governança |
| v2.14 | Permissões Base de Dados e Perfil de Acesso (12 flags) |

---

## Comandos Úteis

```powershell
# Recriar banco (CUIDADO: apaga tudo)
cd C:\Dev\MasterData\api
$env:DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/masterdata"
python recreate_db.py
python seed_data.py

# Rodar backend
cd C:\Dev\MasterData\api
uvicorn main:app --reload

# Rodar frontend
cd C:\Dev\MasterData\web
npm run dev

# Git
git add .
git commit -m "mensagem"
git tag vX.Y
git push origin main --force
git push origin vX.Y
```
