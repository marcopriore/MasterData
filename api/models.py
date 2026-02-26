from pydantic import BaseModel, Field
from typing import Optional
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
    values: dict[str, str] = Field(default_factory=dict)  # attribute_id -> value
    workflow_id: Optional[int] = None  # defaults to active workflow if omitted


class WorkflowConfig(BaseModel):
    id: int
    step_name: str
    status_key: str
    order: int
    is_active: bool = True


class WorkflowConfigCreate(BaseModel):
    step_name: str
    status_key: Optional[str] = None  # auto-generated from step_name if blank
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