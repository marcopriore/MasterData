from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSON, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from uuid import uuid4, UUID
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from db import Base


# ─── Access Control ───────────────────────────────────────────────────────────

class RoleORM(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
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

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    role: Mapped["RoleORM"] = relationship("RoleORM", back_populates="users")
    # Solicitações criadas por este usuário (user_id)
    material_requests: Mapped[list["MaterialRequestORM"]] = relationship(
        "MaterialRequestORM",
        back_populates="user",
        foreign_keys="[MaterialRequestORM.user_id]",
    )
    # Atendimentos designados a este usuário (assigned_to)
    assigned_requests: Mapped[list["MaterialRequestORM"]] = relationship(
        "MaterialRequestORM",
        back_populates="assignee",
        foreign_keys="[MaterialRequestORM.assigned_to]",
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
    required_role_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("roles.id", ondelete="SET NULL"), nullable=True
    )

    workflow: Mapped["WorkflowHeaderORM"] = relationship(
        "WorkflowHeaderORM", back_populates="steps"
    )
    notification_settings: Mapped["NotificationSettingsORM | None"] = relationship(
        "NotificationSettingsORM", back_populates="step", uselist=False
    )


class NotificationSettingsORM(Base):
    """
    Mapeia step_id -> user_ids/role_ids para envio de notificações.
    Um registro por etapa de workflow.
    """
    __tablename__ = "notification_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    step_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workflow_config.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    # Arrays de IDs: [1, 2, 3]
    user_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=lambda: [])
    role_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=lambda: [])

    step: Mapped["WorkflowConfigORM"] = relationship(
        "WorkflowConfigORM", back_populates="notification_settings"
    )


class MaterialRequestORM(Base):
    __tablename__ = "material_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pdm_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pdm_templates.id"), nullable=False, index=True
    )
    workflow_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workflow_header.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(50), default="Pending", nullable=False, index=True
    )

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

    # ── Governança v2.0 ───────────────────────────────────────────────────────
    assigned_to: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    atendimento_status: Mapped[str] = mapped_column(
        String(20), default="aberto", nullable=False
    )  # 'aberto' | 'em_andamento' | 'reprovado' | 'concluido'
    last_action_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # JSON blobs — store attribute values and attachment metadata
    technical_attributes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Legacy JSON list of filenames — kept for backwards compat; new uploads use
    # the request_attachments relational table instead.
    attachments: Mapped[list | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    pdm: Mapped["PDMOrm"] = relationship("PDMOrm", back_populates="material_requests")
    # Solicitante (user_id)
    user: Mapped["UserORM | None"] = relationship(
        "UserORM",
        back_populates="material_requests",
        foreign_keys=[user_id],
    )
    # Responsável pelo atendimento (assigned_to)
    assignee: Mapped["UserORM | None"] = relationship(
        "UserORM",
        back_populates="assigned_requests",
        foreign_keys=[assigned_to],
        lazy="selectin",
    )
    request_values: Mapped[list["RequestValueORM"]] = relationship(
        "RequestValueORM", back_populates="request", cascade="all, delete-orphan"
    )
    request_attachments: Mapped[list["RequestAttachmentORM"]] = relationship(
        "RequestAttachmentORM", back_populates="request", cascade="all, delete-orphan"
    )


class RequestValueORM(Base):
    __tablename__ = "request_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("material_requests.id", ondelete="CASCADE"), nullable=False
    )
    attribute_id: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True
    )
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
        DateTime, default=datetime.utcnow, nullable=False
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


class ProductORM(Base):
    __tablename__ = "products"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)