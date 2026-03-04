# Como recriar o banco de dados

Após alterações nos modelos ORM (ex.: adição de `request_history`, `system_logs`, `material_database`),
recrie o banco para aplicar o novo esquema.

**Atenção:** Apaga todos os dados existentes.

## Comandos

Na raiz do projeto ou em `api/`:

```bash
# 1. Recriar tabelas (drop + create)
python -m api.recreate_db

# 2. Popular dados iniciais (roles, usuários padrão, etc.)
python -m api.seed_data
```

Ou a partir de `api/`:

```bash
cd api
python recreate_db.py
python seed_data.py
```

## Variáveis de ambiente

Garanta que `api/.env` contenha `DATABASE_URL` (ex.: PostgreSQL):

```
DATABASE_URL=postgresql://user:pass@localhost:5432/mdm
```
