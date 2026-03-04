from typing import Optional
from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSON, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone
from uuid import uuid4, UUID
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from db import Base


# ─── Access Control ───────────────────────────────────────────────────────────

class RoleORM(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    role_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="sistema"
    )  # "sistema" | "etapa"
    # JSON flags: { "can_approve": true, "can_edit_pdm": true, "can_manage_users": true, ... }
    permissions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    users: Mapped[list["UserORM"]] = relationship("UserORM", back_populates="role")


class UserORM(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    role_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False
    )
    # User preferences: { "theme": "light"|"dark", "language": "pt"|"en" }
    preferences: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=lambda: {"theme": "light", "language": "pt"}
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    role: Mapped["RoleORM"] = relationship("RoleORM", back_populates="users")
    material_requests: Mapped[list["MaterialRequestORM"]] = relationship(
        "MaterialRequestORM", back_populates="user", foreign_keys="MaterialRequestORM.user_id"
    )
    assigned_requests: Mapped[list["MaterialRequestORM"]] = relationship(
        "MaterialRequestORM", back_populates="assigned_to", foreign_keys="MaterialRequestORM.assigned_to_id"
    )


class WorkflowHeaderORM(Base):
    __tablename__ = "workflow_header"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    steps: Mapped[list["WorkflowConfigORM"]] = relationship(
        "WorkflowConfigORM", back_populates="workflow", cascade="all, delete-orphan"
    )
    material_requests: Mapped[list["MaterialRequestORM"]] = relationship(
        "MaterialRequestORM", back_populates="workflow"
    )


class WorkflowConfigORM(Base):
    __tablename__ = "workflow_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workflow_header.id", ondelete="CASCADE"), nullable=False
    )
    step_name: Mapped[str] = mapped_column(String(100), nullable=False)
    status_key: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. pending_technical, completed
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    workflow: Mapped["WorkflowHeaderORM"] = relationship(
        "WorkflowHeaderORM", back_populates="steps"
    )


class MaterialRequestORM(Base):
    __tablename__ = "material_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pdm_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pdm_templates.id", ondelete="RESTRICT"), nullable=False
    )
    workflow_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workflow_header.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(50), default="Pending", nullable=False)

    # Requester info — user_id links to the User table when auth is active;
    # requester string is kept for backwards-compat and anonymous submissions
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    requester: Mapped[str] = mapped_column(String(200), nullable=False)
    cost_center: Mapped[str | None] = mapped_column(String(100), nullable=True)
    urgency: Mapped[str] = mapped_column(String(20), default="low", nullable=False)

    # Content
    justification: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # JSON blobs — store attribute values and attachment metadata
    technical_attributes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Legacy JSON list of filenames — kept for backwards compat; new uploads use
    # the request_attachments relational table instead.
    attachments: Mapped[list | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    assigned_to_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, default=None
    )
    assigned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, default=None
    )

    pdm: Mapped["PDMOrm"] = relationship("PDMOrm", back_populates="material_requests")
    workflow: Mapped["WorkflowHeaderORM"] = relationship(
        "WorkflowHeaderORM", back_populates="material_requests"
    )
    user: Mapped["UserORM | None"] = relationship(
        "UserORM", back_populates="material_requests", foreign_keys="MaterialRequestORM.user_id"
    )
    assigned_to: Mapped["UserORM | None"] = relationship(
        "UserORM", foreign_keys=[assigned_to_id], back_populates="assigned_requests"
    )
    request_values: Mapped[list["RequestValueORM"]] = relationship(
        "RequestValueORM", back_populates="request", cascade="all, delete-orphan"
    )
    request_attachments: Mapped[list["RequestAttachmentORM"]] = relationship(
        "RequestAttachmentORM", back_populates="request", cascade="all, delete-orphan"
    )
    history: Mapped[list["RequestHistoryORM"]] = relationship(
        "RequestHistoryORM", back_populates="request", order_by="RequestHistoryORM.created_at"
    )


class RequestHistoryORM(Base):
    """Histórico de eventos por solicitação."""
    __tablename__ = "request_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("material_requests.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    event_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    stage: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    request: Mapped["MaterialRequestORM"] = relationship("MaterialRequestORM", back_populates="history")
    user: Mapped[Optional["UserORM"]] = relationship("UserORM", foreign_keys=[user_id])


class SystemLogORM(Base):
    """Log de auditoria geral do sistema."""
    __tablename__ = "system_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    event_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    user: Mapped[Optional["UserORM"]] = relationship("UserORM", foreign_keys=[user_id])


class RequestValueORM(Base):
    __tablename__ = "request_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("material_requests.id", ondelete="CASCADE"), nullable=False
    )
    attribute_id: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)

    request: Mapped["MaterialRequestORM"] = relationship(
        "MaterialRequestORM", back_populates="request_values"
    )


class RequestAttachmentORM(Base):
    """Stores one uploaded file per row, linked to a material_request."""
    __tablename__ = "request_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("material_requests.id", ondelete="CASCADE"), nullable=False
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Relative path under the uploads root, e.g. "uploads/42/invoice.pdf"
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    # MIME type detected at upload time, e.g. "application/pdf" or "image/png"
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # bytes
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
    )

    request: Mapped["MaterialRequestORM"] = relationship(
        "MaterialRequestORM", back_populates="request_attachments"
    )


class PDMOrm(Base):
    __tablename__ = "pdm_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    internal_code: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    attributes: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)

    material_requests: Mapped[list["MaterialRequestORM"]] = relationship(
        "MaterialRequestORM", back_populates="pdm"
    )


class FieldDictionaryORM(Base):
    """Dicionário de campos SAP MM01 — global, não vinculado ao PDM."""
    __tablename__ = "field_dictionary"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    field_label: Mapped[str] = mapped_column(String(150), nullable=False)
    sap_field: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sap_view: Mapped[str] = mapped_column(String(50), nullable=False)
    field_type: Mapped[str] = mapped_column(String(20), nullable=False)
    options: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    responsible_role: Mapped[str] = mapped_column(String(50), nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class ProductORM(Base):
    __tablename__ = "products"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)