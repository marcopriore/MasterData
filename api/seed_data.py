"""
seed_data.py — Popula o banco local para desenvolvimento/testes.

Execução:
    cd api
    python seed_data.py

Usa postgres (BYPASSRLS) para operações admin — não usa db.engine.
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

# ── Garante que o .env seja carregado antes de importar ───────────────────────
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")
# noqa: E402 — imports abaixo dependem das variáveis de ambiente carregadas acima

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Engine admin com postgres (BYPASSRLS) — não usa db.engine
_admin_url = os.getenv("DATABASE_URL", "")
if "@db:" in _admin_url:
    _admin_url = _admin_url.replace("@db:", "@localhost:")
if not _admin_url:
    raise RuntimeError("DATABASE_URL não definido (api/.env)")
_admin_engine = create_engine(_admin_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=_admin_engine, autoflush=False, autocommit=False)
from deps import set_tenant_in_session
from orm_models import (
    TenantORM,
    RoleORM,
    UserORM,
    PDMOrm,
    WorkflowHeaderORM,
    WorkflowConfigORM,
    MaterialRequestORM,
    MaterialDatabaseORM,
    FieldDictionaryORM,
)
from security import hash_password
from constants import ONBOARDING_ROLE_DEFS, ONBOARDING_WORKFLOW_STEPS, ONBOARDING_FIELD_DICT

# ─── Constantes ───────────────────────────────────────────────────────────────

# Usuários por tenant: (email, senha, perfil, nome)
_TENANT1_CREDENTIALS = [
    ("master@masterdata.com", "Master@1234", "MASTER", "Usuário Master"),
    ("admin@masterdata.com", "Admin@1234", "ADMIN", "Administrador"),
]
_TENANT2_CREDENTIALS = [
    ("admin@empresa-demo.com", "Admin@1234", "ADMIN", "Administrador"),
    ("solicitante@empresa-demo.com", "Solicitante@1234", "SOLICITANTE", "Solicitante"),
    ("cadastro@empresa-demo.com", "Cadastro@1234", "CADASTRO", "Central de Cadastro"),
]

PDM_NAME          = "Rolamento Industrial"
PDM_INTERNAL_CODE = "PDM-ROL-001"

WORKFLOW_NAME = "Fluxo Padrão de Cadastro"

# 15 solicitações de exemplo — status usa status_key do workflow (cadastro, compras, mrp, fiscal, contabilidade, finalizado)
# urgency: "low" | "medium" | "high"  (valores do banco, não labels PT)
_REQUESTS: list[dict] = [
    {
        "requester": "CARLOS SOUZA",
        "cost_center": "CC-4500-MNT",
        "urgency": "low",
        "status": "cadastro",
        "justification": "Reposição de estoque preventivo.",
        "generated_description": "ROLAMENTO [ESFERAS] [6205] [ABERTO] [25MM]",
        "technical_attributes": {"tipo": "ESFERAS", "modelo": "6205", "vedacao": "ABERTO", "diametro": "25MM"},
        "days_ago": 14,
    },
    {
        "requester": "ANA PAULA LIMA",
        "cost_center": "CC-3200-PRD",
        "urgency": "high",
        "status": "fiscal",
        "justification": "Parada de linha de produção.",
        "generated_description": "ROLAMENTO [ROLOS CÔNICOS] [30205] [VEDADO] [52MM]",
        "technical_attributes": {"tipo": "ROLOS CÔNICOS", "modelo": "30205", "vedacao": "VEDADO", "diametro": "52MM"},
        "days_ago": 2,
    },
    {
        "requester": "ROBERTO ALVES",
        "cost_center": "CC-1100-ENG",
        "urgency": "medium",
        "status": "compras",
        "justification": "Substituição por desgaste programado.",
        "generated_description": "ROLAMENTO [AGULHAS] [NA4905] [ABERTO] [35MM]",
        "technical_attributes": {"tipo": "AGULHAS", "modelo": "NA4905", "vedacao": "ABERTO", "diametro": "35MM"},
        "days_ago": 7,
    },
    {
        "requester": "FERNANDA COSTA",
        "cost_center": "CC-4500-MNT",
        "urgency": "low",
        "status": "mrp",
        "justification": "Manutenção preventiva semestral.",
        "generated_description": "ROLAMENTO [ESFERAS] [6306] [2RS] [72MM]",
        "technical_attributes": {"tipo": "ESFERAS", "modelo": "6306", "vedacao": "2RS", "diametro": "72MM"},
        "days_ago": 21,
    },
    {
        "requester": "MARCOS PEREIRA",
        "cost_center": "CC-2200-LOG",
        "urgency": "high",
        "status": "finalizado",
        "justification": "Urgente — equipamento crítico parado.",
        "generated_description": "ROLAMENTO [AUTOCOMPENSADOR] [1205] [ABERTO] [52MM]",
        "technical_attributes": {"tipo": "AUTOCOMPENSADOR", "modelo": "1205", "vedacao": "ABERTO", "diametro": "52MM"},
        "days_ago": 30,
    },
    {
        "requester": "JULIANA MARTINS",
        "cost_center": "CC-3200-PRD",
        "urgency": "medium",
        "status": "cadastro",
        "justification": "Novo projeto de expansão.",
        "generated_description": "ROLAMENTO [ESFERAS] [6004] [ZZ] [42MM]",
        "technical_attributes": {"tipo": "ESFERAS", "modelo": "6004", "vedacao": "ZZ", "diametro": "42MM"},
        "days_ago": 5,
    },
    {
        "requester": "PAULO HENRIQUE",
        "cost_center": "CC-1100-ENG",
        "urgency": "low",
        "status": "fiscal",
        "justification": "Reposição de estoque mínimo.",
        "generated_description": "ROLAMENTO [ROLOS CILÍNDRICOS] [NU205] [ABERTO] [52MM]",
        "technical_attributes": {"tipo": "ROLOS CILÍNDRICOS", "modelo": "NU205", "vedacao": "ABERTO", "diametro": "52MM"},
        "days_ago": 10,
    },
    {
        "requester": "BEATRIZ SANTOS",
        "cost_center": "CC-4500-MNT",
        "urgency": "high",
        "status": "compras",
        "justification": "Falha detectada em inspeção.",
        "generated_description": "ROLAMENTO [ESFERAS] [6208] [2RS] [80MM]",
        "technical_attributes": {"tipo": "ESFERAS", "modelo": "6208", "vedacao": "2RS", "diametro": "80MM"},
        "days_ago": 3,
    },
    {
        "requester": "THIAGO RODRIGUES",
        "cost_center": "CC-2200-LOG",
        "urgency": "medium",
        "status": "mrp",
        "justification": "Ampliação de frota de empilhadeiras.",
        "generated_description": "ROLAMENTO [ESFERAS] [6001] [ZZ] [28MM]",
        "technical_attributes": {"tipo": "ESFERAS", "modelo": "6001", "vedacao": "ZZ", "diametro": "28MM"},
        "days_ago": 18,
    },
    {
        "requester": "CAMILA FERREIRA",
        "cost_center": "CC-3200-PRD",
        "urgency": "low",
        "status": "finalizado",
        "justification": "Compra programada no plano anual.",
        "generated_description": "ROLAMENTO [ROLOS CÔNICOS] [32207] [VEDADO] [72MM]",
        "technical_attributes": {"tipo": "ROLOS CÔNICOS", "modelo": "32207", "vedacao": "VEDADO", "diametro": "72MM"},
        "days_ago": 45,
    },
    {
        "requester": "DIEGO NASCIMENTO",
        "cost_center": "CC-1100-ENG",
        "urgency": "high",
        "status": "cadastro",
        "justification": "Quebra inesperada — produção parada.",
        "generated_description": "ROLAMENTO [AGULHAS] [HK2016] [ABERTO] [26MM]",
        "technical_attributes": {"tipo": "AGULHAS", "modelo": "HK2016", "vedacao": "ABERTO", "diametro": "26MM"},
        "days_ago": 1,
    },
    {
        "requester": "LARISSA OLIVEIRA",
        "cost_center": "CC-4500-MNT",
        "urgency": "medium",
        "status": "fiscal",
        "justification": "Revisão geral de motores elétricos.",
        "generated_description": "ROLAMENTO [ESFERAS] [6310] [2RS] [110MM]",
        "technical_attributes": {"tipo": "ESFERAS", "modelo": "6310", "vedacao": "2RS", "diametro": "110MM"},
        "days_ago": 8,
    },
    {
        "requester": "GUSTAVO LIMA",
        "cost_center": "CC-2200-LOG",
        "urgency": "low",
        "status": "compras",
        "justification": "Estoque de segurança para peças críticas.",
        "generated_description": "ROLAMENTO [AUTOCOMPENSADOR] [2206] [ABERTO] [62MM]",
        "technical_attributes": {"tipo": "AUTOCOMPENSADOR", "modelo": "2206", "vedacao": "ABERTO", "diametro": "62MM"},
        "days_ago": 12,
    },
    {
        "requester": "PATRICIA MENDES",
        "cost_center": "CC-3200-PRD",
        "urgency": "high",
        "status": "mrp",
        "justification": "Substituição emergencial — vibração excessiva.",
        "generated_description": "ROLAMENTO [ROLOS CILÍNDRICOS] [NJ308] [ABERTO] [90MM]",
        "technical_attributes": {"tipo": "ROLOS CILÍNDRICOS", "modelo": "NJ308", "vedacao": "ABERTO", "diametro": "90MM"},
        "days_ago": 4,
    },
    {
        "requester": "ANDERSON SILVA",
        "cost_center": "CC-1100-ENG",
        "urgency": "medium",
        "status": "finalizado",
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

def ensure_tenant(db, name: str, slug: str) -> TenantORM:
    """Cria tenant se não existir. Retorna o tenant."""
    row = db.query(TenantORM).filter(TenantORM.slug == slug).first()
    if row:
        _skip(f"Tenant {slug}")
        return row
    row = TenantORM(name=name, slug=slug, is_active=True)
    db.add(row)
    db.flush()
    _ok(f"Tenant '{name}' (slug: {slug}) criado")
    return row


def ensure_roles(db, tenant_id: int) -> dict[str, RoleORM]:
    """Returns a name→ORM map for roles from ONBOARDING_ROLE_DEFS.
    Migra usuários TRIAGEM → CADASTRO antes de remover TRIAGEM (legacy)."""
    from orm_models import UserORM

    # Migrar usuários TRIAGEM → CADASTRO se CADASTRO existir ou será criado
    role_triagem = db.query(RoleORM).filter(
        RoleORM.tenant_id == tenant_id,
        RoleORM.name == "TRIAGEM",
    ).first()
    role_cadastro = db.query(RoleORM).filter(
        RoleORM.tenant_id == tenant_id,
        RoleORM.name == "CADASTRO",
    ).first()

    role_map: dict[str, RoleORM] = {}
    for rdef in ONBOARDING_ROLE_DEFS:
        name = rdef["name"]
        row = db.query(RoleORM).filter(
            RoleORM.tenant_id == tenant_id,
            RoleORM.name == name,
        ).first()
        if row:
            _skip(f"Role {name}")
        else:
            row = RoleORM(
                tenant_id=tenant_id,
                name=name,
                role_type=rdef["role_type"],
                permissions=rdef["permissions"],
            )
            db.add(row)
            db.flush()
            _ok(f"Role {name} criado")
        role_map[name] = row

    # Migrar usuários TRIAGEM → CADASTRO e remover role TRIAGEM (legacy)
    if role_triagem and "CADASTRO" in role_map:
        cadastro = role_map["CADASTRO"]
        migrated = db.query(UserORM).filter(
            UserORM.tenant_id == tenant_id,
            UserORM.role_id == role_triagem.id,
        ).update({"role_id": cadastro.id}, synchronize_session=False)
        if migrated:
            _ok(f"Migrados {migrated} usuário(s) de TRIAGEM para CADASTRO")
        db.delete(role_triagem)
        db.flush()
        _ok("Role TRIAGEM removida (substituída por CADASTRO)")

    return role_map


def ensure_users(
    db,
    tenant_id: int,
    role_map: dict[str, RoleORM],
    credentials: list[tuple[str, str, str, str]],
) -> dict[str, UserORM]:
    """Creates users from credentials if they don't exist. Returns email→UserORM map."""
    user_map: dict[str, UserORM] = {}
    for email, password, role_name, display_name in credentials:
        row = db.query(UserORM).filter(
            UserORM.tenant_id == tenant_id,
            UserORM.email == email,
        ).first()
        if row:
            _skip(f"Usuário {email}")
        else:
            role = role_map.get(role_name)
            if role is None:
                raise RuntimeError(f"Role {role_name} não encontrada — execute ensure_roles primeiro.")
            row = UserORM(
                tenant_id=tenant_id,
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


def ensure_pdm(db, tenant_id: int) -> PDMOrm:
    """Creates the 'Rolamento Industrial' PDM template if it doesn't exist."""
    row = db.query(PDMOrm).filter(
        PDMOrm.tenant_id == tenant_id,
        PDMOrm.name == PDM_NAME,
    ).first()
    if row:
        _skip(f"PDM '{PDM_NAME}'")
        return row

    row = PDMOrm(
        tenant_id=tenant_id,
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


def ensure_workflow(db, tenant_id: int) -> WorkflowHeaderORM:
    """Cria ou atualiza o workflow padrão com 6 etapas de ONBOARDING_WORKFLOW_STEPS."""
    row = db.query(WorkflowHeaderORM).filter(
        WorkflowHeaderORM.tenant_id == tenant_id,
        WorkflowHeaderORM.name == WORKFLOW_NAME,
    ).first()
    if not row:
        row = WorkflowHeaderORM(
            tenant_id=tenant_id,
            name=WORKFLOW_NAME,
            description="Fluxo padrão: Central de Cadastro → Compras → MRP → Fiscal → Contabilidade → Finalizado",
            is_active=True,
        )
        db.add(row)
        db.flush()
        _ok(f"Workflow '{WORKFLOW_NAME}' (id={row.id}) criado")

    # Substituir etapas existentes pelas de ONBOARDING_WORKFLOW_STEPS
    deleted = db.query(WorkflowConfigORM).filter(
        WorkflowConfigORM.tenant_id == tenant_id,
        WorkflowConfigORM.workflow_id == row.id,
    ).delete(synchronize_session=False)
    if deleted:
        _ok(f"Workflow: {deleted} etapa(s) antiga(s) removida(s)")

    for step in ONBOARDING_WORKFLOW_STEPS:
        db.add(WorkflowConfigORM(
            tenant_id=tenant_id,
            workflow_id=row.id,
            step_name=step["step_name"],
            status_key=step["status_key"],
            order=step["order"],
            is_active=True,
        ))

    db.flush()
    if not deleted:
        _ok(f"Workflow '{WORKFLOW_NAME}' com {len(ONBOARDING_WORKFLOW_STEPS)} etapas")
    return row


def seed_requests(db, tenant_id: int, pdm: PDMOrm, workflow: WorkflowHeaderORM, user: UserORM) -> int:
    """Inserts the 15 sample requests. Skips if the table already has rows."""
    existing = db.query(MaterialRequestORM).count()
    if existing >= len(_REQUESTS):
        _skip(f"material_requests já possui {existing} registros")
        return 0

    now = datetime.utcnow()
    inserted = 0
    for req in _REQUESTS:
        db.add(MaterialRequestORM(
            tenant_id=tenant_id,
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


# Field dictionary vem de ONBOARDING_FIELD_DICT (constants.py)


# 20 materiais mockados de rolamentos industriais
_MATERIAL_DATABASE_ENTRIES: list[dict] = [
    {"id_erp": "10000001", "description": "ROLAMENTO ESFERAS 6205-2RS 25MM ABERTO", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "FAG", "unit_of_measure": "UN", "ncm": "8482.10.10", "material_type": "Rolamento", "gross_weight": 0.25, "net_weight": 0.23, "cfop": "6102", "origin": "0 - Nacional", "purchase_group": "001", "lead_time": 14, "mrp_type": "PD", "min_stock": 10.0, "max_stock": 100.0, "valuation_class": "3000", "standard_price": 45.90, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000002", "description": "ROLAMENTO ROLOS CONICOS 30205 VEDADO 52MM", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "SKF", "unit_of_measure": "UN", "ncm": "8482.20.00", "material_type": "Rolamento", "gross_weight": 0.52, "net_weight": 0.48, "cfop": "5101", "origin": "1 - Importado", "purchase_group": "002", "lead_time": 21, "mrp_type": "PD", "min_stock": 5.0, "max_stock": 50.0, "valuation_class": "3000", "standard_price": 128.50, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000003", "description": "ROLAMENTO AGULHAS NA4905 35MM ABERTO", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "NSK", "unit_of_measure": "UN", "ncm": "8482.10.10", "material_type": "Rolamento", "gross_weight": 0.18, "net_weight": 0.16, "cfop": "6102", "origin": "0 - Nacional", "purchase_group": "001", "lead_time": 10, "mrp_type": "VB", "min_stock": 20.0, "max_stock": 80.0, "valuation_class": "3000", "standard_price": 32.00, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000004", "description": "ROLAMENTO ESFERAS 6306-2RS 72MM VEDADO", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "FAG", "unit_of_measure": "UN", "ncm": "8482.10.10", "material_type": "Rolamento", "gross_weight": 0.85, "net_weight": 0.78, "cfop": "6102", "origin": "0 - Nacional", "purchase_group": "001", "lead_time": 15, "mrp_type": "PD", "min_stock": 8.0, "max_stock": 60.0, "valuation_class": "3000", "standard_price": 89.90, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000005", "description": "ROLAMENTO AUTOCOMPENSADOR 1205 52MM ABERTO", "status": "Bloqueado", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "SKF", "unit_of_measure": "UN", "ncm": "8482.30.00", "material_type": "Rolamento", "gross_weight": 0.42, "net_weight": 0.38, "cfop": "6102", "origin": "1 - Importado", "purchase_group": "002", "lead_time": 30, "mrp_type": "ND", "min_stock": 0.0, "max_stock": 20.0, "valuation_class": "3000", "standard_price": 156.00, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000006", "description": "ROLAMENTO ESFERAS 6004-ZZ 42MM", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "FAG", "unit_of_measure": "UN", "ncm": "8482.10.10", "material_type": "Rolamento", "gross_weight": 0.32, "net_weight": 0.29, "cfop": "6102", "origin": "0 - Nacional", "purchase_group": "001", "lead_time": 12, "mrp_type": "PD", "min_stock": 15.0, "max_stock": 90.0, "valuation_class": "3000", "standard_price": 28.50, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000007", "description": "ROLAMENTO ROLOS CILINDRICOS NU205 52MM ABERTO", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "NSK", "unit_of_measure": "UN", "ncm": "8482.20.00", "material_type": "Rolamento", "gross_weight": 0.48, "net_weight": 0.44, "cfop": "6102", "origin": "0 - Nacional", "purchase_group": "001", "lead_time": 14, "mrp_type": "PD", "min_stock": 6.0, "max_stock": 40.0, "valuation_class": "3000", "standard_price": 95.00, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000008", "description": "ROLAMENTO ESFERAS 6208-2RS 80MM VEDADO", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "SKF", "unit_of_measure": "UN", "ncm": "8482.10.10", "material_type": "Rolamento", "gross_weight": 1.12, "net_weight": 1.02, "cfop": "6102", "origin": "1 - Importado", "purchase_group": "002", "lead_time": 20, "mrp_type": "PD", "min_stock": 4.0, "max_stock": 30.0, "valuation_class": "3000", "standard_price": 145.00, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000009", "description": "ROLAMENTO ESFERAS 6001-ZZ 28MM", "status": "Obsoleto", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "FAG", "unit_of_measure": "UN", "ncm": "8482.10.10", "material_type": "Rolamento", "gross_weight": 0.12, "net_weight": 0.10, "cfop": "6102", "origin": "0 - Nacional", "purchase_group": "001", "lead_time": 8, "mrp_type": "ND", "min_stock": 0.0, "max_stock": 0.0, "valuation_class": "3000", "standard_price": 18.00, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000010", "description": "ROLAMENTO ROLOS CONICOS 32207 VEDADO 72MM", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "SKF", "unit_of_measure": "UN", "ncm": "8482.20.00", "material_type": "Rolamento", "gross_weight": 1.25, "net_weight": 1.15, "cfop": "5101", "origin": "1 - Importado", "purchase_group": "002", "lead_time": 25, "mrp_type": "PD", "min_stock": 3.0, "max_stock": 25.0, "valuation_class": "3000", "standard_price": 218.00, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000011", "description": "ROLAMENTO AGULHAS HK2016 26MM ABERTO", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "NSK", "unit_of_measure": "UN", "ncm": "8482.10.10", "material_type": "Rolamento", "gross_weight": 0.15, "net_weight": 0.13, "cfop": "6102", "origin": "0 - Nacional", "purchase_group": "001", "lead_time": 9, "mrp_type": "VB", "min_stock": 25.0, "max_stock": 120.0, "valuation_class": "3000", "standard_price": 22.50, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000012", "description": "ROLAMENTO ESFERAS 6310-2RS 110MM VEDADO", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "FAG", "unit_of_measure": "UN", "ncm": "8482.10.10", "material_type": "Rolamento", "gross_weight": 2.15, "net_weight": 1.98, "cfop": "6102", "origin": "1 - Importado", "purchase_group": "002", "lead_time": 28, "mrp_type": "PD", "min_stock": 2.0, "max_stock": 15.0, "valuation_class": "3000", "standard_price": 285.00, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000013", "description": "ROLAMENTO AUTOCOMPENSADOR 2206 62MM ABERTO", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "SKF", "unit_of_measure": "UN", "ncm": "8482.30.00", "material_type": "Rolamento", "gross_weight": 0.68, "net_weight": 0.62, "cfop": "6102", "origin": "0 - Nacional", "purchase_group": "001", "lead_time": 16, "mrp_type": "PD", "min_stock": 5.0, "max_stock": 35.0, "valuation_class": "3000", "standard_price": 178.00, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000014", "description": "ROLAMENTO ROLOS CILINDRICOS NJ308 90MM ABERTO", "status": "Bloqueado", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "NSK", "unit_of_measure": "UN", "ncm": "8482.20.00", "material_type": "Rolamento", "gross_weight": 1.85, "net_weight": 1.70, "cfop": "6102", "origin": "1 - Importado", "purchase_group": "002", "lead_time": 35, "mrp_type": "ND", "min_stock": 0.0, "max_stock": 10.0, "valuation_class": "3000", "standard_price": 320.00, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000015", "description": "ROLAMENTO ESFERAS 6202-ZZ 35MM", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "FAG", "unit_of_measure": "UN", "ncm": "8482.10.10", "material_type": "Rolamento", "gross_weight": 0.22, "net_weight": 0.20, "cfop": "6102", "origin": "0 - Nacional", "purchase_group": "001", "lead_time": 11, "mrp_type": "PD", "min_stock": 12.0, "max_stock": 70.0, "valuation_class": "3000", "standard_price": 24.90, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000016", "description": "ROLAMENTO ROLOS CONICOS 32308 90MM VEDADO", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "SKF", "unit_of_measure": "UN", "ncm": "8482.20.00", "material_type": "Rolamento", "gross_weight": 1.95, "net_weight": 1.80, "cfop": "5101", "origin": "1 - Importado", "purchase_group": "002", "lead_time": 30, "mrp_type": "PD", "min_stock": 2.0, "max_stock": 18.0, "valuation_class": "3000", "standard_price": 398.00, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000017", "description": "ROLAMENTO ESFERAS 6300-ZZ 100MM", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "NSK", "unit_of_measure": "UN", "ncm": "8482.10.10", "material_type": "Rolamento", "gross_weight": 1.65, "net_weight": 1.52, "cfop": "6102", "origin": "0 - Nacional", "purchase_group": "001", "lead_time": 18, "mrp_type": "PD", "min_stock": 4.0, "max_stock": 22.0, "valuation_class": "3000", "standard_price": 165.00, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000018", "description": "ROLAMENTO AGULHAS K35x42x17 35MM", "status": "Obsoleto", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "FAG", "unit_of_measure": "UN", "ncm": "8482.10.10", "material_type": "Rolamento", "gross_weight": 0.28, "net_weight": 0.25, "cfop": "6102", "origin": "0 - Nacional", "purchase_group": "001", "lead_time": 10, "mrp_type": "ND", "min_stock": 0.0, "max_stock": 0.0, "valuation_class": "3000", "standard_price": 38.00, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000019", "description": "ROLAMENTO AUTOCOMPENSADOR 1306 72MM ABERTO", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "SKF", "unit_of_measure": "UN", "ncm": "8482.30.00", "material_type": "Rolamento", "gross_weight": 0.92, "net_weight": 0.85, "cfop": "6102", "origin": "1 - Importado", "purchase_group": "002", "lead_time": 22, "mrp_type": "PD", "min_stock": 3.0, "max_stock": 20.0, "valuation_class": "3000", "standard_price": 195.00, "profit_center": "PC-1000", "source": "manual"},
    {"id_erp": "10000020", "description": "ROLAMENTO ESFERAS 6210-2RS 100MM VEDADO", "status": "Ativo", "pdm_code": PDM_INTERNAL_CODE, "pdm_name": PDM_NAME,
     "material_group": "FAG", "unit_of_measure": "UN", "ncm": "8482.10.10", "material_type": "Rolamento", "gross_weight": 1.72, "net_weight": 1.58, "cfop": "6102", "origin": "0 - Nacional", "purchase_group": "001", "lead_time": 17, "mrp_type": "PD", "min_stock": 5.0, "max_stock": 28.0, "valuation_class": "3000", "standard_price": 248.00, "profit_center": "PC-1000", "source": "manual"},
]


def ensure_material_database(db, tenant_id: int) -> int:
    """Insere 20 materiais mockados de rolamentos se a tabela estiver vazia."""
    if db.query(MaterialDatabaseORM).filter(MaterialDatabaseORM.tenant_id == tenant_id).count() > 0:
        _skip("Material database")
        return 0
    for entry in _MATERIAL_DATABASE_ENTRIES:
        db.add(MaterialDatabaseORM(tenant_id=tenant_id, **entry))
    db.flush()
    _ok(f"{len(_MATERIAL_DATABASE_ENTRIES)} materiais inseridos na base de dados")
    return len(_MATERIAL_DATABASE_ENTRIES)


def ensure_field_dictionary(db, tenant_id: int) -> int:
    """Insere campos do dicionário ERP (ONBOARDING_FIELD_DICT) se a tabela estiver vazia."""
    if db.query(FieldDictionaryORM).filter(FieldDictionaryORM.tenant_id == tenant_id).count() > 0:
        _skip("Field dictionary")
        return 0
    for entry in ONBOARDING_FIELD_DICT:
        db.add(FieldDictionaryORM(tenant_id=tenant_id, **entry))
    db.flush()
    _ok(f"{len(ONBOARDING_FIELD_DICT)} campos do dicionário ERP inseridos")
    return len(ONBOARDING_FIELD_DICT)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("\n=== seed_data.py - MDM Platform ===\n")

    db = SessionLocal()
    try:
        print("0. Tenants")
        t1 = ensure_tenant(db, "Master Data Sistemas", "masterdata")
        t2 = ensure_tenant(db, "Empresa Demo", "empresa-demo")

        print("\n1. Tenant 1: roles, usuários, PDM, workflow, requests, field dict, materiais")
        set_tenant_in_session(db, t1.id, is_master=False)
        role_map1 = ensure_roles(db, t1.id)
        user_map1 = ensure_users(db, t1.id, role_map1, _TENANT1_CREDENTIALS)
        admin_user1 = user_map1.get("admin@masterdata.com")
        pdm = ensure_pdm(db, t1.id)
        workflow1 = ensure_workflow(db, t1.id)
        seed_requests(db, t1.id, pdm, workflow1, admin_user1 or user_map1["master@masterdata.com"])
        ensure_field_dictionary(db, t1.id)
        ensure_material_database(db, t1.id)

        print("\n2. Tenant 2: roles, usuários, workflow, field dict (sem PDM/materiais)")
        set_tenant_in_session(db, t2.id, is_master=False)
        role_map2 = ensure_roles(db, t2.id)
        ensure_users(db, t2.id, role_map2, _TENANT2_CREDENTIALS)
        ensure_workflow(db, t2.id)
        ensure_field_dictionary(db, t2.id)

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
