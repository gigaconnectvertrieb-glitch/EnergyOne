import base64
import json
import os
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime
from typing import Optional

from fastapi import Depends, File, Form, HTTPException, UploadFile
from jose import jwt as jose_jwt
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .app import Base, Customer, Employee, STORAGE, app, admin, current, db, log, notify_update, require_module

DOCUSIGN_INTEGRATION_KEY = os.getenv("DOCUSIGN_INTEGRATION_KEY")
DOCUSIGN_USER_ID = os.getenv("DOCUSIGN_USER_ID")
DOCUSIGN_ACCOUNT_ID = os.getenv("DOCUSIGN_ACCOUNT_ID")
DOCUSIGN_PRIVATE_KEY = os.getenv("DOCUSIGN_PRIVATE_KEY")
DOCUSIGN_AUTH_HOST = os.getenv("DOCUSIGN_AUTH_HOST", "account-d.docusign.com")
DOCUSIGN_API_BASE = os.getenv("DOCUSIGN_API_BASE", "https://demo.docusign.net/restapi")

def docusign_configured() -> bool:
    return bool(DOCUSIGN_INTEGRATION_KEY and DOCUSIGN_USER_ID and DOCUSIGN_ACCOUNT_ID and DOCUSIGN_PRIVATE_KEY)

def require_docusign(_: Employee = Depends(admin)):
    if not docusign_configured():
        raise HTTPException(503, "eSignatur ist nicht konfiguriert (DocuSign-Zugangsdaten fehlen).")


_token_cache: dict = {"token": None, "expires_at": 0}

def _http_json(url: str, data: Optional[dict] = None, headers: Optional[dict] = None, method: Optional[str] = None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method or ("POST" if data is not None else "GET"))
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items(): req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as ex:
        detail = ex.read().decode(errors="replace")
        raise HTTPException(502, f"DocuSign-Fehler ({ex.code}): {detail[:400]}")

