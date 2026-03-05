import logging
from dotenv import load_dotenv
load_dotenv()
# noqa: E402 — imports abaixo dependem das variáveis de ambiente carregadas acima
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from fastapi import Body, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from datetime import datetime, timezone, timedelta

from deps import get_admin_user, get_current_user, get_current_user_optional, get_db, get_user_with_standardize, get_user_with_bulk_import, get_user_with_view_database, get_user_with_edit_pdm
from orm_models import (
    ProductORM,
    PDMOrm,
    MaterialRequestORM,
    MaterialDatabaseORM,
    RequestValueORM,
    RequestHistoryORM,
    WorkflowConfigORM,
    WorkflowHeaderORM,
    RoleORM,
    UserORM,
    FieldDictionaryORM,
    NotificationORM,
    UserNotificationPrefsORM,
)
from audit import log_request_event, log_system_event
from bulk_import import (
    build_template_xlsx,
    build_export_xlsx,
    parse_and_validate_excel,
    _row_to_create_kwargs,
    _row_to_update_kwargs,
)
from bulk_import_pdm import (
    build_pdm_template_xlsx,
    build_pdm_export_xlsx,
    parse_and_validate_pdm_excel,
)
from notifications import notify_request_event
from security import hash_password
from slowapi.errors import RateLimitExceeded

from limiter import limiter


