"""
Script para forçar criação do material na Base de Dados para uma solicitação
já finalizada (quando a auto-criação falhou na aprovação).

Uso:
    cd api
    python scripts/force_create_material.py

Editar REQUEST_ID e TENANT_ID no início do arquivo.
"""
from dotenv import load_dotenv
import os
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import datetime
from sqlalchemy import text
from sqlalchemy.orm import joinedload
from db import SessionLocal
from orm_models import MaterialRequestORM, MaterialDatabaseORM
from main import _split_attrs_for_material

REQUEST_ID = 36  # Alterar conforme necessário
TENANT_ID = 1

db = SessionLocal()
try:
    db.execute(text(f"SET app.tenant_id = '{TENANT_ID}'"))
    db.execute(text("SET app.is_master = 'false'"))
    db.commit()

    row = (
        db.query(MaterialRequestORM)
        .options(joinedload(MaterialRequestORM.pdm))
        .filter(MaterialRequestORM.id == REQUEST_ID)
        .first()
    )

    if not row:
        print(f"Solicitação {REQUEST_ID} não encontrada")
        sys.exit(1)

    if not row.id_sistema:
        print(f"Solicitação {REQUEST_ID} não possui id_sistema")
        sys.exit(1)

    existing = db.query(MaterialDatabaseORM).filter(
        MaterialDatabaseORM.id_sistema == row.id_sistema,
        MaterialDatabaseORM.tenant_id == TENANT_ID,
    ).first()

    if existing:
        print(f"Material {row.id_sistema} já existe na Base de Dados (id={existing.id})")
        sys.exit(0)

    pdm = row.pdm
    pdm_code = pdm.internal_code if pdm else None
    pdm_name = pdm.name if pdm else None

    all_attrs = row.technical_attributes or {}
    pdm_attrs, admin_kwargs = _split_attrs_for_material(all_attrs)

    now = datetime.datetime.now(datetime.timezone.utc)
    new_material = MaterialDatabaseORM(
        id_sistema=row.id_sistema,
        tenant_id=TENANT_ID,
        id_erp=None,
        description=row.generated_description or row.id_sistema,
        status="Ativo",
        pdm_code=pdm_code,
        pdm_name=pdm_name,
        technical_attributes=pdm_attrs if pdm_attrs else None,
        source="mdm_request",
        erp_status="pendente_erp",
        standardized_at=now,
        created_at=now,
        updated_at=now,
        **{k: v for k, v in admin_kwargs.items() if hasattr(MaterialDatabaseORM, k)},
    )
    db.add(new_material)
    db.commit()
    print(f"Material {row.id_sistema} criado com sucesso (id={new_material.id})")

except Exception as e:
    db.rollback()
    print(f"Erro: {e}")
    raise
finally:
    db.close()