def get_access_token() -> str:
    if not docusign_configured():
        raise HTTPException(503, "eSignatur ist nicht konfiguriert (DocuSign-Zugangsdaten fehlen).")
    if _token_cache["token"] and _token_cache["expires_at"] > time.time() + 60:
        return _token_cache["token"]
    now = int(time.time())
    assertion = jose_jwt.encode(
        {
            "iss": DOCUSIGN_INTEGRATION_KEY,
            "sub": DOCUSIGN_USER_ID,
            "aud": DOCUSIGN_AUTH_HOST,
            "iat": now,
            "exp": now + 3600,
            "scope": "signature impersonation",
        },
        DOCUSIGN_PRIVATE_KEY,
        algorithm="RS256",
    )
    body = f"grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={assertion}".encode()
    req = urllib.request.Request(f"https://{DOCUSIGN_AUTH_HOST}/oauth/token", data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError as ex:
        detail = ex.read().decode(errors="replace")
        raise HTTPException(502, f"DocuSign-Login fehlgeschlagen: {detail[:400]} — falls das die erste Anfrage ist, muss die Consent-URL noch einmal im Browser bestätigt werden.")
    _token_cache["token"] = payload["access_token"]
    _token_cache["expires_at"] = now + int(payload.get("expires_in", 3600))
    return _token_cache["token"]


class SignatureRequest(Base):
    __tablename__ = "signaturanfragen"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("kunden.id"), nullable=True)
    envelope_id: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    document_name: Mapped[str] = mapped_column(String(255))
    storage_name: Mapped[str] = mapped_column(String(255))
    signer_name: Mapped[str] = mapped_column(String(150))
    signer_email: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(30), default="entwurf")
    created_by: Mapped[int] = mapped_column(ForeignKey("mitarbeiter.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


def serialize_sig(x: SignatureRequest) -> dict:
    return {
        "id": x.id, "customer_id": x.customer_id, "envelope_id": x.envelope_id,
        "document_name": x.document_name, "signer_name": x.signer_name, "signer_email": x.signer_email,
        "status": x.status, "created_at": x.created_at.isoformat(), "updated_at": x.updated_at.isoformat(),
    }


DOCUSIGN_STATUS_MAP = {
    "sent": "versendet", "delivered": "geöffnet", "completed": "unterschrieben",
    "declined": "abgelehnt", "voided": "storniert",
}


@app.get("/api/esign/requests")
def list_signature_requests(_: Employee = Depends(admin), s: Session = Depends(db)):
    return [serialize_sig(x) for x in s.scalars(select(SignatureRequest).order_by(SignatureRequest.created_at.desc()))]


@app.post("/api/esign/send", dependencies=[Depends(require_module("esignatur"))])
def send_for_signature(
    signer_name: str = Form(...), signer_email: EmailStr = Form(...),
    customer_id: Optional[int] = Form(None), email_subject: str = Form("Bitte unterschreiben: Vertragsunterlagen E1 Direktvertrieb"),
    file: UploadFile = File(...), e: Employee = Depends(admin), s: Session = Depends(db),
):
    if not docusign_configured():
        raise HTTPException(503, "eSignatur ist nicht konfiguriert (DocuSign-Zugangsdaten fehlen).")
    ext = os.path.splitext(file.filename or "")[1].lower() or ".pdf"
    if ext not in (".pdf", ".doc", ".docx"): raise HTTPException(422, "Nur PDF/DOC/DOCX erlaubt")
    raw = file.file.read()
    storage_name = f"esign-{uuid.uuid4().hex}{ext}"
    (STORAGE / storage_name).write_bytes(raw)

    token = get_access_token()
    envelope_payload = {
        "emailSubject": email_subject,
        "documents": [{
            "documentBase64": base64.b64encode(raw).decode(),
            "name": file.filename or "Vertrag.pdf",
            "fileExtension": ext.lstrip("."),
            "documentId": "1",
        }],
        "recipients": {"signers": [{
            "email": signer_email, "name": signer_name, "recipientId": "1", "routingOrder": "1",
            "tabs": {"signHereTabs": [{"anchorString": "/sig/", "anchorUnits": "pixels", "anchorXOffset": "0", "anchorYOffset": "0"}]},
        }]},
        "status": "sent",
    }
    result = _http_json(
        f"{DOCUSIGN_API_BASE}/v2.1/accounts/{DOCUSIGN_ACCOUNT_ID}/envelopes",
        data=envelope_payload, headers={"Authorization": f"Bearer {token}"},
    )
    item = SignatureRequest(
        customer_id=customer_id, envelope_id=result.get("envelopeId"), document_name=file.filename or "Vertrag.pdf",
        storage_name=storage_name, signer_name=signer_name, signer_email=signer_email, status="versendet", created_by=e.id,
    )
    s.add(item); log(s, e, "eSignatur-Anfrage gesendet", f"{signer_name} <{signer_email}>"); s.commit(); notify_update()
    return serialize_sig(item)


@app.post("/api/esign/requests/{request_id}/refresh", dependencies=[Depends(require_module("esignatur"))])
def refresh_signature_status(request_id: int, e: Employee = Depends(admin), s: Session = Depends(db)):
    item = s.get(SignatureRequest, request_id)
    if not item: raise HTTPException(404, "Anfrage nicht gefunden")
    if not item.envelope_id: raise HTTPException(422, "Keine DocuSign-Envelope hinterlegt")
    token = get_access_token()
    result = _http_json(
        f"{DOCUSIGN_API_BASE}/v2.1/accounts/{DOCUSIGN_ACCOUNT_ID}/envelopes/{item.envelope_id}",
        headers={"Authorization": f"Bearer {token}"}, method="GET",
    )
    ds_status = result.get("status", "")
    item.status = DOCUSIGN_STATUS_MAP.get(ds_status, ds_status or item.status)
    item.updated_at = datetime.utcnow()
    s.commit(); notify_update()
    return serialize_sig(item)
