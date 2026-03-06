"""
Script para migrar campos administrativos do technical_attributes para colunas ORM.

Recorre technical_attributes com _split_attrs_for_material e move campos administrativos
para as colunas corretas. Só sobrescreve colunas NULL (preserva dados existentes).

Uso:
    cd api
    python scripts/fix_technical_attributes.py

Editar TENANT_ID no início do arquivo se necessário.
"""
from dotenv import load_dotenv
import os
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from db import SessionLocal
from orm_models import MaterialDatabaseORM
from main import _split_attrs_for_material

TENANT_ID = 1  # ajustar se necessário

db = SessionLocal()
try:
    db.execute(text("SET app.is_master = 'true'"))
    db.commit()

    materials = db.query(MaterialDatabaseORM).filter(
        MaterialDatabaseORM.tenant_id == TENANT_ID
    ).all()

    updated = 0
    for mat in materials:
        attrs = mat.technical_attributes or {}
        pdm_attrs, admin_kwargs = _split_attrs_for_material(attrs)

        if not admin_kwargs:
            continue

        # Atualizar colunas ORM com campos administrativos (só se NULL)
        for col, val in admin_kwargs.items():
            if hasattr(mat, col) and getattr(mat, col) is None:
                setattr(mat, col, val)

        # Limpar technical_attributes — manter apenas campos PDM
        mat.technical_attributes = pdm_attrs
        updated += 1
        print(f"  Atualizado: {mat.id_sistema} — {list(admin_kwargs.keys())}")

    db.commit()
    print(f"\nTotal atualizado: {updated} materiais")

except Exception as e:
    db.rollback()
    print(f"Erro: {e}")
    raise
finally:
    db.close()