async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Handler customizado que adiciona o header Retry-After na resposta 429."""
    retry_after = getattr(exc, "retry_after", 60)
    return JSONResponse(
        status_code=429,
        content={"error": f"Rate limit exceeded: {exc.detail}"},
        headers={"Retry-After": str(retry_after)},
    )


app = FastAPI(title="MasterData API", version="1.8.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)


@app.exception_handler(IntegrityError)
def handle_integrity_error(_request, exc: IntegrityError):
    """Convert DB integrity errors to HTTP 400 with a safe message."""
    return JSONResponse(
        status_code=400,
        content={"detail": "Conflito de dados ou violação de restrição de integridade."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Seed ─────────────────────────────────────────────────────────────────────

# Default role definitions (role_type: "sistema" | "etapa")
_DEFAULT_ROLES: list[dict] = [
    {
        "name": "ADMIN",
        "role_type": "sistema",
        "permissions": {
            # Solicitações
            "can_approve": True,
            "can_reject": True,
            "can_submit_request": True,
            # PDM
            "can_view_pdm": True,
            "can_edit_pdm": True,
            # Workflows
            "can_view_workflows": True,
            "can_edit_workflows": True,
            # Administração
            "can_manage_users": True,
            "can_view_logs": True,
            "can_manage_fields": True,
            "can_view_database": True,
            "can_manage_roles": True,
            "can_standardize": True,
            "can_bulk_import": True,
        },
    },
    {
        "name": "SOLICITANTE",
        "role_type": "sistema",
        "permissions": {
            "can_approve": False,
            "can_reject": False,
            "can_submit_request": True,
            "can_view_pdm": True,
            "can_edit_pdm": False,
            "can_view_workflows": False,
            "can_edit_workflows": False,
            "can_manage_users": False,
            "can_view_logs": False,
            "can_manage_fields": False,
            "can_view_database": True,
            "can_manage_roles": False,
            "can_standardize": False,
            "can_bulk_import": False,
        },
    },
    {
        "name": "TRIAGEM",
        "role_type": "etapa",
        "permissions": {
            "can_approve": True,
            "can_reject": True,
            "can_submit_request": False,
            "can_view_pdm": True,
            "can_edit_pdm": False,
            "can_view_workflows": False,
            "can_edit_workflows": False,
            "can_manage_users": False,
            "can_view_logs": False,
            "can_manage_fields": False,
            "can_view_database": True,
            "can_manage_roles": False,
            "can_standardize": False,
            "can_bulk_import": False,
        },
    },
    {
        "name": "FISCAL",
        "role_type": "etapa",
        "permissions": {
            "can_approve": True,
            "can_reject": True,
            "can_submit_request": False,
            "can_view_pdm": False,
            "can_edit_pdm": False,
            "can_view_workflows": False,
            "can_edit_workflows": False,
            "can_manage_users": False,
            "can_view_logs": False,
            "can_manage_fields": False,
            "can_view_database": True,
            "can_manage_roles": False,
            "can_standardize": False,
            "can_bulk_import": False,
        },
    },
    {
        "name": "MASTER",
        "role_type": "etapa",
        "permissions": {
            "can_approve": True,
            "can_reject": True,
            "can_submit_request": True,
            "can_view_pdm": True,
            "can_edit_pdm": True,
            "can_view_workflows": True,
            "can_edit_workflows": True,
            "can_manage_users": True,
            "can_view_logs": True,
            "can_manage_fields": True,
            "can_view_database": True,
            "can_manage_roles": False,
            "can_standardize": True,
            "can_bulk_import": True,
        },
    },
    {
        "name": "MRP",
        "role_type": "etapa",
        "permissions": {
            "can_approve": True,
            "can_reject": True,
            "can_submit_request": False,
            "can_view_pdm": False,
            "can_edit_pdm": False,
            "can_view_workflows": False,
            "can_edit_workflows": False,
            "can_manage_users": False,
            "can_view_logs": False,
            "can_manage_fields": False,
            "can_view_database": True,
            "can_manage_roles": False,
            "can_standardize": False,
            "can_bulk_import": False,
        },
    },
]

_DEFAULT_USERS = [
    ("admin@masterdata.com", "Admin@1234", "ADMIN", "Administrador"),
    ("solicitante@masterdata.com", "Solicitante@1234", "SOLICITANTE", "Solicitante"),
    ("triagem@masterdata.com", "Triagem@1234", "TRIAGEM", "Usuário Triagem"),
    ("fiscal@masterdata.com", "Fiscal@1234", "FISCAL", "Usuário Fiscal"),
    ("master@masterdata.com", "Master@1234", "MASTER", "Usuário Master"),
    ("mrp@masterdata.com", "Mrp@1234", "MRP", "Usuário MRP"),
]


def seed_database(db: Session) -> None:
    """Populate roles and default users if the tables are empty."""
    if db.query(RoleORM).count() > 0:
        return  # already seeded

    role_map: dict[str, RoleORM] = {}
    for r in _DEFAULT_ROLES:
        orm = RoleORM(name=r["name"], role_type=r["role_type"], permissions=r["permissions"])
        db.add(orm)
        role_map[r["name"]] = orm
    db.flush()

    for email, password, role_name, display_name in _DEFAULT_USERS:
        role = role_map[role_name]
        u = UserORM(
            name=display_name,
            email=email,
            hashed_password=hash_password(password),
            role_id=role.id,
            is_active=True,
            preferences={"theme": "light", "language": "pt"},
            created_at=datetime.now(timezone.utc),
        )
        db.add(u)
    db.commit()
    print(
        f"[seed] Created {len(_DEFAULT_ROLES)} roles and {len(_DEFAULT_USERS)} users "
        f"(admin@masterdata.com / Admin@1234)"
    )


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/debug/tenant")
async def debug_tenant(
    request: Request,
    db: Session = Depends(get_db),
):
    """Endpoint temporário para debug do RLS."""
    result = db.execute(text(
        "SELECT current_setting('app.tenant_id', true) as tid, "
        "current_setting('app.is_master', true) as is_master"
    )).fetchone()

    count = db.execute(text(
        "SELECT COUNT(*) FROM material_database"
    )).scalar()

    auth = request.headers.get("Authorization", "none")
    return {
        "session_tenant_id": result[0] if result else None,
        "session_is_master": result[1] if result else None,
        "visible_materials": count,
        "auth_header": auth[:50] + "..." if len(auth) > 50 else auth,
    }


from models import (
    ProductCreate,
    PDMCreate,
    RequestCreate,
    RejectPayload,
    NotificationPrefsUpdate,
    AttributesPayload,
    StatusUpdatePayload,
    WorkflowConfigUpdate,
    WorkflowConfigCreate,
    WorkflowConfigStepUpdate,
    WorkflowConfigBulkUpdate,
    WorkflowMigratePayload,
    WorkflowUpdate,
    WorkflowHeaderCreate,
    MoveToPayload,
    FieldDictionaryCreate,
    FieldDictionaryUpdate,
    MaterialStandardizeBody,
    ErpIntegrateBody,
)

from routes.admin import router as admin_router
from routes.dashboard import router as dashboard_router
from routes.governance import router as governance_router
from routes.uploads import router as uploads_router
from orm_models import RequestAttachmentORM  # noqa: F401 — ensures table is registered

app.include_router(admin_router)
app.include_router(dashboard_router)
app.include_router(governance_router)
app.include_router(uploads_router)

# Serve uploaded files at  GET /uploads/<request_id>/<filename>
_UPLOADS_DIR = Path(__file__).parent / "uploads"
_UPLOADS_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_UPLOADS_DIR)), name="uploads")

# ─── Products ─────────────────────────────────────────────────────────────────
# CARREGAR PRODUTO
@app.get("/products")
def list_products(db: Session = Depends(get_db)):
    rows = db.query(ProductORM).order_by(ProductORM.name.asc()).all()
    return [{"id": r.id, "name": r.name, "description": r.description} for r in rows]

#-------------------------------
# CRIAR PRODUTO
@app.post("/products")
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    row = ProductORM(name=payload.name, description=payload.description)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "description": row.description}

# -------------------------------
# FIELD DICTIONARY (SAP MM01) — ADMIN only
def _field_to_dict(r: FieldDictionaryORM) -> dict:
    return {
        "id": r.id,
        "field_name": r.field_name,
        "field_label": r.field_label,
        "sap_field": r.sap_field,
        "sap_view": r.sap_view,
        "field_type": r.field_type,
        "options": r.options,
        "responsible_role": r.responsible_role,
        "is_required": r.is_required,
        "is_active": r.is_active,
        "display_order": r.display_order,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@app.get("/api/fields")
def list_fields(
    sap_view: str | None = Query(None, description="Filtrar por visão SAP"),
    db: Session = Depends(get_db),
    _: UserORM = Depends(get_admin_user),
):
    q = db.query(FieldDictionaryORM)
    if sap_view:
        q = q.filter(FieldDictionaryORM.sap_view == sap_view)
    rows = q.order_by(FieldDictionaryORM.sap_view, FieldDictionaryORM.display_order, FieldDictionaryORM.id).all()
    return [_field_to_dict(r) for r in rows]


@app.get("/api/fields/my-fields")
def list_my_fields(
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_current_user),
):
    """
    Returns fields where responsible_role matches current user's role (case-insensitive)
    and is_active is True. Ordered by display_order.
    """
    if not current_user.role or not current_user.role.name:
        return []
    role_name = current_user.role.name.strip()
    q = (
        db.query(FieldDictionaryORM)
        .filter(FieldDictionaryORM.is_active)
        .filter(func.lower(FieldDictionaryORM.responsible_role) == role_name.lower())
        .order_by(FieldDictionaryORM.display_order, FieldDictionaryORM.id)
    )
    rows = q.all()
    return [_field_to_dict(r) for r in rows]


@app.get("/api/fields/field-labels")
def list_field_labels(
    db: Session = Depends(get_db),
    _: UserORM = Depends(get_current_user),
):
    """
    Returns {field_name: field_label} for all active fields.
    Used for displaying Dados Preenchidos with proper labels.
    """
    rows = (
        db.query(FieldDictionaryORM)
        .filter(FieldDictionaryORM.is_active)
        .all()
    )
    return [{"field_name": r.field_name, "field_label": r.field_label} for r in rows]


@app.post("/api/fields", status_code=201)
def create_field(
    payload: FieldDictionaryCreate,
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_admin_user),
):
    row = FieldDictionaryORM(
        tenant_id=current_user.tenant_id,
        field_name=payload.field_name,
        field_label=payload.field_label,
        sap_field=payload.sap_field,
        sap_view=payload.sap_view,
        field_type=payload.field_type,
        options=payload.options,
        responsible_role=payload.responsible_role,
        is_required=payload.is_required,
        is_active=payload.is_active,
        display_order=payload.display_order,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    log_system_event(
        db, current_user.id, "fields", "field_created",
        f"Campo '{payload.field_label}' ({payload.field_name}) criado por {current_user.name}",
        current_user.tenant_id,
    )
    return _field_to_dict(row)


@app.get("/api/fields/{field_id}")
def get_field(
    field_id: int,
    db: Session = Depends(get_db),
    _: UserORM = Depends(get_admin_user),
):
    row = db.query(FieldDictionaryORM).filter(FieldDictionaryORM.id == field_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Campo não encontrado")
    return _field_to_dict(row)


@app.put("/api/fields/{field_id}")
def update_field(
    field_id: int,
    payload: FieldDictionaryUpdate,
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_admin_user),
):
    row = db.query(FieldDictionaryORM).filter(FieldDictionaryORM.id == field_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Campo não encontrado")
    if payload.field_name is not None:
        row.field_name = payload.field_name
    if payload.field_label is not None:
        row.field_label = payload.field_label
    if payload.sap_field is not None:
        row.sap_field = payload.sap_field
    if payload.sap_view is not None:
        row.sap_view = payload.sap_view
    if payload.field_type is not None:
        row.field_type = payload.field_type
    if payload.options is not None:
        row.options = payload.options
    if payload.responsible_role is not None:
        row.responsible_role = payload.responsible_role
    if payload.is_required is not None:
        row.is_required = payload.is_required
    if payload.is_active is not None:
        row.is_active = payload.is_active
    if payload.display_order is not None:
        row.display_order = payload.display_order
    db.commit()
    db.refresh(row)
    log_system_event(
        db, current_user.id, "fields", "field_updated",
        f"Campo #{field_id} ({row.field_label}) atualizado por {current_user.name}",
        current_user.tenant_id,
    )
    return _field_to_dict(row)


@app.delete("/api/fields/{field_id}")
def delete_field(
    field_id: int,
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_admin_user),
):
    row = db.query(FieldDictionaryORM).filter(FieldDictionaryORM.id == field_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Campo não encontrado")
    row.is_active = False
    db.commit()
    db.refresh(row)
    log_system_event(
        db, current_user.id, "fields", "field_deactivated",
        f"Campo #{field_id} ({row.field_label}) desativado por {current_user.name}",
        row.tenant_id,
    )
    return _field_to_dict(row)


# -------------------------------
# LISTAR PDMs
@app.get("/api/pdm")
def list_pdms(db: Session = Depends(get_db)):
    rows = db.query(PDMOrm).order_by(PDMOrm.name.asc()).all()
    counts = (
        db.query(MaterialDatabaseORM.pdm_code, func.count(MaterialDatabaseORM.id).label("cnt"))
        .group_by(MaterialDatabaseORM.pdm_code)
        .all()
    )
    count_map = {pdm_code: cnt for pdm_code, cnt in counts if pdm_code}
    return [
        {
            "id": r.id,
            "name": r.name,
            "internal_code": r.internal_code,
            "is_active": r.is_active,
            "attributes": r.attributes or [],
            "materials_count": count_map.get(r.internal_code, 0),
        }
        for r in rows
    ]


# -------------------------------
# PDM IMPORT/EXPORT
@app.get("/api/pdm/import-template")
def get_pdm_import_template(
    _: UserORM = Depends(get_user_with_bulk_import),
):
    buf = build_pdm_template_xlsx()
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=template_importacao_pdm.xlsx"},
    )


@app.post("/api/pdm/import")
async def import_pdm(
    file: UploadFile = File(..., description="Planilha Excel para importação"),
    dry_run: bool = Query(True, description="Se True, apenas valida sem gravar"),
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_user_with_bulk_import),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Arquivo deve ser planilha Excel (.xlsx)")
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao ler arquivo: {e}")

    try:
        result = parse_and_validate_pdm_excel(content, db)
    except Exception as e:
        logging.getLogger(__name__).exception("Erro ao processar Excel PDM")
        raise HTTPException(status_code=400, detail=f"Arquivo inválido ou corrompido: {e}")

    if "_error" in result:
        raise HTTPException(status_code=400, detail=result["_error"])

    if dry_run:
        return result

    pdm_data = result.get("pdm", {})
    attr_data = result.get("attributes", {})
    has_pdm_errors = any(r.get("status") == "error" for r in pdm_data.get("rows", []))
    has_attr_errors = any(r.get("status") == "error" for r in attr_data.get("rows", []))
    if has_pdm_errors or has_attr_errors:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Existem erros críticos nas linhas. Corrija e tente novamente.",
                "pdm": pdm_data,
                "attributes": attr_data,
            },
        )

    pdm_created = 0
    pdm_updated = 0
    attr_created = 0
    attr_updated = 0
    attr_deleted = 0

    pdm_by_code: dict[str, PDMOrm] = {r.internal_code: r for r in db.query(PDMOrm).all()}

    for row_info in pdm_data.get("rows", []):
        if row_info.get("status") == "error":
            continue
        op = row_info.get("operacao")
        data = row_info.get("data", {})
        pdm_code = str(data.get("pdm_code") or "").strip()
        nome = str(data.get("nome") or "").strip()
        ativo_str = str(data.get("ativo") or "Sim").strip()
        is_active = ativo_str.lower() in ("sim", "s", "1", "true")
        if op == "C":
            row = PDMOrm(
                name=nome or pdm_code,
                internal_code=pdm_code,
                is_active=is_active,
                attributes=[],
            )
            db.add(row)
            db.flush()
            pdm_by_code[pdm_code] = row
            pdm_created += 1
        elif op == "E":
            row = pdm_by_code.get(pdm_code)
            if row:
                # Atualizar apenas nome, ativo — pdm_code é chave e não pode ser alterado
                row.name = nome or row.name
                row.is_active = is_active
                db.flush()
                pdm_updated += 1

    db.commit()
    db.expire_all()
    pdm_by_code = {r.internal_code: r for r in db.query(PDMOrm).all()}

    def _parse_opcoes(s: str) -> list[dict]:
        if not s or not str(s).strip():
            return []
        return [{"value": v.strip(), "abbreviation": ""} for v in str(s).split(";") if v.strip()]

    def _map_tipo(t: str) -> str:
        t = (t or "text").lower()
        if t == "select":
            return "lov"
        if t == "number":
            return "numeric"
        return "text"

    attr_rows_by_pdm: dict[str, list] = {}
    for row_info in attr_data.get("rows", []):
        if row_info.get("status") == "error":
            continue
        pdm_code = str(row_info.get("pdm_code") or "").strip()
        if pdm_code not in attr_rows_by_pdm:
            attr_rows_by_pdm[pdm_code] = []
        attr_rows_by_pdm[pdm_code].append(row_info)

    for pdm_code, rows in attr_rows_by_pdm.items():
        row = pdm_by_code.get(pdm_code)
        if not row:
            continue
        attrs: list[dict] = list(row.attributes or [])
        attrs_by_key: dict[str, int] = {str(a.get("id", a.get("name", ""))): i for i, a in enumerate(attrs)}

        for row_info in rows:
            op = row_info.get("operacao")
            data = row_info.get("data", {})
            key = str(data.get("atributo_key") or "").strip()
            if not key:
                continue
            if op == "D":
                idx = attrs_by_key.get(key)
                if idx is not None:
                    attrs.pop(idx)
                    attrs_by_key = {str(a.get("id", a.get("name", ""))): i for i, a in enumerate(attrs)}
                    attr_deleted += 1
                continue
            label = str(data.get("label") or key).strip()
            tipo = _map_tipo(str(data.get("tipo") or "text"))
            obrig = str(data.get("obrigatorio") or "Não").strip().lower() in ("sim", "s")
            ordem = int(float(data.get("ordem") or 999)) if data.get("ordem") is not None else 999
            opcoes = _parse_opcoes(str(data.get("opcoes") or ""))

            attr_obj = {
                "id": key,
                "order": ordem,
                "name": label,
                "dataType": tipo,
                "isRequired": obrig,
                "includeInDescription": True,
                "abbreviation": "",
                "allowedValues": opcoes,
            }
            if op == "C":
                attrs.append(attr_obj)
                attr_created += 1
            elif op == "E":
                idx = attrs_by_key.get(key)
                if idx is not None:
                    # Atualizar apenas label, tipo, obrigatorio, ordem, opcoes — pdm_code e atributo_key não alteráveis
                    attrs[idx] = attr_obj
                    attr_updated += 1
                else:
                    attrs.append(attr_obj)
                    attr_created += 1
            attrs_by_key[key] = len(attrs) - 1

        row.attributes = attrs
        db.flush()

    db.commit()
    log_system_event(
        db,
        current_user.id,
        "pdm",
        "bulk_import",
        f"PDM: {pdm_created} criados, {pdm_updated} atualizados. Atributos: {attr_created} criados, {attr_updated} atualizados, {attr_deleted} deletados por {current_user.email}",
        current_user.tenant_id,
    )
    return {
        "dry_run": False,
        "pdm_created": pdm_created,
        "pdm_updated": pdm_updated,
        "attr_created": attr_created,
        "attr_updated": attr_updated,
        "attr_deleted": attr_deleted,
    }


@app.get("/api/pdm/export")
def export_pdm(
    db: Session = Depends(get_db),
    _: UserORM = Depends(get_user_with_edit_pdm),
):
    rows = db.query(PDMOrm).order_by(PDMOrm.name.asc()).all()
    pdms = [
        {"id": r.id, "name": r.name, "internal_code": r.internal_code, "is_active": r.is_active}
        for r in rows
    ]
    attrs_flat: list[dict] = []
    for r in rows:
        for a in (r.attributes or []):
            ao = dict(a) if isinstance(a, dict) else {}
            ao["pdm_code"] = r.internal_code
            attrs_flat.append(ao)
    buf = build_pdm_export_xlsx(pdms, attrs_flat)
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename = f"pdm_export_{today}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# -------------------------------
# CRIAR PDM
@app.post("/api/pdm")
def create_pdm(payload: PDMCreate, db: Session = Depends(get_db)):
    attributes_data = [a.model_dump() for a in payload.attributes]
    row = PDMOrm(
        name=payload.name,
        internal_code=payload.internal_code,
        is_active=payload.is_active,
        attributes=attributes_data,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "name": row.name,
        "internal_code": row.internal_code,
        "is_active": row.is_active,
        "attributes": row.attributes,
    }


# -------------------------------
# HELPERS
def _get_active_workflow_id(db: Session) -> int | None:
    row = db.query(WorkflowHeaderORM).filter(WorkflowHeaderORM.is_active).first()
    return row.id if row else None


def _get_first_step_status_key(workflow_id: int, db: Session) -> str:
    """Return the status_key of the first active step in the workflow."""
    first = (
        db.query(WorkflowConfigORM)
        .filter(
            WorkflowConfigORM.workflow_id == workflow_id,
            WorkflowConfigORM.is_active,
        )
        .order_by(WorkflowConfigORM.order.asc())
        .first()
    )
    return first.status_key if first else "Pending"


def _attr_id_to_name(pdm) -> dict:
    """Build attribute_id -> name lookup from PDM attributes JSON."""
    attrs = pdm.attributes if pdm else None
    if not isinstance(attrs, list):
        return {}
    return {str(a.get("id", "")): a.get("name", "") for a in attrs if isinstance(a, dict)}


def _attr_id_to_order(pdm) -> dict:
    """Build attribute_id -> order lookup so values are returned in field order."""
    attrs = pdm.attributes if pdm else None
    if not isinstance(attrs, list):
        return {}
    return {str(a.get("id", "")): a.get("order", 999) for a in attrs if isinstance(a, dict)}


def _request_to_dict(r) -> dict:
    """Serialize a MaterialRequestORM row to the full response dict.

    ``values`` is a list of ``{attribute_id, label, value}`` dicts sorted by
    the PDM-defined field order.  The ``attribute_id`` key lets the frontend
    pre-fill edit forms without having to re-fetch the PDM schema.
    """
    attr_names  = _attr_id_to_name(r.pdm)
    attr_orders = _attr_id_to_order(r.pdm)

    values = sorted(
        [
            {
                "attribute_id": rv.attribute_id,
                "label": attr_names.get(rv.attribute_id, rv.attribute_id),
                "value": rv.value,
            }
            for rv in (r.request_values or [])
        ],
        key=lambda v: attr_orders.get(v["attribute_id"], 999),
    )

    return {
        "id": r.id,
        "pdm_id": r.pdm_id,
        "pdm_name": r.pdm.name if r.pdm else None,
        "status": r.status,
        "workflow_id": r.workflow_id,
        "requester": r.requester,
        "cost_center": r.cost_center,
        "urgency": r.urgency,
        "justification": r.justification,
        "generated_description": r.generated_description,
        "technical_attributes": r.technical_attributes,
        "attachments": r.attachments,
        "date": r.created_at.isoformat() if r.created_at else None,
        "values": values,
        "assigned_to_id": r.assigned_to_id,
        "assigned_to_name": r.assigned_to.name if r.assigned_to else None,
    }


# -------------------------------
# LISTAR REQUISIÇÕES
@app.get("/api/requests")
def list_requests(
    workflow_id: int | None = Query(None, description="Filter by workflow (default: active)"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_optional),
):
    q = (
        db.query(MaterialRequestORM)
        .options(
            joinedload(MaterialRequestORM.pdm),
            joinedload(MaterialRequestORM.request_values),
            joinedload(MaterialRequestORM.assigned_to),
        )
        .order_by(MaterialRequestORM.created_at.desc())
    )
    wf_id = workflow_id or _get_active_workflow_id(db)
    if wf_id is not None:
        q = q.filter(MaterialRequestORM.workflow_id == wf_id)

    role_name = current_user.role.name.upper() if (current_user and current_user.role) else None
    role_type = current_user.role.role_type if (current_user and current_user.role) else None

    if role_name in ("ADMIN", "MASTER"):
        pass  # no filter — return all
    elif role_name == "SOLICITANTE" and current_user:
        q = q.filter(MaterialRequestORM.user_id == current_user.id)
    elif role_type == "etapa" and current_user and current_user.role and role_name:
        q = q.filter(func.lower(MaterialRequestORM.status) == role_name.lower())

    return [_request_to_dict(r) for r in q.all()]


# -------------------------------
# HISTÓRICO DA SOLICITAÇÃO
@app.get("/api/requests/{request_id}/history")
def get_request_history(
    request_id: int,
    db: Session = Depends(get_db),
    _: UserORM = Depends(get_current_user),
):
    """Retorna o histórico de eventos da solicitação, ordenado por data."""
    req = db.query(MaterialRequestORM).filter(MaterialRequestORM.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    rows = (
        db.query(RequestHistoryORM)
        .options(joinedload(RequestHistoryORM.user))
        .filter(RequestHistoryORM.request_id == request_id)
        .order_by(RequestHistoryORM.created_at.asc())
        .all()
    )
    return [
        {
            "id": r.id,
            "event_type": r.event_type,
            "message": r.message,
            "event_data": r.event_data,
            "stage": r.stage,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "user_name": r.user.name if r.user else None,
        }
        for r in rows
    ]


# -------------------------------
# INICIAR ATENDIMENTO (atribui a solicitação ao usuário logado)
@app.patch("/api/requests/{request_id}/assign")
def assign_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_current_user),
):
    """
    Atribui a solicitação ao usuário logado. Bloqueia concorrência: se já estiver
    atribuída a outro usuário, retorna 409.
    """
    row = (
        db.query(MaterialRequestORM)
        .options(
            joinedload(MaterialRequestORM.pdm),
            joinedload(MaterialRequestORM.request_values),
            joinedload(MaterialRequestORM.assigned_to),
        )
        .filter(MaterialRequestORM.id == request_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")

    if row.assigned_to_id is not None and row.assigned_to_id != current_user.id:
        assignee_name = row.assigned_to.name if row.assigned_to else "outro usuário"
        raise HTTPException(
            status_code=409,
            detail=f"Solicitação já está sendo atendida por {assignee_name}",
        )

    row.assigned_to_id = current_user.id
    row.assigned_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    log_request_event(
        db, row.id, current_user.id, "assigned",
        f"Atendimento iniciado por {current_user.name}",
        row.tenant_id,
        stage=row.status,
    )
    log_system_event(
        db, current_user.id, "requests", "request_assigned",
        f"Solicitação #{row.id} atribuída a {current_user.name}",
        row.tenant_id,
    )
    try:
        notify_request_event(db, "request_assigned", row, current_user, stage=row.status)
    except Exception as e:
        print(f"[WARN] notify_request_event falhou (não crítico): {e}")
    return _request_to_dict(row)


# -------------------------------
# ATUALIZAR ATRIBUTOS TÉCNICOS (merge)
@app.patch("/api/requests/{request_id}/attributes")
def update_request_attributes(
    request_id: int,
    payload: AttributesPayload,
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_current_user),
):
    """
    Merge payload.attributes into request.technical_attributes.
    Only the assigned user (assigned_to_id == current_user.id) can save.
    """
    row = (
        db.query(MaterialRequestORM)
        .options(
            joinedload(MaterialRequestORM.pdm),
            joinedload(MaterialRequestORM.request_values),
            joinedload(MaterialRequestORM.assigned_to),
        )
        .filter(MaterialRequestORM.id == request_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada")
    if row.assigned_to_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Apenas o atendente atribuído pode salvar os campos.",
        )
    previous_attributes = dict(row.technical_attributes or {})
    new_attributes = payload.attributes or {}
    merged = dict(previous_attributes)
    for k, v in new_attributes.items():
        if v is not None and v != "":
            merged[k] = str(v)
        elif k in merged:
            del merged[k]
    row.technical_attributes = merged if merged else None
    db.commit()
    db.refresh(row)

    fields_changed = {}
    for field_name, new_value in new_attributes.items():
        old_value = previous_attributes.get(field_name)
        if str(old_value or "") == str(new_value or ""):
            continue
        field_def = (
            db.query(FieldDictionaryORM)
            .filter(
                FieldDictionaryORM.field_name == field_name,
                FieldDictionaryORM.is_active,
            )
            .first()
        )
        label = field_def.field_label if field_def else field_name
        fields_changed[label] = {
            "de": old_value if old_value is not None else "—",
            "para": new_value if new_value is not None else "—",
        }
    if fields_changed:
        log_request_event(
            db, row.id, current_user.id, "fields_saved",
            f"Campos atualizados por {current_user.name}",
            row.tenant_id,
            event_data={"fields_changed": fields_changed},
            stage=row.status,
        )
        log_system_event(
            db, current_user.id, "requests", "request_fields_saved",
            f"Campos da solicitação #{row.id} salvos por {current_user.name}",
            row.tenant_id,
            event_data={"fields_changed": fields_changed},
        )
    return _request_to_dict(row)


# -------------------------------
# CRIAR REQUISIÇÃO DE MATERIAL
@app.post("/api/requests")
def create_request(
    payload: RequestCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_optional),
):
    # Validate PDM exists
    pdm = db.query(PDMOrm).filter(PDMOrm.id == payload.pdm_id).first()
    if not pdm:
        raise HTTPException(status_code=404, detail="PDM not found")

    # Resolve workflow — explicit or active
    wf_id = payload.workflow_id or _get_active_workflow_id(db)
    if not wf_id:
        raise HTTPException(status_code=400, detail="No active workflow configured")

    # Initial status = first step of the workflow (not a hardcoded "Pending")
    initial_status = _get_first_step_status_key(wf_id, db)

    # Build generated description if not supplied by client
    generated_description = payload.generated_description
    if not generated_description and pdm.attributes:
        parts = [pdm.name.upper()]
        for attr in sorted(pdm.attributes, key=lambda a: a.get("order", 0)):
            attr_id = str(attr.get("id", ""))
            if not attr.get("includeInDescription"):
                continue
            val = payload.values.get(attr_id, "")
            if val:
                # Use LOV abbreviation if available
                lov_abbr = next(
                    (
                        av.get("abbreviation", "")
                        for av in (attr.get("allowedValues") or [])
                        if av.get("value") == val and av.get("abbreviation")
                    ),
                    None,
                )
                parts.append((lov_abbr or val).upper())
            else:
                parts.append(f"[{attr.get('abbreviation', attr_id)}]")
        generated_description = " ".join(parts)

    tenant_id = pdm.tenant_id
    row = MaterialRequestORM(
        tenant_id=tenant_id,
        pdm_id=payload.pdm_id,
        workflow_id=wf_id,
        status=initial_status,
        requester=payload.requester,
        cost_center=payload.cost_center,
        urgency=payload.urgency,
        justification=payload.justificativa,
        generated_description=generated_description,
        user_id=current_user.id if current_user else None,
        # Store full attribute dict for quick access without joining request_values
        technical_attributes=payload.values,
        attachments=payload.attachments or [],
    )
    db.add(row)
    db.flush()

    # Also persist individual attribute values in request_values for backwards compat
    for attribute_id, value in payload.values.items():
        db.add(RequestValueORM(
            request_id=row.id,
            attribute_id=attribute_id,
            value=str(value),
        ))

    db.commit()
    db.refresh(row)

    requester_name = current_user.name if current_user else payload.requester
    log_request_event(
        db, row.id, current_user.id if current_user else None, "created",
        f"Solicitação criada por {requester_name}",
        tenant_id,
        stage=initial_status,
    )
    log_system_event(
        db, current_user.id if current_user else None, "requests", "request_created",
        f"Solicitação #{row.id} criada por {requester_name}",
        tenant_id,
    )
    try:
        notify_request_event(db, "request_created", row, current_user)
    except Exception as e:
        print(f"[WARN] notify_request_event falhou (não crítico): {e}")

    # Eager-load relationships for the response
    row = (
        db.query(MaterialRequestORM)
        .options(
            joinedload(MaterialRequestORM.pdm),
            joinedload(MaterialRequestORM.request_values),
            joinedload(MaterialRequestORM.assigned_to),
        )
        .filter(MaterialRequestORM.id == row.id)
        .one()
    )
    return _request_to_dict(row)


# -------------------------------
# PRÓXIMO STATUS (avança um passo no fluxo) – dinâmico via WorkflowConfig
def get_next_status(current_status: str, workflow_id: int, db: Session) -> str | None:
    """
    Return the next status_key in the workflow, or None if already at the end.
    Uses WorkflowConfig table for dynamic step order, scoped to workflow_id.
    - Pending (initial) → first step's status_key
    - Current status must match exactly a status_key in workflow (or step_name for legacy)
    - Last step → 'completed'
    - completed/Rejected → None
    """
    current = (current_status or "").strip()
    if not current:
        current = "Pending"

    # Terminal statuses (incl. synonyms in PT/EN)
    if current.lower() in ("completed", "approved", "concluído", "finalizado", "rejected"):
        return None

    rows = (
        db.query(WorkflowConfigORM)
        .filter(
            WorkflowConfigORM.workflow_id == workflow_id,
            WorkflowConfigORM.is_active,
        )
        .order_by(WorkflowConfigORM.order.asc())
        .all()
    )
    if not rows:
        return None

    # Pending (initial): advance to first workflow step
    if current.lower() == "pending":
        return rows[0].status_key

    # Find current step: prefer exact status_key match, then step_name (case-insensitive)
    current_idx = None
    for i, r in enumerate(rows):
        if r.status_key and r.status_key.strip().lower() == current.strip().lower():
            current_idx = i
            break
        if r.step_name and r.step_name.strip().lower() == current.strip().lower():
            current_idx = i
            break

    if current_idx is None:
        return None

    # Next step
    if current_idx + 1 < len(rows):
        return rows[current_idx + 1].status_key
    # Last step → completed
    return "completed"


# -------------------------------
# ATUALIZAR STATUS DA REQUISIÇÃO (avança para próximo passo - action=approve)
@app.patch("/api/requests/{request_id}/status")
def update_request_status(
    request_id: int,
    payload: StatusUpdatePayload | None = Body(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_optional),
):
    row = (
        db.query(MaterialRequestORM)
        .options(
            joinedload(MaterialRequestORM.pdm),
            joinedload(MaterialRequestORM.request_values),
            joinedload(MaterialRequestORM.assigned_to),
        )
        .filter(MaterialRequestORM.id == request_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")

    # Immediately calculate next status from WorkflowConfig (request's workflow) and persist
    next_status = get_next_status(row.status, row.workflow_id, db)
    if next_status is None:
        raise HTTPException(
            status_code=400,
            detail=f"Request already at final status: {row.status}",
        )
    from_status = row.status
    row.status = next_status
    db.commit()
    db.refresh(row)

    next_step = (
        db.query(WorkflowConfigORM)
        .filter(
            WorkflowConfigORM.workflow_id == row.workflow_id,
            WorkflowConfigORM.status_key == next_status,
        )
        .first()
    )
    next_step_label = next_step.step_name if next_step else next_status
    approver_name = current_user.name if current_user else "Sistema"
    log_request_event(
        db, row.id, current_user.id if current_user else None, "approved",
        f"Aprovado por {approver_name} — avançou para {next_step_label}",
        row.tenant_id,
        event_data={"from_stage": from_status, "to_stage": next_status},
        stage=next_status,
    )
    log_system_event(
        db, current_user.id if current_user else None, "requests", "request_approved",
        f"Solicitação #{row.id} aprovada por {approver_name}",
        row.tenant_id,
        event_data={"from_stage": from_status, "to_stage": next_status},
    )
    try:
        event_type = "request_completed" if next_status == "completed" else "request_approved"
        notify_request_event(db, event_type, row, current_user, stage=next_step_label)
    except Exception as e:
        print(f"[WARN] notify_request_event falhou (não crítico): {e}")
    return _request_to_dict(row)


# -------------------------------
# REJEITAR REQUISIÇÃO
@app.patch("/api/requests/{request_id}/reject")
def reject_request(
    request_id: int,
    payload: RejectPayload | None = Body(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_optional),
):
    row = (
        db.query(MaterialRequestORM)
        .options(
            joinedload(MaterialRequestORM.pdm),
            joinedload(MaterialRequestORM.request_values),
            joinedload(MaterialRequestORM.assigned_to),
        )
        .filter(MaterialRequestORM.id == request_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")
    row.status = "Rejected"
    db.commit()
    db.refresh(row)

    justification = (payload.justification or "") if payload else ""
    rejector_name = current_user.name if current_user else "Sistema"
    log_request_event(
        db, row.id, current_user.id if current_user else None, "rejected",
        f"Rejeitado por {rejector_name}",
        row.tenant_id,
        event_data={"justification": justification},
        stage="Rejected",
    )
    log_system_event(
        db, current_user.id if current_user else None, "requests", "request_rejected",
        f"Solicitação #{row.id} rejeitada por {rejector_name}",
        row.tenant_id,
        event_data={"justification": justification},
    )
    try:
        notify_request_event(db, "request_rejected", row, current_user, justification=justification)
    except Exception as e:
        print(f"[WARN] notify_request_event falhou (não crítico): {e}")
    return _request_to_dict(row)


# -------------------------------
# MOVER REQUISIÇÃO PARA STATUS ARBITRÁRIO (drag-and-drop)
@app.patch("/api/requests/{request_id}/move-to")
def move_request_to_status(
    request_id: int,
    payload: MoveToPayload,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_optional),
):
    """
    Set the request status to any valid status_key that belongs to its workflow.
    Used by the Kanban drag-and-drop to move cards between columns.
    """
    row = (
        db.query(MaterialRequestORM)
        .options(
            joinedload(MaterialRequestORM.pdm),
            joinedload(MaterialRequestORM.request_values),
            joinedload(MaterialRequestORM.assigned_to),
        )
        .filter(MaterialRequestORM.id == request_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Request not found")

    # Validate that the target status_key exists in the request's workflow
    valid_keys = {
        s.status_key
        for s in db.query(WorkflowConfigORM)
        .filter(WorkflowConfigORM.workflow_id == row.workflow_id)
        .all()
    }
    if payload.status_key not in valid_keys:
        raise HTTPException(
            status_code=400,
            detail=f"'{payload.status_key}' is not a valid status for workflow {row.workflow_id}",
        )

    from_status = row.status
    row.status = payload.status_key
    db.commit()
    db.refresh(row)
    mover_name = current_user.name if current_user else "Sistema"
    log_request_event(
        db, row.id, current_user.id if current_user else None, "status_changed",
        f"Status alterado por {mover_name}: {from_status} → {payload.status_key}",
        row.tenant_id,
        event_data={"from_stage": from_status, "to_stage": payload.status_key},
        stage=payload.status_key,
    )
    log_system_event(
        db, current_user.id if current_user else None, "requests", "request_status_changed",
        f"Solicitação #{row.id} movida por {mover_name} para {payload.status_key}",
        row.tenant_id,
        event_data={"from_stage": from_status, "to_stage": payload.status_key},
    )
    return _request_to_dict(row)


# -------------------------------
# WORKFLOW HEADERS
def _workflow_header_to_dict(h):
    return {
        "id": h.id,
        "name": h.name,
        "description": h.description,
        "is_active": h.is_active,
    }


@app.get("/api/workflows")
def list_workflows(db: Session = Depends(get_db)):
    rows = db.query(WorkflowHeaderORM).order_by(WorkflowHeaderORM.id.asc()).all()
    return [_workflow_header_to_dict(h) for h in rows]


@app.post("/api/workflows")
def create_workflow(payload: WorkflowHeaderCreate, db: Session = Depends(get_db)):
    row = WorkflowHeaderORM(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        is_active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _workflow_header_to_dict(row)


@app.get("/api/workflows/{workflow_id}/migration-info")
def get_workflow_migration_info(
    workflow_id: int,
    db: Session = Depends(get_db),
):
    """Returns steps that have requests, with counts. Used for migration UI."""
    wf = db.query(WorkflowHeaderORM).filter(WorkflowHeaderORM.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    steps = (
        db.query(WorkflowConfigORM)
        .filter(WorkflowConfigORM.workflow_id == workflow_id)
        .order_by(WorkflowConfigORM.order.asc())
        .all()
    )
    result = []
    for step in steps:
        count = (
            db.query(MaterialRequestORM)
            .filter(
                MaterialRequestORM.workflow_id == workflow_id,
                or_(
                    MaterialRequestORM.status == step.status_key,
                    MaterialRequestORM.status == step.step_name,
                ),
            )
            .count()
        )
        if count > 0:
            result.append(
                {"step_name": step.step_name, "status_key": step.status_key, "request_count": count}
            )
    return {"workflow_name": wf.name, "steps_with_requests": result}


@app.post("/api/workflows/migrate")
def migrate_workflow_requests(
    payload: WorkflowMigratePayload,
    db: Session = Depends(get_db),
):
    """
    Migrate requests from one workflow to another with step mapping.
    Updates workflow_id and status for each matched request.
    """
    from_wf = db.query(WorkflowHeaderORM).filter(WorkflowHeaderORM.id == payload.from_workflow_id).first()
    to_wf = db.query(WorkflowHeaderORM).filter(WorkflowHeaderORM.id == payload.to_workflow_id).first()
    if not from_wf or not to_wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if payload.from_workflow_id == payload.to_workflow_id:
        raise HTTPException(status_code=400, detail="Source and target workflow must differ")
    from_steps_map = {
        s.status_key: (s.status_key, s.step_name)
        for s in db.query(WorkflowConfigORM)
        .filter(WorkflowConfigORM.workflow_id == payload.from_workflow_id)
        .all()
    }
    migrated = 0
    for m in payload.mappings:
        to_key = m.to_status_key
        status_key, step_name = from_steps_map.get(
            m.from_status_key, (m.from_status_key, m.from_status_key)
        )
        values_to_match = [v for v in (status_key, step_name) if v]
        if not values_to_match:
            values_to_match = [m.from_status_key]
        rows = (
            db.query(MaterialRequestORM)
            .filter(
                MaterialRequestORM.workflow_id == payload.from_workflow_id,
                MaterialRequestORM.status.in_(values_to_match),
            )
            .all()
        )
        for row in rows:
            row.workflow_id = payload.to_workflow_id
            row.status = to_key
            migrated += 1
    db.commit()
    return {"migrated_count": migrated}


@app.patch("/api/workflows/{workflow_id}")
def update_workflow(
    workflow_id: int,
    payload: WorkflowUpdate,
    db: Session = Depends(get_db),
):
    row = db.query(WorkflowHeaderORM).filter(WorkflowHeaderORM.id == workflow_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if payload.is_active is False:
        count = db.query(MaterialRequestORM).filter(MaterialRequestORM.workflow_id == workflow_id).count()
        if count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Não é possível arquivar: existem {count} requisições neste workflow. Execute a migração primeiro.",
            )
    if payload.is_active is not None:
        row.is_active = payload.is_active
        if payload.is_active is True:
            db.query(WorkflowHeaderORM).filter(
                WorkflowHeaderORM.id != workflow_id
            ).update({WorkflowHeaderORM.is_active: False})
    db.commit()
    db.refresh(row)
    return _workflow_header_to_dict(row)


# -------------------------------
# WORKFLOW CONFIG (steps)
def _workflow_row_to_dict(r):
    return {
        "id": r.id,
        "workflow_id": r.workflow_id,
        "step_name": r.step_name,
        "status_key": r.status_key,
        "order": r.order,
        "is_active": r.is_active,
    }


@app.get("/api/workflow/config")
def get_workflow_config(
    workflow_id: int | None = Query(None, description="Workflow to fetch (default: active)"),
    db: Session = Depends(get_db),
):
    wf_id = workflow_id or _get_active_workflow_id(db)
    if not wf_id:
        return []
    rows = (
        db.query(WorkflowConfigORM)
        .filter(WorkflowConfigORM.workflow_id == wf_id)
        .order_by(WorkflowConfigORM.order.asc())
        .all()
    )
    return [_workflow_row_to_dict(r) for r in rows]


def _slugify_status_key(name: str) -> str:
    """Generate status_key from step_name: 'Aprovação Fiscal' -> 'aprovacao_fiscal'"""
    import unicodedata
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().strip().replace(" ", "_").replace("-", "_")
    return "".join(c if c.isalnum() or c == "_" else "_" for c in s) or "step"


@app.post("/api/workflow/config")
def add_workflow_step(payload: WorkflowConfigCreate, db: Session = Depends(get_db)):
    wf_id = payload.workflow_id or _get_active_workflow_id(db)
    if not wf_id:
        raise HTTPException(
            status_code=400,
            detail="Nenhum workflow ativo. Configure um workflow ativo ou informe workflow_id.",
        )
    status_key = payload.status_key or _slugify_status_key(payload.step_name)
    rows = (
        db.query(WorkflowConfigORM)
        .filter(WorkflowConfigORM.workflow_id == wf_id)
        .order_by(WorkflowConfigORM.order.asc())
        .all()
    )
    insert_order = len(rows) + 1
    if payload.insert_after_id is not None:
        if payload.insert_after_id == 0:
            insert_order = 1
        else:
            after = next((r for r in rows if r.id == payload.insert_after_id), None)
            insert_order = (after.order + 1) if after else len(rows) + 1
        for r in reversed(rows):
            if r.order >= insert_order:
                r.order = r.order + 1
    row = WorkflowConfigORM(
        workflow_id=wf_id,
        step_name=payload.step_name,
        status_key=status_key,
        order=insert_order,
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _workflow_row_to_dict(row)


@app.patch("/api/workflow/config/{step_id}")
def update_workflow_step(
    step_id: int, payload: WorkflowConfigStepUpdate, db: Session = Depends(get_db)
):
    row = db.query(WorkflowConfigORM).filter(WorkflowConfigORM.id == step_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Step not found")
    if payload.step_name is not None:
        row.step_name = payload.step_name
    if payload.status_key is not None:
        row.status_key = payload.status_key
    db.commit()
    db.refresh(row)
    return _workflow_row_to_dict(row)


@app.delete("/api/workflow/config/{step_id}")
def delete_workflow_step(step_id: int, db: Session = Depends(get_db)):
    row = db.query(WorkflowConfigORM).filter(WorkflowConfigORM.id == step_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Step not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@app.put("/api/workflow/config")
def update_workflow_config(payload: WorkflowConfigUpdate, db: Session = Depends(get_db)):
    for item in payload.steps:
        row = db.query(WorkflowConfigORM).filter(WorkflowConfigORM.id == item.id).first()
        if row:
            row.order = item.order
    db.commit()
    rows = (
        db.query(WorkflowConfigORM)
        .order_by(WorkflowConfigORM.order.asc())
        .all()
    )
    return [_workflow_row_to_dict(r) for r in rows]


@app.put("/api/workflow/config/bulk")
def bulk_update_workflow_config(
    payload: WorkflowConfigBulkUpdate, db: Session = Depends(get_db)
):
    """
    Replace workflow config with the provided list for the given workflow_id.
    In a single transaction: delete all current steps for that workflow and insert the new list.
    Safety: blocks delete if any request in this workflow has the step's status_key.
    """
    incoming_status_keys = {
        (item.status_key or _slugify_status_key(item.step_name))
        for item in payload.steps
    }
    current_steps = (
        db.query(WorkflowConfigORM)
        .filter(WorkflowConfigORM.workflow_id == payload.workflow_id)
        .all()
    )
    steps_being_deleted = [s for s in current_steps if s.status_key not in incoming_status_keys]

    for step in steps_being_deleted:
        count = (
            db.query(MaterialRequestORM)
            .filter(
                MaterialRequestORM.workflow_id == payload.workflow_id,
                or_(
                    MaterialRequestORM.status == step.status_key,
                    MaterialRequestORM.status == step.step_name,
                ),
            )
            .count()
        )
        if count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Não é possível excluir esta etapa pois existem {count} requisições nela.",
            )

    try:
        db.query(WorkflowConfigORM).filter(
            WorkflowConfigORM.workflow_id == payload.workflow_id
        ).delete()
        for item in payload.steps:
            status_key = item.status_key or _slugify_status_key(item.step_name)
            row = WorkflowConfigORM(
                workflow_id=payload.workflow_id,
                step_name=item.step_name,
                status_key=status_key,
                order=item.order,
                is_active=item.is_active,
            )
            db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        raise
    rows = (
        db.query(WorkflowConfigORM)
        .filter(WorkflowConfigORM.workflow_id == payload.workflow_id)
        .order_by(WorkflowConfigORM.order.asc())
        .all()
    )
    return [_workflow_row_to_dict(r) for r in rows]


# -------------------------------
# OBTER ATRIBUTOS DO PDM
@app.get("/api/pdm/{pdm_id}")
def get_pdm(pdm_id: int, db: Session = Depends(get_db)):
    """Return a single PDM template together with its full attribute list."""
    row = db.query(PDMOrm).filter(PDMOrm.id == pdm_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="PDM not found")
    return {
        "id": row.id,
        "name": row.name,
        "internal_code": row.internal_code,
        "is_active": row.is_active,
        "attributes": row.attributes or [],
    }


@app.get("/api/pdm/{pdm_id}/attributes")
def get_pdm_attributes(pdm_id: int, db: Session = Depends(get_db)):
    row = db.query(PDMOrm).filter(PDMOrm.id == pdm_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="PDM not found")
    return row.attributes or []


# -------------------------------
# ATUALIZAR PDM
@app.put("/api/pdm/{pdm_id}")
def update_pdm(
    pdm_id: int, payload: PDMCreate, db: Session = Depends(get_db)
):
    row = db.query(PDMOrm).filter(PDMOrm.id == pdm_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="PDM not found")
    attributes_data = [a.model_dump() for a in payload.attributes]
    row.name = payload.name
    row.internal_code = payload.internal_code
    row.is_active = payload.is_active
    row.attributes = attributes_data
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "name": row.name,
        "internal_code": row.internal_code,
        "is_active": row.is_active,
        "attributes": row.attributes,
    }


# -------------------------------
# BASE DE DADOS DE MATERIAIS
def _material_db_to_dict(row: MaterialDatabaseORM) -> dict:
    return {
        "id": row.id,
        "sap_code": row.sap_code,
        "description": row.description,
        "status": row.status,
        "pdm_code": row.pdm_code,
        "pdm_name": row.pdm_name,
        "material_group": row.material_group,
        "unit_of_measure": row.unit_of_measure,
        "ncm": row.ncm,
        "material_type": row.material_type,
        "gross_weight": row.gross_weight,
        "net_weight": row.net_weight,
        "cfop": row.cfop,
        "origin": row.origin,
        "purchase_group": row.purchase_group,
        "lead_time": row.lead_time,
        "mrp_type": row.mrp_type,
        "min_stock": row.min_stock,
        "max_stock": row.max_stock,
        "valuation_class": row.valuation_class,
        "standard_price": row.standard_price,
        "profit_center": row.profit_center,
        "source": row.source,
        "erp_status": row.erp_status,
        "erp_integrated_at": row.erp_integrated_at.isoformat() if row.erp_integrated_at else None,
        "standardized_at": row.standardized_at.isoformat() if row.standardized_at else None,
        "standardized_by": row.standardized_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@app.get("/api/database/materials")
def list_material_database(
    q: str | None = Query(None, description="Busca por descrição ou sap_code"),
    status: str | None = Query(None, description="Filtrar por status: Ativo|Bloqueado|Obsoleto"),
    pdm_code: str | None = Query(None, description="Filtrar por pdm_code"),
    erp_status: str | None = Query(None, description="Filtrar por erp_status: pendente_erp|integrado"),
    date_from: str | None = Query(None, description="Filtrar por data de criação (YYYY-MM-DD)"),
    date_to: str | None = Query(None, description="Filtrar por data de criação até (YYYY-MM-DD)"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: UserORM = Depends(get_current_user),
):
    """Lista materiais da base com paginação e filtros."""
    query = db.query(MaterialDatabaseORM)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                MaterialDatabaseORM.description.ilike(term),
                MaterialDatabaseORM.sap_code.ilike(term),
            )
        )
    if status:
        query = query.filter(MaterialDatabaseORM.status == status)
    if pdm_code:
        query = query.filter(MaterialDatabaseORM.pdm_code == pdm_code)
    if erp_status:
        query = query.filter(MaterialDatabaseORM.erp_status == erp_status)
    if date_from:
        try:
            dt_from = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            query = query.filter(MaterialDatabaseORM.created_at >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.strptime(date_to, "%Y-%m-%d")
            dt_until = (dt_to + timedelta(days=1)).replace(tzinfo=timezone.utc)
            query = query.filter(MaterialDatabaseORM.created_at < dt_until)
        except ValueError:
            pass
    query = query.order_by(MaterialDatabaseORM.description.asc())
    total = query.count()
    offset = (page - 1) * limit
    rows = query.offset(offset).limit(limit).all()
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [_material_db_to_dict(r) for r in rows],
    }


@app.get("/api/database/materials/search")
def search_material_database(
    q: str = Query(..., description="Termo de busca"),
    db: Session = Depends(get_db),
    _: UserORM = Depends(get_current_user),
):
    """Busca simplificada — retorna top 10 por descrição ou sap_code."""
    term = f"%{q.strip()}%"
    rows = (
        db.query(MaterialDatabaseORM)
        .filter(
            or_(
                MaterialDatabaseORM.description.ilike(term),
                MaterialDatabaseORM.sap_code.ilike(term),
            )
        )
        .order_by(MaterialDatabaseORM.description.asc())
        .limit(10)
        .all()
    )
    return [_material_db_to_dict(r) for r in rows]


@app.post("/api/database/materials/erp-integrate")
def erp_integrate_materials(
    payload: ErpIntegrateBody,
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_user_with_standardize),
):
    """
    Integra materiais com ERP (em massa). Simula chamada ERP e marca como integrado.
    """
    integrated: list[int] = []
    skipped: list[int] = []
    for mid in payload.material_ids:
        row = db.query(MaterialDatabaseORM).filter(MaterialDatabaseORM.id == mid).first()
        if not row:
            skipped.append(mid)
            continue
        if row.erp_status == "integrado":
            skipped.append(mid)
            continue
        if row.erp_status != "pendente_erp":
            skipped.append(mid)
            continue
        # Simular chamada ERP (apenas log)
        logging.getLogger(__name__).info("ERP integrate simulated for material_id=%s", mid)
        row.erp_status = "integrado"
        row.erp_integrated_at = datetime.now(timezone.utc)
        integrated.append(mid)
    db.commit()
    material_ids_str = ", ".join(str(i) for i in integrated)
    log_system_event(
        db,
        current_user.id,
        "erp",
        "integrate",
        f"{len(integrated)} materiais integrados por {current_user.email}: IDs {material_ids_str}",
        current_user.tenant_id,
    )
    return {"integrated": integrated, "skipped": skipped, "total": len(integrated)}


@app.get("/api/database/materials/export")
def export_materials(
    q: str | None = Query(None, description="Busca por descrição ou sap_code"),
    status: str | None = Query(None, description="Filtrar por status: Ativo|Bloqueado|Obsoleto"),
    pdm_code: str | None = Query(None, description="Filtrar por pdm_code"),
    erp_status: str | None = Query(None, description="Filtrar por erp_status: pendente_erp|integrado"),
    date_from: str | None = Query(None, description="Data de criação a partir de (YYYY-MM-DD)"),
    date_to: str | None = Query(None, description="Data de criação até (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    _: UserORM = Depends(get_user_with_view_database),
):
    """Exporta materiais filtrados para Excel. Sem paginação."""
    query = db.query(MaterialDatabaseORM)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                MaterialDatabaseORM.description.ilike(term),
                MaterialDatabaseORM.sap_code.ilike(term),
            )
        )
    if status:
        query = query.filter(MaterialDatabaseORM.status == status)
    if pdm_code:
        query = query.filter(MaterialDatabaseORM.pdm_code == pdm_code)
    if erp_status:
        query = query.filter(MaterialDatabaseORM.erp_status == erp_status)
    if date_from:
        try:
            dt_from = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            query = query.filter(MaterialDatabaseORM.created_at >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.strptime(date_to, "%Y-%m-%d")
            dt_until = (dt_to + timedelta(days=1)).replace(tzinfo=timezone.utc)
            query = query.filter(MaterialDatabaseORM.created_at < dt_until)
        except ValueError:
            pass
    query = query.order_by(MaterialDatabaseORM.description.asc())
    rows = query.all()
    materials = [_material_db_to_dict(r) for r in rows]
    buf = build_export_xlsx(materials)
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename = f"materiais_export_{today}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/database/materials/import-template")
def get_import_template(
    current_user: UserORM = Depends(get_user_with_bulk_import),
):
    """Exporta planilha Excel template para importação em massa de materiais."""
    buf = build_template_xlsx()
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=template_importacao_materiais.xlsx"},
    )


@app.post("/api/database/materials/import")
async def import_materials(
    file: UploadFile = File(..., description="Planilha Excel para importação"),
    dry_run: bool = Query(True, description="Se True, apenas valida sem gravar"),
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_user_with_bulk_import),
):
    """
    Importa materiais a partir de planilha Excel.
    dry_run=True: valida e retorna resultado sem gravar.
    dry_run=False: grava se não houver erros críticos.
    """
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Arquivo deve ser planilha Excel (.xlsx)")
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao ler arquivo: {e}")

    try:
        result = parse_and_validate_excel(content, db, MaterialDatabaseORM, PDMOrm)
    except Exception as e:
        logging.getLogger(__name__).exception("Erro ao processar Excel")
        raise HTTPException(status_code=400, detail=f"Arquivo inválido ou corrompido: {e}")

    if "_error" in result:
        raise HTTPException(status_code=400, detail=result["_error"])

    if dry_run:
        return {
            "dry_run": True,
            "total_rows": result["total_rows"],
            "valid_rows": result["valid_rows"],
            "error_rows": result["error_rows"],
            "warning_rows": result["warning_rows"],
            "rows": result["rows"],
        }

    # dry_run=False: verificar se há erros críticos
    has_critical = any(r.get("status") == "error" for r in result["rows"])
    if has_critical:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Existem erros críticos nas linhas. Corrija e tente novamente.",
                "rows": result["rows"],
            },
        )

    # Executar importação
    created = 0
    updated = 0
    max_id = db.query(func.max(MaterialDatabaseORM.id)).scalar() or 0
    next_sap = max_id + 1

    pdm_cache: dict[str, str] = {}
    for r in db.query(PDMOrm).all():
        pdm_cache[r.internal_code] = r.name

    for row_info in result["rows"]:
        if row_info.get("status") == "error":
            continue
        op = row_info.get("operacao")
        data = row_info.get("data", {})
        if op == "C":
            pdm_code = str(data.get("pdm_code", "")).strip()
            pdm_name = pdm_cache.get(pdm_code, pdm_code)
            sap_code = f"{next_sap:08d}"
            next_sap += 1
            kwargs = _row_to_create_kwargs(data, sap_code, pdm_name)
            db.add(MaterialDatabaseORM(**kwargs))
            created += 1
        elif op == "E":
            codigo = row_info.get("codigo_material")
            if not codigo:
                continue
            row = db.query(MaterialDatabaseORM).filter(
                MaterialDatabaseORM.sap_code == codigo
            ).first()
            if not row:
                continue
            kwargs = _row_to_update_kwargs(data)
            for k, v in kwargs.items():
                if hasattr(row, k):
                    setattr(row, k, v)
            updated += 1

    db.commit()
    log_system_event(
        db,
        current_user.id,
        "material",
        "bulk_import",
        f"{created} criados, {updated} atualizados por {current_user.email}",
        current_user.tenant_id,
    )
    return {"dry_run": False, "created": created, "updated": updated, "errors": []}


@app.get("/api/database/materials/{material_id}")
def get_material_database(
    material_id: int,
    db: Session = Depends(get_db),
    _: UserORM = Depends(get_current_user),
):
    """Retorna todos os campos de um material."""
    row = db.query(MaterialDatabaseORM).filter(MaterialDatabaseORM.id == material_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Material não encontrado")
    return _material_db_to_dict(row)


@app.patch("/api/database/materials/{material_id}/standardize")
def standardize_material(
    material_id: int,
    payload: MaterialStandardizeBody,
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_user_with_standardize),
):
    """
    Salva padronização do material. Atualiza campos enviados, define erp_status=pendente_erp,
    standardized_at e standardized_by.
    """
    row = db.query(MaterialDatabaseORM).filter(MaterialDatabaseORM.id == material_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Material não encontrado")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        if hasattr(row, k):
            setattr(row, k, v)
    row.erp_status = "pendente_erp"
    row.standardized_at = datetime.now(timezone.utc)
    row.standardized_by = current_user.id
    db.commit()
    db.refresh(row)
    log_system_event(
        db,
        current_user.id,
        "material",
        "standardize",
        f"Material {material_id} padronizado por {current_user.email}",
        current_user.tenant_id,
    )
    return _material_db_to_dict(row)


# -------------------------------
# NOTIFICAÇÕES
# -------------------------------


@app.get("/api/notifications")
def list_notifications(
    unread_only: bool = Query(False, description="Apenas não lidas"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_current_user),
):
    """Lista notificações do usuário logado."""
    q = db.query(NotificationORM).filter(NotificationORM.user_id == current_user.id)
    if unread_only:
        q = q.filter(~NotificationORM.is_read)
    q = q.order_by(NotificationORM.created_at.desc()).limit(limit)
    notifications = q.all()
    unread_count = (
        db.query(func.count(NotificationORM.id))
        .filter(NotificationORM.user_id == current_user.id, ~NotificationORM.is_read)
        .scalar() or 0
    )
    return {
        "unread_count": unread_count,
        "notifications": [
            {
                "id": n.id,
                "event_type": n.event_type,
                "title": n.title,
                "message": n.message,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
                "request_id": n.request_id,
            }
            for n in notifications
        ],
    }


@app.patch("/api/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_current_user),
):
    """Marca uma notificação como lida. Apenas o próprio usuário."""
    row = db.query(NotificationORM).filter(
        NotificationORM.id == notification_id,
        NotificationORM.user_id == current_user.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")
    row.is_read = True
    db.commit()
    return {"ok": True}


@app.patch("/api/notifications/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_current_user),
):
    """Marca todas as notificações do usuário como lidas."""
    rows = db.query(NotificationORM).filter(
        NotificationORM.user_id == current_user.id,
        ~NotificationORM.is_read,
    ).all()
    for r in rows:
        r.is_read = True
    db.commit()
    return {"ok": True}


@app.get("/api/notifications/prefs")
def get_notification_prefs(
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_current_user),
):
    """Retorna preferências do usuário. Cria com todos True se não existir."""
    prefs = db.query(UserNotificationPrefsORM).filter(
        UserNotificationPrefsORM.user_id == current_user.id
    ).first()
    if not prefs:
        prefs = UserNotificationPrefsORM(
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
        )
        db.add(prefs)
        db.commit()
        db.refresh(prefs)
    return {
        "notify_request_created": prefs.notify_request_created,
        "notify_request_assigned": prefs.notify_request_assigned,
        "notify_request_approved": prefs.notify_request_approved,
        "notify_request_rejected": prefs.notify_request_rejected,
        "notify_request_completed": prefs.notify_request_completed,
        "email_request_created": prefs.email_request_created,
        "email_request_assigned": prefs.email_request_assigned,
        "email_request_approved": prefs.email_request_approved,
        "email_request_rejected": prefs.email_request_rejected,
        "email_request_completed": prefs.email_request_completed,
    }


@app.patch("/api/notifications/prefs")
def update_notification_prefs(
    payload: NotificationPrefsUpdate,
    db: Session = Depends(get_db),
    current_user: UserORM = Depends(get_current_user),
):
    """Atualiza preferências de notificação do usuário."""
    prefs = db.query(UserNotificationPrefsORM).filter(
        UserNotificationPrefsORM.user_id == current_user.id
    ).first()
    if not prefs:
        prefs = UserNotificationPrefsORM(
            user_id=current_user.id,
            tenant_id=current_user.tenant_id,
        )
        db.add(prefs)
        db.flush()
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        if hasattr(prefs, k):
            setattr(prefs, k, v)
    db.commit()
    return {"ok": True}


# -------------------------------
# DELETAR PRODUTO
from uuid import UUID

@app.delete("/products/{product_id}")
def delete_product(product_id: UUID, db: Session = Depends(get_db)):
    row = db.query(ProductORM).filter(ProductORM.id == product_id).first()
    if not row:
        return {"ok": False}

    db.delete(row)
    db.commit()
    return {"ok": True}


