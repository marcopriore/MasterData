"""
Sistema de Notificações (Base).

Helper send_workflow_notification(request_id) disparado em cada mudança de status,
enviando e-mail para os responsáveis configurados (notification_settings) e para o solicitante.
"""
from __future__ import annotations

import html
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy import or_, func
from sqlalchemy.orm import Session, joinedload

logger = logging.getLogger(__name__)


def _resolve_emails_for_step(
    step_id: int,
    db: Session,
) -> set[str]:
    """Resolve user_ids e role_ids de notification_settings para lista de emails."""
    from orm_models import NotificationSettingsORM, UserORM

    ns = (
        db.query(NotificationSettingsORM)
        .filter(NotificationSettingsORM.step_id == step_id)
        .first()
    )
    if not ns:
        return set()

    emails: set[str] = set()
    user_ids = ns.user_ids or []
    role_ids = ns.role_ids or []

    if user_ids:
        users = db.query(UserORM).filter(
            UserORM.id.in_(user_ids),
            UserORM.is_active == True,
        ).all()
        for u in users:
            if u.email:
                emails.add(u.email.strip().lower())

    if role_ids:
        users = (
            db.query(UserORM)
            .filter(UserORM.role_id.in_(role_ids), UserORM.is_active == True)
            .all()
        )
        for u in users:
            if u.email:
                emails.add(u.email.strip().lower())

    return emails


def _find_step_id_by_status(
    status: str,
    workflow_id: int,
    db: Session,
) -> int | None:
    """Retorna o step_id do WorkflowConfig que corresponde ao status_key."""
    from orm_models import WorkflowConfigORM

    status_lower = (status or "").strip().lower()
    row = (
        db.query(WorkflowConfigORM)
        .filter(
            WorkflowConfigORM.workflow_id == workflow_id,
            WorkflowConfigORM.is_active == True,
        )
        .filter(
            or_(
                func.lower(WorkflowConfigORM.status_key) == status_lower,
                func.lower(WorkflowConfigORM.step_name) == status_lower,
            )
        )
        .first()
    )
    return row.id if row else None


def _send_email(to_emails: set[str], subject: str, body_html: str) -> bool:
    """Envia e-mail via SMTP. Retorna True se enviou, False se SMTP não configurado ou erro."""
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", "587") or "587")
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASS")
    from_email = os.environ.get("FROM_EMAIL", user or "noreply@masterdata.local")

    if not host or not user or not password:
        logger.info(
            "Notificação de workflow não enviada: SMTP não configurado "
            "(SMTP_HOST, SMTP_USER, SMTP_PASS). To=%s, subject=%s",
            list(to_emails)[:3],
            subject,
        )
        return False

    if not to_emails:
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_email
        msg["To"] = ", ".join(sorted(to_emails))
        msg.attach(MIMEText(body_html, "html", "utf-8"))

        with smtplib.SMTP(host, port) as server:
            server.starttls()
            server.login(user, password)
            server.sendmail(from_email, list(to_emails), msg.as_string())

        logger.info("Notificação enviada: %s para %d destinatário(s)", subject, len(to_emails))
        return True
    except Exception as e:
        logger.exception("Erro ao enviar notificação de workflow: %s", e)
        return False


def send_workflow_notification(request_id: int, db: Session) -> None:
    """
    Disparado em cada mudança de status.
    Envia e-mail para os responsáveis configurados em notification_settings (step_id -> user_ids/role_ids)
    e para o solicitante (se user_id estiver preenchido).
    """
    from orm_models import MaterialRequestORM

    row = (
        db.query(MaterialRequestORM)
        .options(
            joinedload(MaterialRequestORM.pdm),
            joinedload(MaterialRequestORM.user),
        )
        .filter(MaterialRequestORM.id == request_id)
        .first()
    )
    if not row:
        return

    status = row.status or ""
    pdm_name = row.pdm.name if row.pdm else "?"
    requester_name = row.requester or "Solicitante"

    # Emails dos responsáveis configurados para a etapa atual
    step_id = _find_step_id_by_status(status, row.workflow_id, db)
    to_emails = _resolve_emails_for_step(step_id, db) if step_id else set()

    # Solicitante (se tiver user_id e email)
    if row.user_id and row.user and row.user.email:
        to_emails.add(row.user.email.strip().lower())

    if not to_emails:
        logger.debug("Nenhum destinatário para notificação REQ-%s", request_id)
        return

    subject = f"[MasterData] Solicitação REQ-{request_id:04d} — Status: {status}"
    _pdm = html.escape(str(pdm_name))
    _req = html.escape(str(requester_name))
    _status = html.escape(str(status))
    body_html = f"""
    <html>
    <body style="font-family: sans-serif; line-height: 1.5;">
      <h3>Atualização de Status</h3>
      <p>A solicitação <strong>REQ-{request_id:04d}</strong> foi atualizada.</p>
      <ul>
        <li><strong>Material/PDM:</strong> {_pdm}</li>
        <li><strong>Solicitante:</strong> {_req}</li>
        <li><strong>Novo status:</strong> {_status}</li>
      </ul>
      <p>Acesse o painel de Governança para mais detalhes.</p>
      <hr style="margin-top: 24px; border: none; border-top: 1px solid #eee;" />
      <p style="font-size: 12px; color: #888;">MasterData — Sistema de Governança de Dados</p>
    </body>
    </html>
    """

    _send_email(to_emails, subject, body_html)
