"""
Serviço de envio de emails via SMTP.
Configuração: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM em .env
"""
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def send_email(to: str, subject: str, html_body: str) -> bool:
    """Envia email via SMTP. Retorna True se OK, False se falhar."""
    try:
        smtp_host = os.getenv("SMTP_HOST", "")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER", "")
        smtp_password = os.getenv("SMTP_PASSWORD", "")
        smtp_from = os.getenv("SMTP_FROM", smtp_user)

        if not smtp_host or not smtp_user:
            print(f"[EMAIL SIMULADO] Para: {to} | Assunto: {subject}")
            print(f"[EMAIL SIMULADO] Body: {html_body[:200]}...")
            return True

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_from
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_from, to, msg.as_string())

        print(f"[EMAIL OK] Enviado para {to}")
        return True

    except Exception as e:
        print(f"[EMAIL ERRO] Falha ao enviar para {to}: {e}")
        return False


def send_welcome_email(
    to: str,
    admin_name: str,
    tenant_name: str,
    temp_password: str,
) -> bool:
    """Email de boas-vindas com credenciais iniciais."""
    subject = f"Bem-vindo ao MDM Platform — {tenant_name}"
    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e293b;">Bem-vindo ao MDM Platform</h2>
        <p>Olá, <strong>{admin_name}</strong>!</p>
        <p>Sua conta de administrador foi criada para a empresa <strong>{tenant_name}</strong>.</p>
        <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0;"><strong>Email:</strong> {to}</p>
            <p style="margin: 0 0 8px 0;"><strong>Senha temporária:</strong>
                <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">{temp_password}</code>
            </p>
        </div>
        <p style="color: #ef4444;"><strong>Por segurança, altere sua senha no primeiro acesso.</strong></p>
        <p>Acesse o sistema e comece a configurar seus materiais.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #94a3b8; font-size: 12px;">MDM Platform — Gestão de Dados Mestres</p>
    </div>
    """
    return send_email(to, subject, html_body)
