# Recriar banco de dados

O projeto não usa Alembic em ambiente local. Para aplicar novas tabelas (ex: `field_dictionary`):

## Passo 1 — Recriar tabelas

```bash
cd api
python recreate_db.py
```

Isso executa `drop_all` e `create_all` — **apaga todos os dados**.

## Passo 2 — Popular dados iniciais

```bash
python seed_data.py
```

O seed é idempotente: pode ser executado múltiplas vezes sem duplicar dados.

## Resumo em um comando

```bash
cd api
python recreate_db.py && python seed_data.py
```
