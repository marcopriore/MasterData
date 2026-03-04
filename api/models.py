from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Literal
from uuid import UUID, uuid4

class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = None

class Product(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    description: Optional[str] = None


class AttributeValue(BaseModel):
    value: str
    abbreviation: str


class PDMAttribute(BaseModel):
    id: str
    order: int
    name: str
    dataType: str  # "numeric" | "text" | "lov"
    isRequired: bool
    includeInDescription: bool
    abbreviation: str
    allowedValues: list[AttributeValue] = Field(default_factory=list)


class PDMCreate(BaseModel):
    name: str
    internal_code: str
    is_active: bool = True
    attributes: list[PDMAttribute] = Field(default_factory=list)


class MaterialRequest(BaseModel):
    id: int
    pdm_id: int
    status: str = "Pending"
    requester: str
    created_at: Optional[str] = None


class MaterialRequestCreate(BaseModel):
    pdm_id: int
    requester: str
    status: str = "Pending"


class RequestValue(BaseModel):
    id: int
    request_id: int
    attribute_id: str
    value: str


class RequestValueCreate(BaseModel):
    request_id: int
    attribute_id: str
    value: str


class RequestCreate(BaseModel):
    pdm_id: int
    requester: str = "Anonymous"
    cost_center: Optional[str] = None
    urgency: str = "low"                          # "low" | "medium" | "high"
    quantity: Optional[int] = None
    description_note: Optional[str] = None
    justificativa: Optional[str] = None
    generated_description: Optional[str] = None
    values: dict[str, str] = Field(default_factory=dict)   # attribute_id -> value
    attachments: list[str] = Field(default_factory=list)   # file names / URLs
    workflow_id: Optional[int] = None             # defaults to active workflow if omitted


class RequestValueOut(BaseModel):
    """One attribute value row as returned inside RequestOut.values."""
    attribute_id: str
    label: str
    value: str


class RequestOut(BaseModel):
    """Full response shape returned by GET /api/requests and POST /api/requests."""
    id: int
    pdm_id: int
    pdm_name: Optional[str] = None
    status: str
    workflow_id: int
    requester: str
    cost_center: Optional[str] = None
    urgency: str = "low"
    justification: Optional[str] = None
    generated_description: Optional[str] = None
    technical_attributes: Optional[dict] = None
    attachments: Optional[list] = None
    date: Optional[str] = None
    values: list[RequestValueOut] = Field(default_factory=list)


class WorkflowConfig(BaseModel):
    id: int
    step_name: str
    status_key: str
    order: int
    is_active: bool = True


class WorkflowConfigCreate(BaseModel):
    step_name: str
    status_key: Optional[str] = None  # auto-generated from step_name if blank
    workflow_id: Optional[int] = None  # defaults to active workflow if omitted
    insert_after_id: Optional[int] = None  # 0 = at start, None = at end, else after that id
    is_active: bool = True


class WorkflowConfigStepUpdate(BaseModel):
    step_name: Optional[str] = None
    status_key: Optional[str] = None


class WorkflowConfigOrderItem(BaseModel):
    id: int
    order: int


class WorkflowConfigUpdate(BaseModel):
    steps: list[WorkflowConfigOrderItem]


class WorkflowConfigBulkItem(BaseModel):
    id: Optional[int] = None  # None or 0 = new step
    step_name: str
    status_key: Optional[str] = None
    order: int
    is_active: bool = True


class WorkflowConfigBulkUpdate(BaseModel):
    workflow_id: int
    steps: list[WorkflowConfigBulkItem]


class WorkflowHeader(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    is_active: bool = True


class WorkflowHeaderCreate(BaseModel):
    name: str
    description: Optional[str] = None


class WorkflowMigrationStepInfo(BaseModel):
    step_name: str
    status_key: str
    request_count: int


class WorkflowMigrationMapping(BaseModel):
    from_status_key: str
    to_status_key: str


class WorkflowMigratePayload(BaseModel):
    from_workflow_id: int
    to_workflow_id: int
    mappings: list[WorkflowMigrationMapping]


class WorkflowUpdate(BaseModel):
    is_active: Optional[bool] = None


class MoveToPayload(BaseModel):
    status_key: str


class StatusUpdatePayload(BaseModel):
    action: Optional[str] = "approve"
    justification: Optional[str] = None


class RejectPayload(BaseModel):
    justification: Optional[str] = None


class AttributesPayload(BaseModel):
    """Body for PATCH /api/requests/{id}/attributes - merge into technical_attributes."""
    attributes: dict[str, str] = Field(default_factory=dict)


# ─── Field Dictionary (SAP MM01) ───────────────────────────────────────────────

class FieldDictionaryCreate(BaseModel):
    field_name: str
    field_label: str
    sap_field: Optional[str] = None
    sap_view: str
    field_type: str
    options: Optional[dict] = None
    responsible_role: str
    is_required: bool = False
    is_active: bool = True
    display_order: int = 0


class FieldDictionaryUpdate(BaseModel):
    field_name: Optional[str] = None
    field_label: Optional[str] = None
    sap_field: Optional[str] = None
    sap_view: Optional[str] = None
    field_type: Optional[str] = None
    options: Optional[dict] = None
    responsible_role: Optional[str] = None
    is_required: Optional[bool] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class FieldDictionaryResponse(BaseModel):
    id: int
    field_name: str
    field_label: str
    sap_field: Optional[str] = None
    sap_view: str
    field_type: str
    options: Optional[dict] = None
    responsible_role: str
    is_required: bool
    is_active: bool
    display_order: int
    created_at: Optional[str] = None


# ─── Roles ────────────────────────────────────────────────────────────────────

class RolePermissions(BaseModel):
    can_approve: bool = False
    can_reject: bool = False
    can_edit_pdm: bool = False
    can_manage_users: bool = False
    can_manage_workflows: bool = False
    can_submit_request: bool = True


class RoleCreate(BaseModel):
    name: str
    role_type: Literal["sistema", "etapa"] = "sistema"
    permissions: RolePermissions = Field(default_factory=RolePermissions)


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    role_type: Optional[Literal["sistema", "etapa"]] = None
    permissions: Optional[RolePermissions] = None


class RoleOut(BaseModel):
    id: int
    name: str
    permissions: RolePermissions

    model_config = {"from_attributes": True}


# ─── Users ────────────────────────────────────────────────────────────────────

class UserPreferences(BaseModel):
    theme: Literal["light", "dark"] = "light"
    language: Literal["pt", "en"] = "pt"


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str                          # plain-text; hashed before storage
    role_id: int
    preferences: UserPreferences = Field(default_factory=UserPreferences)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role_id: Optional[int] = None
    is_active: Optional[bool] = None
    preferences: Optional[UserPreferences] = None


class UserPasswordChange(BaseModel):
    current_password: str
    new_password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role_id: int
    role_name: Optional[str] = None
    is_active: bool
    preferences: UserPreferences
    created_at: Optional[str] = None

    model_config = {"from_attributes": True}


# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    # Plain str so Pydantic never rejects the input before the DB lookup.
    # The handler normalises (strip + lower) before querying.
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut