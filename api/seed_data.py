"""
seed_data.py — Popula o banco local para desenvolvimento/testes.

Execução:
    cd api
    python seed_data.py

Idempotente: pode ser executado múltiplas vezes sem duplicar dados.
Cada bloco verifica a existência antes de inserir.

Ordem de inserção (respeita FKs):
  1. Roles          (necessário para User)
  2. User admin     (necessário para material_requests.user_id)
  3. PDM Template   (necessário para material_requests.pdm_id)
  4. Workflow       (necessário para material_requests.workflow_id)
  5. Material Requests (15 registros variados)
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# ── Garante que o .env seja carregado antes de importar db ────────────────────
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from db import SessionLocal
from orm_models import (
    RoleORM,
    UserORM,
    PDMOrm,
    WorkflowHeaderORM,
    WorkflowConfigORM,
    MaterialRequestORM,
)
from security import hash_password

# ─── Constantes ───────────────────────────────────────────────────────────────

# Usuários e senhas para cada perfil
_USER_CREDENTIALS = [
    ("admin@masterdata.com",        "Admin@1234",       "ADMIN",        "Administrador"),
    ("solicitante@masterdata.com",  "Solicitante@1234", "SOLICITANTE",  "Solicitante"),
    ("triagem@masterdata.com",      "Triagem@1234",     "TRIAGEM",      "Usuário Triagem"),
    ("fiscal@masterdata.com",       "Fiscal@1234",      "FISCAL",       "Usuário Fiscal"),
    ("master@masterdata.com",       "Master@1234",      "MASTER",       "Usuário Master"),
    ("mrp@masterdata.com",          "Mrp@1234",         "MRP",          "Usuário MRP"),
]

PDM_NAME          = "Rolamento Industrial"
PDM_INTERNAL_CODE = "PDM-ROL-001"

WORKFLOW_NAME = "Fluxo Padrão de Cadastro"

# Etapas do workflow — status_key é o valor gravado em material_requests.status
WORKFLOW_STEPS = [
    {"step_name": "Triagem",    "status_key": "Triagem",    "order": 1},
    {"step_name": "Fiscal",     "status_key": "Fiscal",     "order": 2},
    {"step_name": "Master",     "status_key": "Master",     "order": 3},
    {"step_name": "MRP",        "status_key": "MRP",        "order": 4},
    {"step_name": "Finalizado", "status_key": "Finalizado", "order": 5},
]

# 15 solicitações de exemplo
# urgency: "low" | "medium" | "high"  (valores do banco, não labels PT)
_REQUESTS: list[dict] = [
    {
        "requester": "CARLOS SOUZA",
        "cost_center": "CC-4500-MNT",
        "urgency": "low",
        "status": "Triagem",
        "justification": "Reposição de estoque preventivo.",
        "generated_description": "ROLAMENTO [ESFERAS] [6205] [ABERTO] [25MM]",
        "technical_attributes": {"tipo": "ESFERAS", "modelo": "6205", "vedacao": "ABERTO", "diametro": "25MM"},
        "days_ago": 14,
    },
    {
        "requester": "ANA PAULA LIMA",
        "cost_center": "CC-3200-PRD",
        "urgency": "high",
        "status": "Fiscal",
        "justification": "Parada de linha de produção.",
        "generated_description": "ROLAMENTO [ROLOS CÔNICOS] [30205] [VEDADO] [52MM]",
        "technical_attributes": {"tipo": "ROLOS CÔNICOS", "modelo": "30205", "vedacao": "VEDADO", "diametro": "52MM"},
        "days_ago": 2,
    },
    {
        "requester": "ROBERTO ALVES",
        "cost_center": "CC-1100-ENG",
        "urgency": "medium",
        "status": "Master",
        "justification": "Substituição por desgaste programado.",
        "generated_description": "ROLAMENTO [AGULHAS] [NA4905] [ABERTO] [35MM]",
        "technical_attributes": {"tipo": "AGULHAS", "modelo": "NA4905", "vedacao": "ABERTO", "diametro": "35MM"},
        "days_ago": 7,
    },
    {
        "requester": "FERNANDA COSTA",
        "cost_center": "CC-4500-MNT",
        "urgency": "low",
        "status": "MRP",
        "justification": "Manutenção preventiva semestral.",
        "generated_description": "ROLAMENTO [ESFERAS] [6306] [2RS] [72MM]",
        "technical_attributes": {"tipo": "ESFERAS", "modelo": "6306", "vedacao": "2RS", "diametro": "72MM"},
        "days_ago": 21,
    },
    {
        "requester": "MARCOS PEREIRA",
        "cost_center": "CC-2200-LOG",
        "urgency": "high",
        "status": "Finalizado",
        "justification": "Urgente — equipamento crítico parado.",
        "generated_description": "ROLAMENTO [AUTOCOMPENSADOR] [1205] [ABERTO] [52MM]",
        "technical_attributes": {"tipo": "AUTOCOMPENSADOR", "modelo": "1205", "vedacao": "ABERTO", "diametro": "52MM"},
        "days_ago": 30,
    },
    {
        "requester": "JULIANA MARTINS",
        "cost_center": "CC-3200-PRD",
        "urgency": "medium",
        "status": "Triagem",
        "justification": "Novo projeto de expansão.",
        "generated_description": "ROLAMENTO [ESFERAS] [6004] [ZZ] [42MM]",
        "technical_attributes": {"tipo": "ESFERAS", "modelo": "6004", "vedacao": "ZZ", "diametro": "42MM"},
        "days_ago": 5,
    },
    {
        "requester": "PAULO HENRIQUE",
        "cost_center": "CC-1100-ENG",
        "urgency": "low",
        "status": "Fiscal",
        "justification": "Reposição de estoque mínimo.",
        "generated_description": "ROLAMENTO [ROLOS CILÍNDRICOS] [NU205] [ABERTO] [52MM]",
        "technical_attributes": {"tipo": "ROLOS CILÍNDRICOS", "modelo": "NU205", "vedacao": "ABERTO", "diametro": "52MM"},
        "days_ago": 10,
    },
    {
        "requester": "BEATRIZ SANTOS",
        "cost_center": "CC-4500-MNT",
        "urgency": "high",
        "status": "Master",
        "justification": "Falha detectada em inspeção.",
        "generated_description": "ROLAMENTO [ESFERAS] [6208] [2RS] [80MM]",
        "technical_attributes": {"tipo": "ESFERAS", "modelo": "6208", "vedacao": "2RS", "diametro": "80MM"},
        "days_ago": 3,
    },
    {
        "requester": "THIAGO RODRIGUES",
        "cost_center": "CC-2200-LOG",
        "urgency": "medium",
        "status": "MRP",
        "justification": "Ampliação de frota de empilhadeiras.",
        "generated_description": "ROLAMENTO [ESFERAS] [6001] [ZZ] [28MM]",
        "technical_attributes": {"tipo": "ESFERAS", "modelo": "6001", "vedacao": "ZZ", "diametro": "28MM"},
        "days_ago": 18,
    },
    {
        "requester": "CAMILA FERREIRA",
        "cost_center": "CC-3200-PRD",
        "urgency": "low",
        "status": "Finalizado",
        "justification": "Compra programada no plano anual.",
        "generated_description": "ROLAMENTO [ROLOS CÔNICOS] [32207] [VEDADO] [72MM]",
        "technical_attributes": {"tipo": "ROLOS CÔNICOS", "modelo": "32207", "vedacao": "VEDADO", "diametro": "72MM"},
        "days_ago": 45,
    },
    {
        "requester": "DIEGO NASCIMENTO",
        "cost_center": "CC-1100-ENG",
        "urgency": "high",
        "status": "Triagem",
        "justification": "Quebra inesperada — produção parada.",
        "generated_description": "ROLAMENTO [AGULHAS] [HK2016] [ABERTO] [26MM]",
        "technical_attributes": {"tipo": "AGULHAS", "modelo": "HK2016", "vedacao": "ABERTO", "diametro": "26MM"},
        "days_ago": 1,
    },
    {
        "requester": "LARISSA OLIVEIRA",
        "cost_center": "CC-4500-MNT",
        "urgency": "medium",
        "status": "Fiscal",
        "justification": "Revisão geral de motores elétricos.",
        "generated_description": "ROLAMENTO [ESFERAS] [6310] [2RS] [110MM]",
        "technical_attributes": {"tipo": "ESFERAS", "modelo": "6310", "vedacao": "2RS", "diametro": "110MM"},
        "days_ago": 8,
    },
    {
        "requester": "GUSTAVO LIMA",
        "cost_center": "CC-2200-LOG",
        "urgency": "low",
        "status": "Master",
        "justification": "Estoque de segurança para peças críticas.",
        "generated_description": "ROLAMENTO [AUTOCOMPENSADOR] [2206] [ABERTO] [62MM]",
        "technical_attributes": {"tipo": "AUTOCOMPENSADOR", "modelo": "2206", "vedacao": "ABERTO", "diametro": "62MM"},
        "days_ago": 12,
    },
    {
        "requester": "PATRICIA MENDES",
        "cost_center": "CC-3200-PRD",
        "urgency": "high",
        "status": "MRP",
        "justification": "Substituição emergencial — vibração excessiva.",
        "generated_description": "ROLAMENTO [ROLOS CILÍNDRICOS] [NJ308] [ABERTO] [90MM]",
        "technical_attributes": {"tipo": "ROLOS CILÍNDRICOS", "modelo": "NJ308", "vedacao": "ABERTO", "diametro": "90MM"},
        "days_ago": 4,
    },
    {
        "requester": "ANDERSON SILVA",
        "cost_center": "CC-1100-ENG",
        "urgency": "medium",
        "status": "Finalizado",
        "justification": "Encerramento de ordem de manutenção.",
        "generated_description": "ROLAMENTO [ESFERAS] [6202] [ZZ] [35MM]",
        "technical_attributes": {"tipo": "ESFERAS", "modelo": "6202", "vedacao": "ZZ", "diametro": "35MM"},
        "days_ago": 60,
    },
]

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    print(f"  {msg}")


def _ok(msg: str) -> None:
    print(f"  [OK]   {msg}")


def _skip(msg: str) -> None:
    print(f"  [SKIP] {msg} (ja existe, ignorado)")


# ─── Seed functions ───────────────────────────────────────────────────────────

def ensure_roles(db) -> dict[str, RoleORM]:
    """Returns a name→ORM map for ADMIN, SOLICITANTE, TRIAGEM, FISCAL, MASTER, MRP."""
    role_defs = [
        ("ADMIN", "sistema", {
            "can_approve": True, "can_reject": True, "can_edit_pdm": True,
            "can_manage_users": True, "can_manage_workflows": True, "can_submit_request": True,
        }),
        ("SOLICITANTE", "sistema", {
            "can_approve": False, "can_reject": False, "can_edit_pdm": False,
            "can_manage_users": False, "can_manage_workflows": False, "can_submit_request": True,
        }),
        ("TRIAGEM", "etapa", {"can_approve": True, "can_reject": True}),
        ("FISCAL", "etapa", {"can_approve": True, "can_reject": True}),
        ("MASTER", "etapa", {"can_approve": True, "can_reject": True}),
        ("MRP", "etapa", {"can_approve": True, "can_reject": True}),
    ]
    role_map: dict[str, RoleORM] = {}
    for name, role_type, perms in role_defs:
        row = db.query(RoleORM).filter(RoleORM.name == name).first()
        if row:
            _skip(f"Role {name}")
        else:
            row = RoleORM(name=name, role_type=role_type, permissions=perms)
            db.add(row)
            db.flush()
            _ok(f"Role {name} criado")
        role_map[name] = row
    return role_map


def ensure_users(db, role_map: dict[str, RoleORM]) -> dict[str, UserORM]:
    """Creates one user per profile if they don't exist. Returns email→UserORM map."""
    user_map: dict[str, UserORM] = {}
    for email, password, role_name, display_name in _USER_CREDENTIALS:
        row = db.query(UserORM).filter(UserORM.email == email).first()
        if row:
            _skip(f"Usuário {email}")
        else:
            role = role_map.get(role_name)
            if role is None:
                raise RuntimeError(f"Role {role_name} não encontrada — execute ensure_roles primeiro.")
            row = UserORM(
                name=display_name,
                email=email,
                hashed_password=hash_password(password),
                role_id=role.id,
                is_active=True,
                preferences={"theme": "light", "language": "pt"},
                created_at=datetime.utcnow(),
            )
            db.add(row)
            db.flush()
            _ok(f"Usuário {email} criado (senha: {password})")
        user_map[email] = row
    return user_map


