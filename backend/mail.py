import email
import imaplib
import os
import re
import smtplib
import threading
import time
import uuid
from datetime import datetime
from email.header import decode_header
from email.mime.text import MIMEText
from email.utils import parseaddr
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .app import Base, Employee, app, admin, db, log, notify_update

MAIL_KEY = os.getenv("MAIL_ENCRYPTION_KEY")
_fernet = None
if MAIL_KEY:
    try:
        _fernet = Fernet(MAIL_KEY.strip().encode())
    except Exception as ex:
        print(f"[MAIL SETUP ERROR] MAIL_ENCRYPTION_KEY ungültig, E-Mail-Modul bleibt deaktiviert: {type(ex).__name__}: {ex}", flush=True)


def mail_enabled(_: Employee = Depends(admin)):
    if not _fernet:
        raise HTTPException(503, "E-Mail-Modul nicht konfiguriert (MAIL_ENCRYPTION_KEY fehlt oder ungültig).")
    return _


def encrypt_password(raw: str) -> str:
    return _fernet.encrypt(raw.encode()).decode()


def decrypt_password(enc: str) -> str:
    return _fernet.decrypt(enc.encode()).decode()


class MailAccount(Base):
    __tablename__ = "mail_konten"
    id: Mapped[int] = mapped_column(primary_key=True)
    address: Mapped[str] = mapped_column(String(255), unique=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    app_password_encrypted: Mapped[str] = mapped_column(Text)
    imap_host: Mapped[str] = mapped_column(String(120), default="imap.gmail.com")
    imap_port: Mapped[int] = mapped_column(Integer, default=993)
    smtp_host: Mapped[str] = mapped_column(String(120), default="smtp.gmail.com")
    smtp_port: Mapped[int] = mapped_column(Integer, default=587)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_uid: Mapped[int] = mapped_column(Integer, default=0)
    signature: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MailTemplate(Base):
    __tablename__ = "mail_vorlagen"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    subject: Mapped[str] = mapped_column(String(255), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("mitarbeiter.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MailMessage(Base):
    __tablename__ = "mail_nachrichten"
    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("mail_konten.id"))
    uid: Mapped[int] = mapped_column(Integer, default=0)
    message_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    in_reply_to: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    sender_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sender_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    to_addrs: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subject: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    body_text: Mapped[str] = mapped_column(Text, default="")
    direction: Mapped[str] = mapped_column(String(10), default="in")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


def serialize_message(x: MailMessage) -> dict:
    return {
        "id": x.id, "account_id": x.account_id, "message_id": x.message_id,
        "sender_name": x.sender_name, "sender_email": x.sender_email, "to_addrs": x.to_addrs,
        "subject": x.subject, "body_text": x.body_text, "direction": x.direction,
        "is_read": x.is_read, "received_at": x.received_at.isoformat(),
    }


def _decode(raw) -> str:
    if raw is None: return ""
    parts = decode_header(raw)
    out = []
    for text, enc in parts:
        if isinstance(text, bytes): out.append(text.decode(enc or "utf-8", errors="replace"))
        else: out.append(text)
    return "".join(out)


def _extract_body(msg) -> str:
    if msg.is_multipart():
        plain, html = None, None
        for part in msg.walk():
            ctype = part.get_content_type()
            if part.get_filename(): continue
            if ctype == "text/plain" and plain is None:
                try: plain = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace")
                except Exception: pass
            elif ctype == "text/html" and html is None:
                try: html = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace")
                except Exception: pass
        if plain is not None: return plain
        if html is not None: return re.sub("<[^>]+>", " ", html)
        return ""
    try: text = msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", errors="replace")
    except Exception: return str(msg.get_payload())
    return re.sub("<[^>]+>", " ", text) if msg.get_content_type() == "text/html" else text


def poll_account(account_id: int):
    from .app import SessionLocal
    with SessionLocal() as s:
        acc = s.get(MailAccount, account_id)
        if not acc or not acc.active: return
        try:
            password = decrypt_password(acc.app_password_encrypted)
            imap = imaplib.IMAP4_SSL(acc.imap_host, acc.imap_port)
            imap.login(acc.address, password)
            imap.select("INBOX")
            _, data = imap.uid("search", None, f"UID {acc.last_uid + 1}:*")
            uids = [int(u) for u in data[0].split()] if data and data[0] else []
            uids = [u for u in uids if u > acc.last_uid]
            new_any = False
            for u in sorted(uids):
                exists = s.scalar(select(MailMessage).where(MailMessage.account_id == acc.id, MailMessage.uid == u))
                if exists: continue
                _, msgdata = imap.uid("fetch", str(u), "(RFC822)")
                if not msgdata or not msgdata[0]: continue
                raw = msgdata[0][1]
                msg = email.message_from_bytes(raw)
                name, addr = parseaddr(_decode(msg.get("From")))
                m = MailMessage(
                    account_id=acc.id, uid=u, message_id=msg.get("Message-ID"),
                    in_reply_to=msg.get("In-Reply-To"), sender_name=name or None, sender_email=addr or None,
                    to_addrs=_decode(msg.get("To")), subject=_decode(msg.get("Subject")),
                    body_text=_extract_body(msg)[:20000], direction="in", is_read=False,
                    received_at=datetime.utcnow(),
                )
                s.add(m)
                acc.last_uid = max(acc.last_uid, u)
                new_any = True
            imap.logout()
            s.commit()
            if new_any: notify_update("mail")
        except Exception as ex:
            print(f"[MAIL POLL ERROR] {acc.address}: {type(ex).__name__}: {ex}", flush=True)


def poll_loop():
    while True:
        time.sleep(90)
        try:
            from .app import SessionLocal
            with SessionLocal() as s:
                ids = list(s.scalars(select(MailAccount.id).where(MailAccount.active.is_(True))))
            for aid in ids:
                poll_account(aid)
        except Exception as ex:
            print(f"[MAIL POLL LOOP ERROR] {type(ex).__name__}: {ex}", flush=True)


_poll_thread_started = False


def start_poll_thread():
    global _poll_thread_started
    if _poll_thread_started or not _fernet: return
    _poll_thread_started = True
    threading.Thread(target=poll_loop, daemon=True).start()


@app.on_event("startup")
def _mail_startup():
    start_poll_thread()


class MailAccountIn(BaseModel):
    address: str
    display_name: str = ""
    app_password: str = Field(min_length=4)


class MailSendIn(BaseModel):
    to: str = Field(min_length=3)
    subject: str = ""
    body: str = ""
    in_reply_to: Optional[str] = None


@app.get("/api/mail/accounts")
def list_mail_accounts(e: Employee = Depends(mail_enabled), s: Session = Depends(db)):
    rows = s.scalars(select(MailAccount).order_by(MailAccount.created_at)).all()
    out = []
    for a in rows:
        cnt = len(list(s.scalars(select(MailMessage.id).where(MailMessage.account_id == a.id, MailMessage.is_read.is_(False), MailMessage.direction == "in"))))
        out.append({"id": a.id, "address": a.address, "display_name": a.display_name, "active": a.active, "unread_count": cnt, "signature": a.signature})
    return out


class SignatureIn(BaseModel): signature: str = ""
@app.put("/api/mail/accounts/{account_id}/signature", dependencies=[Depends(mail_enabled)])
def update_mail_signature(account_id: int, data: SignatureIn, e: Employee = Depends(admin), s: Session = Depends(db)):
    acc = s.get(MailAccount, account_id)
    if not acc: raise HTTPException(404, "Postfach nicht gefunden")
    acc.signature = data.signature or None; s.commit()
    return {"status": "ok"}


class MailTemplateIn(BaseModel): name: str = Field(min_length=1, max_length=120); subject: str = ""; body: str = ""
@app.get("/api/mail/templates", dependencies=[Depends(mail_enabled)])
def list_mail_templates(e: Employee = Depends(admin), s: Session = Depends(db)):
    return [{"id": t.id, "name": t.name, "subject": t.subject, "body": t.body} for t in s.scalars(select(MailTemplate).order_by(MailTemplate.name))]
@app.post("/api/mail/templates", dependencies=[Depends(mail_enabled)])
def create_mail_template(data: MailTemplateIn, e: Employee = Depends(admin), s: Session = Depends(db)):
    item = MailTemplate(**data.model_dump(), created_by=e.id); s.add(item); log(s, e, "E-Mail-Vorlage angelegt", item.name); s.commit()
    return {"id": item.id, "name": item.name, "subject": item.subject, "body": item.body}
@app.delete("/api/mail/templates/{template_id}", dependencies=[Depends(mail_enabled)])
def delete_mail_template(template_id: int, e: Employee = Depends(admin), s: Session = Depends(db)):
    item = s.get(MailTemplate, template_id)
    if not item: raise HTTPException(404, "Vorlage nicht gefunden")
    s.delete(item); log(s, e, "E-Mail-Vorlage gelöscht", item.name); s.commit()
    return {"status": "deleted"}


@app.post("/api/mail/accounts")
def create_mail_account(data: MailAccountIn, e: Employee = Depends(mail_enabled), s: Session = Depends(db)):
    try:
        imap = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        imap.login(data.address, data.app_password)
        imap.logout()
    except Exception as ex:
        raise HTTPException(422, f"IMAP-Login fehlgeschlagen, bitte Adresse/App-Passwort prüfen: {ex}")
    item = MailAccount(address=data.address, display_name=data.display_name or data.address, app_password_encrypted=encrypt_password(data.app_password))
    s.add(item); log(s, e, "Postfach hinzugefügt", item.address); s.commit(); notify_update("mail")
    start_poll_thread()
    return {"id": item.id, "address": item.address, "display_name": item.display_name}


@app.delete("/api/mail/accounts/{account_id}")
def delete_mail_account(account_id: int, e: Employee = Depends(mail_enabled), s: Session = Depends(db)):
    acc = s.get(MailAccount, account_id)
    if not acc: raise HTTPException(404, "Postfach nicht gefunden")
    for m in s.scalars(select(MailMessage).where(MailMessage.account_id == account_id)): s.delete(m)
    s.delete(acc); log(s, e, "Postfach entfernt", acc.address); s.commit(); notify_update("mail")
    return {"status": "deleted"}


@app.post("/api/mail/accounts/{account_id}/poll")
def poll_mail_account_now(account_id: int, e: Employee = Depends(mail_enabled), s: Session = Depends(db)):
    if not s.get(MailAccount, account_id): raise HTTPException(404, "Postfach nicht gefunden")
    poll_account(account_id)
    return {"status": "ok"}


@app.get("/api/mail/accounts/{account_id}/messages")
def list_mail_messages(account_id: int, limit: int = 100, offset: int = 0, e: Employee = Depends(mail_enabled), s: Session = Depends(db)):
    rows = s.scalars(select(MailMessage).where(MailMessage.account_id == account_id).order_by(MailMessage.received_at.desc()).limit(limit).offset(offset))
    return [serialize_message(x) for x in rows]


@app.get("/api/mail/messages/{message_id}")
def get_mail_message(message_id: int, e: Employee = Depends(mail_enabled), s: Session = Depends(db)):
    m = s.get(MailMessage, message_id)
    if not m: raise HTTPException(404, "Nachricht nicht gefunden")
    if m.direction == "in" and not m.is_read:
        m.is_read = True; s.commit(); notify_update("mail")
    return serialize_message(m)


@app.delete("/api/mail/messages/{message_id}")
def delete_mail_message(message_id: int, e: Employee = Depends(mail_enabled), s: Session = Depends(db)):
    m = s.get(MailMessage, message_id)
    if not m: raise HTTPException(404, "Nachricht nicht gefunden")
    account_id = m.account_id
    s.delete(m); log(s, e, "E-Mail gelöscht", m.subject or ""); s.commit(); notify_update("mail")
    return {"status": "deleted", "account_id": account_id}


@app.post("/api/mail/accounts/{account_id}/send")
def send_mail(account_id: int, data: MailSendIn, e: Employee = Depends(mail_enabled), s: Session = Depends(db)):
    acc = s.get(MailAccount, account_id)
    if not acc: raise HTTPException(404, "Postfach nicht gefunden")
    password = decrypt_password(acc.app_password_encrypted)
    msg = MIMEText(data.body, _charset="utf-8")
    msg["Subject"] = data.subject
    msg["From"] = acc.address
    msg["To"] = data.to
    msg["Message-ID"] = f"<{uuid.uuid4().hex}@e1direktvertrieb.de>"
    if data.in_reply_to:
        msg["In-Reply-To"] = data.in_reply_to
        msg["References"] = data.in_reply_to
    try:
        with smtplib.SMTP(acc.smtp_host, acc.smtp_port) as smtp:
            smtp.starttls()
            smtp.login(acc.address, password)
            smtp.send_message(msg)
    except Exception as ex:
        raise HTTPException(500, f"E-Mail konnte nicht gesendet werden: {ex}")
    item = MailMessage(
        account_id=acc.id, uid=0, message_id=msg["Message-ID"], in_reply_to=data.in_reply_to,
        sender_name=acc.display_name, sender_email=acc.address, to_addrs=data.to, subject=data.subject,
        body_text=data.body, direction="out", is_read=True, received_at=datetime.utcnow(),
    )
    s.add(item); log(s, e, "E-Mail gesendet", f"{acc.address} -> {data.to}"); s.commit(); notify_update("mail")
    return serialize_message(item)
