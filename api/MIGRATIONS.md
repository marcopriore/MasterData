# Migrações de Banco de Dados

As migrações usam **DATABASE_URL** (conexão postgres/admin), não APP_DATABASE_URL (mdm_app).

## Comandos principais

```bash
# Criar nova migração após alterar orm_models.py
alembic revision --autogenerate -m "descricao_da_mudanca"

# Aplicar migrações pendentes
alembic upgrade head

# Ver histórico
alembic history

# Ver versão atual do banco
alembic current

# Reverter última migração
alembic downgrade -1
```

## Fluxo de trabalho

1. Editar `orm_models.py`
2. `alembic revision --autogenerate -m "descricao"`
3. Revisar o arquivo gerado em `alembic/versions/`
4. `alembic upgrade head`
5. `git add alembic/versions/novo_arquivo.py`
6. `git commit`

## Baseline (banco já existente)

Se o banco já existe e não tem histórico de migrações:

```bash
# Criar migração baseline (upgrade/downgrade vazios)
alembic revision -m "baseline_schema_inicial"

# Editar o arquivo gerado: upgrade() e downgrade() com pass
# Marcar o banco como estando nessa versão
alembic stamp head
```

## Verificação com autogenerate

Para confirmar que o schema está em sincronia:

```bash
alembic revision --autogenerate -m "verificacao_pos_baseline"
```

O arquivo gerado deve ter `upgrade()` e `downgrade()` vazios ou com poucas alterações. Se houver muita diferença, há divergência entre os models Python e o banco.