def ensure_pdm(db) -> PDMOrm:
    """Creates the 'Rolamento Industrial' PDM template if it doesn't exist."""
    row = db.query(PDMOrm).filter(PDMOrm.name == PDM_NAME).first()
    if row:
        _skip(f"PDM '{PDM_NAME}'")
        return row

    row = PDMOrm(
        name=PDM_NAME,
        internal_code=PDM_INTERNAL_CODE,
        is_active=True,
        attributes=[
            {
                "id": "tipo",
                "order": 1,
                "name": "Tipo de Rolamento",
                "dataType": "lov",
                "isRequired": True,
                "includeInDescription": True,
                "abbreviation": "",
                "allowedValues": [
                    {"value": "ESFERAS",           "abbreviation": ""},
                    {"value": "ROLOS CÔNICOS",      "abbreviation": ""},
                    {"value": "ROLOS CILÍNDRICOS",  "abbreviation": ""},
                    {"value": "AGULHAS",            "abbreviation": ""},
                    {"value": "AUTOCOMPENSADOR",    "abbreviation": ""},
                ],
            },
            {
                "id": "modelo",
                "order": 2,
                "name": "Modelo / Referência",
                "dataType": "text",
                "isRequired": True,
                "includeInDescription": True,
                "abbreviation": "",
                "allowedValues": [],
            },
            {
                "id": "vedacao",
                "order": 3,
                "name": "Vedação",
                "dataType": "lov",
                "isRequired": True,
                "includeInDescription": True,
                "abbreviation": "",
                "allowedValues": [
                    {"value": "ABERTO", "abbreviation": ""},
                    {"value": "ZZ",     "abbreviation": ""},
                    {"value": "2RS",    "abbreviation": ""},
                    {"value": "VEDADO", "abbreviation": ""},
                ],
            },
            {
                "id": "diametro",
                "order": 4,
                "name": "Diâmetro Externo",
                "dataType": "text",
                "isRequired": True,
                "includeInDescription": True,
                "abbreviation": "",
                "allowedValues": [],
            },
        ],
    )
    db.add(row)
    db.flush()
    _ok(f"PDM '{PDM_NAME}' (id={row.id}) criado")
    return row


