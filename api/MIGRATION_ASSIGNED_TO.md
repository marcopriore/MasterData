# Migration manual: assigned_to_id e assigned_at

O projeto não usa Alembic em ambiente local. Para aplicar as novas colunas manualmente:

## Opção 1 — ALTER TABLE (preserva dados)

Execute no banco PostgreSQL:

```sql
ALTER TABLE material_requests
  ADD COLUMN assigned_to_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN assigned_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS ix_material_requests_assigned_to_id
  ON material_requests(assigned_to_id);
```

## Opção 2 — Recriar tabelas

1. Dropar as tabelas existentes (ou o banco inteiro).
2. Rodar o script de criação do schema (ex: `Base.metadata.create_all(bind)` ou equivalente).
3. Rodar `python seed_data.py` para popular dados iniciais.
