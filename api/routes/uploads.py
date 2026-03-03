"""
Uploads router — file attachments for material requests

Prefix : /api/requests
Tags   : ["Attachments"]

Endpoints
─────────────────────────────────────────────────────────────────────────────
  POST   /api/requests/{request_id}/attachments
      Upload one file.  Saves to  api/uploads/<request_id>/<uuid>_<filename>
      and creates a row in request_attachments.

  GET    /api/requests/{request_id}/attachments
      List all attachments for a request.

  DELETE /api/requests/{request_id}/attachments/{attachment_id}
      Delete the DB record and the file from disk.

Allowed MIME types: images (png/jpg/gif/webp) and PDF.
Max file size     : 10 MB (enforced in the endpoint body).
"""

from __future__ import annotations

import mimetypes
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from deps import get_db
from orm_models import MaterialRequestORM, RequestAttachmentORM

router = APIRouter(prefix="/api/requests", tags=["Attachments"])

# ─── Config ───────────────────────────────────────────────────────────────────

# Root folder for all uploads — relative to the api/ directory at runtime
UPLOAD_ROOT = Path(__file__).parent.parent / "uploads"

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB

ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "application/pdf",
}

# ─── Helpers ──────────────────────────────────────────────────────────────────


def _attachment_to_dict(a: RequestAttachmentORM) -> dict:
    return {
        "id": a.id,
        "request_id": a.request_id,
        "file_name": a.file_name,
        "file_path": a.file_path,
        "mime_type": a.mime_type,
        "file_size": a.file_size,
        "uploaded_at": a.uploaded_at.isoformat() if a.uploaded_at else None,
    }


def _load_request(request_id: int, db: Session) -> MaterialRequestORM:
    row = db.query(MaterialRequestORM).filter(MaterialRequestORM.id == request_id).first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Solicitação {request_id} não encontrada",
        )
    return row


# ─── POST /api/requests/{request_id}/attachments ──────────────────────────────


@router.post(
    "/{request_id}/attachments",
    status_code=status.HTTP_201_CREATED,
    summary="Faz upload de um arquivo para uma solicitação",
)
async def upload_attachment(
    request_id: int,
    file: UploadFile = File(..., description="Arquivo a ser anexado (PDF ou imagem, máx 10 MB)"),
    db: Session = Depends(get_db),
):
    """
    Saves the uploaded file to ``api/uploads/<request_id>/`` and creates a
    row in ``request_attachments`` with the file metadata.

    - Validates that the request exists
    - Validates MIME type (PDF or image)
    - Validates file size (≤ 10 MB)
    - Uses a UUID prefix to avoid filename collisions
    """
    # 1. Validate request exists
    _load_request(request_id, db)

    # 2. Read content first so we can validate size before touching disk
    content = await file.read()
    file_size = len(content)

    if file_size > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Arquivo muito grande ({file_size // 1024} KB). Máximo permitido: 10 MB.",
        )

    # 3. Detect MIME type — prefer the declared content_type, fall back to
    #    guessing from the filename extension
    mime = file.content_type or ""
    if not mime or mime == "application/octet-stream":
        guessed, _ = mimetypes.guess_type(file.filename or "")
        mime = guessed or "application/octet-stream"

    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Tipo de arquivo não permitido: '{mime}'. "
                "Envie PDF ou imagem (PNG, JPG, GIF, WEBP)."
            ),
        )

    # 4. Build a safe, unique filename and destination path
    original_name = Path(file.filename or "arquivo").name  # strip any path traversal
    unique_prefix = uuid.uuid4().hex[:8]
    safe_name = f"{unique_prefix}_{original_name}"

    dest_dir = UPLOAD_ROOT / str(request_id)
    dest_dir.mkdir(parents=True, exist_ok=True)

    dest_path = dest_dir / safe_name
    # Relative path stored in DB — portable across deployments
    relative_path = f"uploads/{request_id}/{safe_name}"

    # 5. Write to disk
    dest_path.write_bytes(content)

    # 6. Persist metadata in request_attachments
    attachment = RequestAttachmentORM(
        request_id=request_id,
        file_name=original_name,
        file_path=relative_path,
        mime_type=mime,
        file_size=file_size,
        uploaded_at=datetime.now(timezone.utc),
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return _attachment_to_dict(attachment)


# ─── GET /api/requests/{request_id}/attachments ───────────────────────────────


@router.get(
    "/{request_id}/attachments",
    summary="Lista os anexos de uma solicitação",
)
def list_attachments(request_id: int, db: Session = Depends(get_db)):
    """Returns all attachment records for the given request, ordered by upload time."""
    _load_request(request_id, db)
    rows = (
        db.query(RequestAttachmentORM)
        .filter(RequestAttachmentORM.request_id == request_id)
        .order_by(RequestAttachmentORM.uploaded_at.asc())
        .all()
    )
    return [_attachment_to_dict(a) for a in rows]


# ─── DELETE /api/requests/{request_id}/attachments/{attachment_id} ────────────


@router.delete(
    "/{request_id}/attachments/{attachment_id}",
    summary="Remove um anexo da solicitação",
)
def delete_attachment(
    request_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
):
    """Deletes the DB record and the file from disk. Returns 404 if not found."""
    row = (
        db.query(RequestAttachmentORM)
        .filter(
            RequestAttachmentORM.id == attachment_id,
            RequestAttachmentORM.request_id == request_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Anexo não encontrado",
        )

    # Remove file from disk (best-effort — don't fail if already gone)
    abs_path = UPLOAD_ROOT.parent / row.file_path
    try:
        if abs_path.exists():
            abs_path.unlink()
        # Remove the per-request directory if now empty
        parent = abs_path.parent
        if parent.exists() and not any(parent.iterdir()):
            parent.rmdir()
    except OSError:
        pass  # log in production; don't block the DB delete

    db.delete(row)
    db.commit()
    return {"ok": True, "deleted_id": attachment_id}