def ensure_workflow(db) -> WorkflowHeaderORM:
    """Creates the standard workflow with 5 steps if it doesn't exist."""
    row = db.query(WorkflowHeaderORM).filter(WorkflowHeaderORM.name == WORKFLOW_NAME).first()
    if row:
        _skip(f"Workflow '{WORKFLOW_NAME}'")
        return row

    row = WorkflowHeaderORM(
        name=WORKFLOW_NAME,
        description="Fluxo padrão: Triagem → Fiscal → Master → Pendente → Finalizado",
        is_active=True,
    )
    db.add(row)
    db.flush()

    for step in WORKFLOW_STEPS:
        db.add(WorkflowConfigORM(
            workflow_id=row.id,
            step_name=step["step_name"],
            status_key=step["status_key"],
            order=step["order"],
            is_active=True,
        ))

    db.flush()
    _ok(f"Workflow '{WORKFLOW_NAME}' (id={row.id}) com {len(WORKFLOW_STEPS)} etapas criado")
    return row


def seed_requests(db, pdm: PDMOrm, workflow: WorkflowHeaderORM, user: UserORM) -> int:
    """Inserts the 15 sample requests. Skips if the table already has rows."""
    existing = db.query(MaterialRequestORM).count()
    if existing >= len(_REQUESTS):
        _skip(f"material_requests já possui {existing} registros")
        return 0

    now = datetime.utcnow()
    inserted = 0
    for req in _REQUESTS:
        db.add(MaterialRequestORM(
            pdm_id=pdm.id,
            workflow_id=workflow.id,
            status=req["status"],
            user_id=user.id,
            requester=req["requester"],
            cost_center=req["cost_center"],
            urgency=req["urgency"],
            justification=req["justification"],
            generated_description=req["generated_description"],
            technical_attributes=req["technical_attributes"],
            attachments=[],
            created_at=now - timedelta(days=req["days_ago"]),
        ))
        inserted += 1

    db.flush()
    _ok(f"{inserted} solicitações inseridas")
    return inserted


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("\n=== seed_data.py - MDM Platform ===\n")

    db = SessionLocal()
    try:
        print("1. Roles")
        role_map = ensure_roles(db)

        print("\n2. Usuários")
        user_map = ensure_users(db, role_map)
        admin_user = user_map["admin@masterdata.com"]

        print("\n3. PDM Template")
        pdm = ensure_pdm(db)

        print("\n4. Workflow")
        workflow = ensure_workflow(db)

        print("\n5. Material Requests")
        seed_requests(db, pdm, workflow, admin_user)

        db.commit()
        print("\n=== Seed concluido com sucesso! ===\n")

    except Exception as exc:
        db.rollback()
        print(f"\n[ERRO] {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
