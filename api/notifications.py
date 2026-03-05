"""Sistema de notificações in-app e por e-mail."""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from orm_models import MaterialRequestORM, UserORM

from orm_models import NotificationORM, UserORM, UserNotificationPrefsORM

# ─── Configuração SMTP ───────────────────────────────────────────────────────

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "noreply@masterdata.com")
SMTP_ENABLED = os.getenv("SMTP_ENABLED", "false").lower() == "true"


def send_email(to_email: str, subject: str, html_body: str) -> None:
    """Envia e-mail. Fallback silencioso: imprime no console se SMTP desabilitado."""
    if not SMTP_ENABLED:
        print(f"[EMAIL SIMULADO] Para: {to_email} | Assunto: {subject}")
        return
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, to_email, msg.as_string())
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")


def get_email_template(
    event_type: str, context: dict
) -> tuple[str, str]:
    """Retorna (subject, html_body) para cada event_type."""
    request_number = context.get("request_number", "")
    description = context.get("description", "") or "—"
    requester_name = context.get("requester_name", "")
    actor_name = context.get("actor_name", "")
    stage = context.get("stage", "")
    justification = context.get("justification", "")
    platform_url = context.get("platform_url", "http://localhost:3000")

    header = """
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>MDM Platform</title></head>
<body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #0F1C38; color: white; padding: 12px 16px; margin-bottom: 20px; font-weight: bold;">
    MDM Platform
  </div>
"""

    highlight = f"""
  <div style="background: #f5f5f5; border-left: 4px solid #0F1C38; padding: 12px 16px; margin: 16px 0;">
    <strong>Solicitação {request_number}</strong><br>
    {description}
  </div>
"""

    footer = f"""
  <p style="margin-top: 24px; font-size: 12px; color: #666;">
    Este é um e-mail automático. Plataforma: <a href="{platform_url}">{platform_url}</a>
  </p>
</body>
</html>
"""

    templates = {
        "request_created": (
            f"Solicitação {request_number} criada",
            header
            + "  <p>Olá,</p>"
            + f"  <p>A solicitação <strong>{request_number}</strong> foi criada por {requester_name}.</p>"
            + highlight
            + footer,
        ),
        "request_assigned": (
            f"Solicitação {request_number} em atendimento",
            header
            + "  <p>Olá,</p>"
            + f"  <p>{actor_name} iniciou o atendimento da solicitação <strong>{request_number}</strong>.</p>"
            + highlight
            + footer,
        ),
        "request_approved": (
            f"Solicitação {request_number} aprovada - {stage}",
            header
            + "  <p>Olá,</p>"
            + f"  <p>{actor_name} aprovou a solicitação <strong>{request_number}</strong>, que avançou para {stage}.</p>"
            + highlight
            + footer,
        ),
        "request_rejected": (
            f"Solicitação {request_number} rejeitada",
            header
            + "  <p>Olá,</p>"
            + f"  <p>{actor_name} rejeitou a solicitação <strong>{request_number}</strong>.</p>"
            + (f"  <p><em>Justificativa: {justification}</em></p>" if justification else "")
            + highlight
            + footer,
        ),
        "request_completed": (
            f"Solicitação {request_number} concluída",
            header
            + "  <p>Olá,</p>"
            + f"  <p>A solicitação <strong>{request_number}</strong> foi concluída por {actor_name}.</p>"
            + highlight
            + footer,
        ),
    }

    subject, html = templates.get(event_type, ("Atualização de solicitação", header + f"  <p>{request_number}</p>" + footer))
    return subject, html


def _get_or_create_prefs(db: Session, user_id: int) -> UserNotificationPrefsORM:
    prefs = db.query(UserNotificationPrefsORM).filter(UserNotificationPrefsORM.user_id == user_id).first()
    if prefs:
        return prefs
    prefs = UserNotificationPrefsORM(user_id=user_id)
    db.add(prefs)
    db.flush()
    return prefs


def _get_pref_key(event_type: str) -> tuple[str, str]:
    """Retorna (notify_key, email_key) para o event_type."""
    mapping = {
        "request_created": ("notify_request_created", "email_request_created"),
        "request_assigned": ("notify_request_assigned", "email_request_assigned"),
        "request_approved": ("notify_request_approved", "email_request_approved"),
        "request_rejected": ("notify_request_rejected", "email_request_rejected"),
        "request_completed": ("notify_request_completed", "email_request_completed"),
    }
    return mapping.get(event_type, ("notify_request_created", "email_request_created"))


def _find_requester_user(db: Session, request: "MaterialRequestORM") -> UserORM | None:
    """Encontra o usuário solicitante por user_id ou por nome."""
    if request.user_id:
        user = db.query(UserORM).filter(UserORM.id == request.user_id).first()
        if user:
            return user
    if request.requester:
        user = db.query(UserORM).filter(UserORM.name.ilike(request.requester.strip())).first()
        if user:
            return user
    return None


def notify_request_event(
    db: Session,
    event_type: str,
    request: "MaterialRequestORM",
    actor_user: "UserORM | None",
    justification: str | None = None,
    stage: str | None = None,
) -> None:
    """
    Dispara notificações in-app e e-mail para o solicitante.
    - Não notifica o próprio actor.
    - Usa preferências do usuário para in-app e e-mail.
    """
    requester_user = _find_requester_user(db, request)
    if not requester_user or not requester_user.email:
        return
    if actor_user and requester_user.id == actor_user.id:
        return

    actor_name = actor_user.name if actor_user else "Sistema"
    request_number = f"#{request.id}"
    description = (request.generated_description or "")[:200]
    platform_url = os.getenv("PLATFORM_URL", "http://localhost:3000")

    context = {
        "request_number": request_number,
        "description": description,
        "requester_name": request.requester or "",
        "actor_name": actor_name,
        "stage": stage or request.status or "",
        "justification": justification or "",
        "platform_url": platform_url,
    }

    titles = {
        "request_created": f"Solicitação {request_number} criada",
        "request_assigned": f"Solicitação {request_number} em atendimento",
        "request_approved": f"Solicitação {request_number} aprovada",
        "request_rejected": f"Solicitação {request_number} rejeitada",
        "request_completed": f"Solicitação {request_number} concluída",
    }
    messages = {
        "request_created": f"Solicitação criada por {actor_name}.",
        "request_assigned": f"{actor_name} iniciou o atendimento.",
        "request_approved": f"Aprovado por {actor_name} — avançou para {stage or request.status}.",
        "request_rejected": f"Rejeitado por {actor_name}.",
        "request_completed": f"Concluída por {actor_name}.",
    }
    title = titles.get(event_type, f"Solicitação {request_number}")
    message = messages.get(event_type, "")

    prefs = _get_or_create_prefs(db, requester_user.id)
    notify_key, email_key = _get_pref_key(event_type)

    if getattr(prefs, notify_key, True):
        notification = NotificationORM(
            tenant_id=request.tenant_id,
            user_id=requester_user.id,
            request_id=request.id,
            event_type=event_type,
            title=title,
            message=message,
        )
        db.add(notification)

    if getattr(prefs, email_key, True) and requester_user.email:
        subject, html_body = get_email_template(event_type, context)
        send_email(requester_user.email, subject, html_body)

    db.commit()
